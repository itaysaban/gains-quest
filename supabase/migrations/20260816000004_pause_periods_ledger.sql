-- M3 Epic 2, Story 2.5 (redesign 2026-08-16): replaces the "charge the full request upfront, refund
-- the unused portion on cancel" model with a ledger of actual pause periods, queried fresh whenever
-- quota is needed. The old model kept re-deriving "how many days were granted" from
-- streaks.paused_until - streaks.pause_started_at, which only stays correct if both fields are always
-- edited together — true for normal app use, but it's also just fragile in the way a manually
-- maintained running counter always is. This removes the counter entirely: pause_days_used_this_quarter
-- and pause_quarter_start on `streaks` are no longer written to by these functions and are superseded
-- by fn_pause_days_used_this_quarter(), which recomputes from real history every time it's called.
--
-- Per explicit user request: a day only counts as "used" if the user did not complete a session that
-- day. This was already true of the previous fix (20260816000003) for the *current* pause; the ledger
-- makes it true uniformly, including for past (already-ended) pauses this quarter.
create table public.pause_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at date not null,
  ended_at date not null, -- inclusive; corrected down to the real last day when cancelled early
  created_at timestamptz not null default now()
);

create index pause_periods_user_idx on public.pause_periods (user_id, ended_at);

alter table public.pause_periods enable row level security;
create policy "pause_periods_select_own" on public.pause_periods for select using (auth.uid() = user_id);
-- No client insert/update path — every row is written by SECURITY DEFINER functions only.
create policy "pause_periods_no_client_write" on public.pause_periods for insert with check (false);

-- Sums, across every pause_periods row overlapping the current quarter, the days that have actually
-- elapsed (strictly before today) and had no completed session. This is always a live recomputation,
-- never a stored/mutated value.
create or replace function public.fn_pause_days_used_this_quarter(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quarter_start date := date_trunc('quarter', current_date)::date;
  v_used int := 0;
  v_period record;
  v_check_date date;
begin
  -- Callers from within another SECURITY DEFINER function (e.g. fn_enable_pause_mode) already derived
  -- p_user_id from their own auth.uid(), so this trivially passes; a client calling this RPC directly
  -- with someone else's id does not.
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  for v_period in
    select started_at, ended_at from public.pause_periods
    where user_id = p_user_id and ended_at >= v_quarter_start
  loop
    for v_check_date in
      select generate_series(
        greatest(v_period.started_at, v_quarter_start),
        least(v_period.ended_at, current_date - 1),
        interval '1 day'
      )::date
    loop
      if not exists (
        select 1 from public.workout_sessions
        where user_id = p_user_id and status = 'completed'
          and coalesce(local_date, started_at::date) = v_check_date
      ) then
        v_used := v_used + 1;
      end if;
    end loop;
  end loop;

  return v_used;
end;
$$;

grant execute on function public.fn_pause_days_used_this_quarter(uuid) to authenticated;

create or replace function public.fn_enable_pause_mode(p_days int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_used int;
  v_remaining int;
  v_actual_days int;
  v_until date;
begin
  if p_days is null or p_days < 1 then
    raise exception 'Pause length must be at least 1 day';
  end if;
  if v_user_id is null then
    raise exception 'Not authorized';
  end if;

  v_used := public.fn_pause_days_used_this_quarter(v_user_id);
  v_remaining := greatest(0, 14 - v_used);
  if v_remaining = 0 then
    raise exception 'No pause days remaining this quarter';
  end if;

  v_actual_days := least(p_days, v_remaining);
  v_until := current_date + (v_actual_days - 1);

  insert into public.pause_periods (user_id, started_at, ended_at) values (v_user_id, current_date, v_until);

  update public.streaks set
    paused_until = v_until,
    pause_started_at = current_date,
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'paused_until', v_until,
    'days_granted', v_actual_days,
    'days_remaining_this_quarter', v_remaining - v_actual_days
  );
end;
$$;

drop function if exists public.fn_cancel_pause_mode();

create or replace function public.fn_cancel_pause_mode()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_paused_until date;
  v_pause_started_at date;
  v_new_ended_at date;
  v_days_granted int;
  v_days_used int := 0;
  v_check_date date;
begin
  if v_user_id is null then
    raise exception 'Not authorized';
  end if;

  select paused_until, pause_started_at
    into v_paused_until, v_pause_started_at
    from public.streaks where user_id = v_user_id for update;

  if v_paused_until is null or v_pause_started_at is null then
    raise exception 'No active pause to cancel';
  end if;

  v_days_granted := (v_paused_until - v_pause_started_at) + 1;
  -- Shrink the period's ended_at to whatever actually elapsed. If cancelled the same day it started,
  -- this lands before started_at, which naturally makes the period contribute 0 days to any future
  -- quota read (generate_series with end < start is empty) -- no special-casing needed.
  v_new_ended_at := least(v_paused_until, current_date - 1);

  update public.pause_periods
  set ended_at = v_new_ended_at
  where user_id = v_user_id and started_at = v_pause_started_at and ended_at = v_paused_until;

  for v_check_date in
    select generate_series(v_pause_started_at, v_new_ended_at, interval '1 day')::date
  loop
    if not exists (
      select 1 from public.workout_sessions
      where user_id = v_user_id and status = 'completed'
        and coalesce(local_date, started_at::date) = v_check_date
    ) then
      v_days_used := v_days_used + 1;
    end if;
  end loop;

  update public.streaks set
    paused_until = null,
    pause_started_at = null,
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('days_refunded', v_days_granted - v_days_used, 'days_used', v_days_used);
end;
$$;

grant execute on function public.fn_cancel_pause_mode() to authenticated;

-- M3 Epic 2, Story 2.5 (refined 2026-08-16): fn_cancel_pause_mode's refund was time-based only —
-- every elapsed day counted against the quota regardless of whether the user actually trained that
-- day. Per explicit user request: a pause day should only be charged if the user did NOT log a
-- completed session that day. Training through a paused day means the hold wasn't needed, so it's
-- free — only genuinely-used rest days consume the quarterly budget.
--
-- Still self-contained (drops first) regardless of whether 20260816000001's void->jsonb fix ever
-- reached production, since that history is uncertain at this point.
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
  v_used int;
  v_days_granted int;
  v_days_actually_used int := 0;
  v_refund int;
  v_check_date date;
begin
  if v_user_id is null then
    raise exception 'Not authorized';
  end if;

  select paused_until, pause_started_at, pause_days_used_this_quarter
    into v_paused_until, v_pause_started_at, v_used
    from public.streaks where user_id = v_user_id for update;

  if v_paused_until is null or v_pause_started_at is null then
    raise exception 'No active pause to cancel';
  end if;

  v_days_granted := (v_paused_until - v_pause_started_at) + 1;

  -- Walk every day the pause has actually elapsed so far (strictly before today -- today is still in
  -- progress, never charged). A day only counts against the quota if the user did NOT complete a
  -- session that day.
  for v_check_date in
    select generate_series(v_pause_started_at, least(v_paused_until, current_date - 1), interval '1 day')::date
  loop
    if not exists (
      select 1 from public.workout_sessions
      where user_id = v_user_id and status = 'completed'
        and coalesce(local_date, started_at::date) = v_check_date
    ) then
      v_days_actually_used := v_days_actually_used + 1;
    end if;
  end loop;

  v_refund := v_days_granted - v_days_actually_used;

  update public.streaks set
    paused_until = null,
    pause_started_at = null,
    pause_days_used_this_quarter = greatest(0, v_used - v_refund),
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('days_refunded', v_refund, 'days_used', v_days_actually_used);
end;
$$;

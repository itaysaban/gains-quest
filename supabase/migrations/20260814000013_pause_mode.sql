-- M3 Epic 2, Story 2.5: Pause Mode — an explicit, user-triggered hold on the streak counter, up to
-- 14 days per calendar quarter. Distinct from Story 2.1's weekly rest allowance (confirmed 2026-08-14,
-- see epics.md) — separate columns, separate state, never shared.
alter table public.streaks add column paused_until date;
alter table public.streaks add column pause_started_at date;
alter table public.streaks add column pause_days_used_this_quarter int not null default 0;
alter table public.streaks add column pause_quarter_start date;

-- Requests Pause Mode for the caller. Clamps an over-request to whatever's left in the quarter's
-- 14-day budget rather than rejecting it outright [decided 2026-08-14: clamp, not reject — consistent
-- with every other wellbeing mechanic in this epic]. Re-enabling while already paused simply
-- overwrites the existing window with the new one (no stacking) — the quota is spent on the new
-- request regardless of what the prior window would have used.
create or replace function public.fn_enable_pause_mode(p_days int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quarter_start date := date_trunc('quarter', current_date)::date;
  v_used int;
  v_pause_quarter_start date;
  v_remaining int;
  v_actual_days int;
  v_until date;
begin
  if p_days is null or p_days < 1 then
    raise exception 'Pause length must be at least 1 day';
  end if;

  select pause_days_used_this_quarter, pause_quarter_start into v_used, v_pause_quarter_start
    from public.streaks where user_id = v_user_id for update;

  if v_user_id is null then
    raise exception 'Not authorized';
  end if;

  -- New quarter since the counter was last touched — reset the budget.
  if v_pause_quarter_start is null or v_pause_quarter_start <> v_quarter_start then
    v_used := 0;
  end if;

  v_remaining := greatest(0, 14 - v_used);
  if v_remaining = 0 then
    raise exception 'No pause days remaining this quarter';
  end if;

  v_actual_days := least(p_days, v_remaining);
  v_until := current_date + (v_actual_days - 1);

  update public.streaks set
    paused_until = v_until,
    pause_started_at = current_date,
    pause_days_used_this_quarter = v_used + v_actual_days,
    pause_quarter_start = v_quarter_start,
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'paused_until', v_until,
    'days_granted', v_actual_days,
    'days_remaining_this_quarter', v_remaining - v_actual_days
  );
end;
$$;

grant execute on function public.fn_enable_pause_mode(int) to authenticated;

-- Story 2.5's hold, folded into fn_update_streak: any day within [pause_started_at, paused_until] is
-- frozen — the streak counter neither increments nor breaks for it, regardless of session activity.
-- Two places need the check: today itself (v_today), and any gap day the walk passes through when
-- evaluation resumes after the pause window has already ended.
create or replace function public.fn_update_streak(p_user_id uuid, p_local_date date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := p_local_date;
  v_last date;
  v_current int;
  v_longest int;
  v_freezes int;
  v_used_dates date[];
  v_rest_used int;
  v_rest_week_start date;
  v_goal_days smallint;
  v_rest_allowance int;
  v_check_date date;
  v_check_week_start date;
  v_broke boolean := false;
  v_pause_started date;
  v_paused_until date;
begin
  select s.last_workout_date, s.current_streak_days, s.longest_streak_days, s.freezes_banked,
         s.streak_freeze_used_dates, s.rest_used_this_week, s.rest_week_start, coalesce(p.weekly_goal_days, 3),
         s.pause_started_at, s.paused_until
    into v_last, v_current, v_longest, v_freezes, v_used_dates, v_rest_used, v_rest_week_start, v_goal_days,
         v_pause_started, v_paused_until
    from public.streaks s
    left join public.profiles p on p.id = s.user_id
    where s.user_id = p_user_id for update of s;

  -- Today falls inside an active pause window: a true hold — no increment, no break, no state change
  -- at all, even if a session was actually logged today. Evaluation resumes exactly where it left off
  -- once the window ends.
  if v_pause_started is not null and v_paused_until is not null
     and v_today between v_pause_started and v_paused_until then
    return;
  end if;

  v_rest_allowance := greatest(0, 7 - v_goal_days);

  if v_last is null then
    v_current := 1;
    v_rest_used := 0;
    v_rest_week_start := date_trunc('week', v_today)::date;
  elsif v_last >= v_today then
    return;
  else
    for v_check_date in select generate_series(v_last + 1, v_today - 1, interval '1 day')::date loop
      -- Gap day was held by Pause Mode — skip it entirely (no rest/freeze consumption, no break).
      if v_pause_started is not null and v_paused_until is not null
         and v_check_date between v_pause_started and v_paused_until then
        continue;
      end if;

      v_check_week_start := date_trunc('week', v_check_date)::date;
      if v_rest_week_start is null or v_check_week_start <> v_rest_week_start then
        v_rest_used := 0;
        v_rest_week_start := v_check_week_start;
      end if;

      if v_rest_used < v_rest_allowance then
        v_rest_used := v_rest_used + 1;
      elsif v_freezes > 0 then
        v_freezes := v_freezes - 1;
        v_used_dates := v_used_dates || v_check_date;
      else
        v_broke := true;
        exit;
      end if;
    end loop;

    v_check_week_start := date_trunc('week', v_today)::date;
    if v_rest_week_start is null or v_check_week_start <> v_rest_week_start then
      v_rest_used := 0;
      v_rest_week_start := v_check_week_start;
    end if;

    if v_broke then
      v_current := 1;
    else
      v_current := v_current + 1;
    end if;
  end if;

  if v_current > 0 and v_current % 7 = 0 then
    v_freezes := least(2, v_freezes + 1);
  end if;

  v_longest := greatest(v_longest, v_current);

  update public.streaks set
    current_streak_days = v_current,
    longest_streak_days = v_longest,
    last_workout_date = v_today,
    freezes_banked = v_freezes,
    streak_freeze_used_dates = v_used_dates,
    rest_used_this_week = v_rest_used,
    rest_week_start = v_rest_week_start,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

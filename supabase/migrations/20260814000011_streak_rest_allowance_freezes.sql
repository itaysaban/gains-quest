-- M3 Epic 2, Stories 2.1-2.4: rest allowance (derived from profiles.weekly_goal_days), earned
-- freezes, correct multi-day break evaluation, and a timezone-safe day boundary. These four are
-- combined in one migration because they all rewrite the same ~40-line fn_update_streak body —
-- four near-identical full redefinitions would be more repetitive than clarifying.
--
-- Story 2.1: profiles.weekly_goal_days already exists (smallint, 1-7, default 3, with a built
-- settings screen: "How many days a week do you want to train? This drives your streak...") —
-- discovered during implementation. No new profile column needed; rest_allowance = 7 - weekly_goal_days,
-- computed on the fly, never stored (avoids a second source of truth that could drift).
alter table public.streaks add column rest_used_this_week int not null default 0;
alter table public.streaks add column rest_week_start date;

-- Story 2.2: freezes_banked is the same concept as the existing streak_freezes_available column,
-- just renamed to match the PRD's vocabulary and re-capped at 2 (was uncapped/defaulted to 1).
alter table public.streaks rename column streak_freezes_available to freezes_banked;
update public.streaks set freezes_banked = least(2, freezes_banked);
alter table public.streaks alter column freezes_banked set default 0;

-- Story 2.4: fn_update_streak now takes the session's own device-local date (with the 4am grace
-- window already applied client-side — see lib/utils/date.ts's trainingLocalDate) instead of
-- current_date. This is a new two-arg overload, not a redefinition of the old one-arg function — a
-- default parameter doesn't make Postgres treat them as the same signature, and a 1-arg call still
-- resolves to the exact-arity match. Drop the old overload outright rather than leave it as dead code
-- that would silently run pre-Epic-2 streak logic if anything ever called it with 1 arg again.
drop function if exists public.fn_update_streak(uuid);

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
begin
  select s.last_workout_date, s.current_streak_days, s.longest_streak_days, s.freezes_banked,
         s.streak_freeze_used_dates, s.rest_used_this_week, s.rest_week_start, coalesce(p.weekly_goal_days, 3)
    into v_last, v_current, v_longest, v_freezes, v_used_dates, v_rest_used, v_rest_week_start, v_goal_days
    from public.streaks s
    left join public.profiles p on p.id = s.user_id
    where s.user_id = p_user_id for update of s;

  -- Story 2.1: rest_allowance = 7 - weekly_goal_days (e.g. goal 4 days/week -> 3 rest days/week).
  v_rest_allowance := greatest(0, 7 - v_goal_days);

  if v_last is null then
    -- First session ever.
    v_current := 1;
    v_rest_used := 0;
    v_rest_week_start := date_trunc('week', v_today)::date;
  elsif v_last >= v_today then
    -- Already recorded for this date (or a later one, e.g. an out-of-order recalculation) — no change.
    return;
  else
    -- Story 2.1/2.2/2.3: walk every day strictly between the last recorded day and today, consuming
    -- that week's rest allowance first, then a banked freeze, breaking the streak the moment neither
    -- is available for a given day. This — not a single gap-size comparison — is what correctly
    -- handles a gap spanning a week boundary (allowance resets mid-gap) or an allowance change.
    for v_check_date in select generate_series(v_last + 1, v_today - 1, interval '1 day')::date loop
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

    -- Also roll the weekly counter forward to today's week even if the loop above never ran
    -- (e.g. a same-week, zero-gap-day case where v_today is simply the day after v_last).
    v_check_week_start := date_trunc('week', v_today)::date;
    if v_rest_week_start is null or v_check_week_start <> v_rest_week_start then
      v_rest_used := 0;
      v_rest_week_start := v_check_week_start;
    end if;

    if v_broke then
      v_current := 1; -- Story 2.3: today's session starts a fresh streak in the same write that broke the old one.
    else
      v_current := v_current + 1;
    end if;
  end if;

  -- Story 2.2: bank a freeze at every 7 days of (uninterrupted, from today's perspective) streak.
  if v_current > 0 and v_current % 7 = 0 then
    v_freezes := least(2, v_freezes + 1);
  end if;

  -- Story 2.3: longest_streak_days only ever grows — a break never decreases it, "Best: N days"
  -- stays visible regardless of what current_streak_days does.
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

-- fn_complete_session now passes the session's own local_date (already recorded on
-- workout_sessions since M1, per Story 2.4). Everything else in this function is unchanged from
-- 20260814000010_point_reversal_recalc.sql.
create or replace function public.fn_complete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_total_volume numeric;
  v_total_sets int;
  v_started_at timestamptz;
  v_paused_seconds int;
  v_duration_seconds int;
  v_session_xp int;
  v_prs jsonb;
  v_new_badges jsonb;
  v_xp_before int;
  v_xp_after int;
  v_level_before int;
  v_level_after int;
  v_points_earned int;
  v_local_date date;
begin
  select user_id, started_at, paused_duration_seconds, coalesce(local_date, started_at::date)
    into v_user_id, v_started_at, v_paused_seconds, v_local_date
    from public.workout_sessions where id = p_session_id;

  if v_user_id is null then
    raise exception 'Session not found';
  end if;
  if v_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select coalesce(sum(coalesce(ls.weight, 0) * coalesce(ls.reps, 1)), 0), count(*)
    into v_total_volume, v_total_sets
    from public.logged_sets ls
    join public.session_exercises se on se.id = ls.session_exercise_id
    where se.session_id = p_session_id and ls.set_type <> 'warmup';

  select current_level, total_xp into v_level_before, v_xp_before from public.user_levels where user_id = v_user_id;

  v_duration_seconds := greatest(0, extract(epoch from (now() - v_started_at))::int - v_paused_seconds);

  update public.workout_sessions set
    status = 'completed',
    ended_at = now(),
    total_volume = v_total_volume,
    total_sets = v_total_sets
  where id = p_session_id;

  v_session_xp := 20 + least(v_total_sets, 20) * 2;
  insert into public.xp_events (user_id, session_id, event_type, xp_amount)
    values (v_user_id, p_session_id, 'session_completed', v_session_xp);

  -- Story 1.4's AC: a backfilled session (local_date before the date it was actually logged) must not
  -- repair a currently-broken streak, even if its local_date would otherwise fill the gap. Bug fix
  -- (2026-08-15, found via live-Postgres testing): earlier this called fn_update_streak with the
  -- backfilled local_date unconditionally, which let a late-logged session silently repair a break —
  -- a real regression against Story 1.4, introduced when Story 2.4 started threading local_date
  -- through. A backfilled completion now has zero effect on streak state (skipped entirely), not just
  -- a discount on points.
  if v_local_date is null or v_local_date >= v_started_at::date then
    perform public.fn_update_streak(v_user_id, v_local_date);
  end if;

  v_points_earned := public.fn_award_points_for_session(p_session_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'exercise_id', pr.exercise_id,
      'exercise_name', e.name,
      'record_type', pr.record_type,
      'value', pr.value
    )), '[]'::jsonb)
    into v_prs
    from public.personal_records pr
    join public.exercises e on e.id = pr.exercise_id
    where pr.session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'icon', b.icon, 'category', b.category)), '[]'::jsonb)
    into v_new_badges
    from public.fn_check_badges(v_user_id) b;

  select current_level, total_xp into v_level_after, v_xp_after from public.user_levels where user_id = v_user_id;

  update public.workout_sessions set xp_earned = (v_xp_after - coalesce(v_xp_before, 0)) where id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'duration_seconds', v_duration_seconds,
    'total_volume', v_total_volume,
    'total_sets', v_total_sets,
    'xp_earned', v_xp_after - coalesce(v_xp_before, 0),
    'leveled_up', v_level_after > coalesce(v_level_before, 1),
    'new_level', v_level_after,
    'points_earned', v_points_earned,
    'prs', v_prs,
    'new_badges', v_new_badges
  );
end;
$$;

grant execute on function public.fn_complete_session(uuid) to authenticated;

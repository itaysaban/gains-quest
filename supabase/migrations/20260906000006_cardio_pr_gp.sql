-- Cardio PRs, part 3: make best_pace earn the 100 GP personal-record award.
--
-- fn_award_points_for_session is ~185 lines and only one statement changes, so this body was
-- generated from the live pg_get_functiondef output with that single statement replaced, rather
-- than retyped by hand. Everything else is byte-identical to 20260814000010's definition.
--
-- Depends on fn_gp_earning_pr_count from 20260906000005.

CREATE OR REPLACE FUNCTION public.fn_award_points_for_session(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_routine_id uuid;
  v_local_date date;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_paused_seconds int;
  v_duration_seconds int;
  v_total_volume numeric;
  v_total_sets int;
  v_season_id text := to_char(current_date, 'YYYY-MM');
  v_base_points int := 0;
  v_volume_points int := 0;
  v_cardio_points int := 0;
  v_pr_points int := 0;
  v_pr_count int;
  v_routine_points int := 0;
  v_cardio_seconds int;
  v_current_streak int;
  v_multiplier numeric;
  v_planned_count int;
  v_planned_logged_count int;
  v_points_earned int := 0;
  v_trivial_session boolean;
  v_today_earned int;
  v_headroom int;
  v_scale numeric;
  v_is_backfilled boolean;
  v_flagged boolean := false;
  v_exercise record;
  v_prior_max_weight numeric;
  v_prior_session_count int;
  v_session_max_weight numeric;
begin
  select user_id, routine_id, started_at, ended_at, paused_duration_seconds, local_date, total_volume, total_sets
    into v_user_id, v_routine_id, v_started_at, v_ended_at, v_paused_seconds, v_local_date, v_total_volume, v_total_sets
    from public.workout_sessions where id = p_session_id;

  if v_user_id is null then
    raise exception 'Session not found';
  end if;

  -- Uses ended_at (frozen once set) rather than now() — this function runs both at initial
  -- completion (ended_at was just set by the caller) and, later, at recalculation time, when now()
  -- would otherwise include all the elapsed time since the workout actually ended.
  v_duration_seconds := greatest(0, extract(epoch from (coalesce(v_ended_at, now()) - v_started_at))::int - v_paused_seconds);

  v_trivial_session := v_duration_seconds < 60 and v_total_sets < 2;
  if v_trivial_session then
    return 0;
  end if;

  v_is_backfilled := v_local_date is not null and v_local_date < v_started_at::date;

  for v_exercise in
    select distinct se.exercise_id
    from public.logged_sets ls
    join public.session_exercises se on se.id = ls.session_exercise_id
    where se.session_id = p_session_id and ls.set_type <> 'warmup' and ls.weight is not null
  loop
    -- Story 1.4's AC requires "established history (>=3 prior sessions)" before flagging — the
    -- original implementation flagged on any single prior session, a real gap against the documented
    -- threshold, found via live-Postgres testing and confirmed with the user 2026-08-15.
    select max(ls2.weight), count(distinct ws2.id) into v_prior_max_weight, v_prior_session_count
      from public.logged_sets ls2
      join public.session_exercises se2 on se2.id = ls2.session_exercise_id
      join public.workout_sessions ws2 on ws2.id = se2.session_id
      where se2.exercise_id = v_exercise.exercise_id
        and ws2.user_id = v_user_id
        and ws2.id <> p_session_id
        and ws2.started_at < v_started_at
        and ls2.set_type <> 'warmup'
        and ls2.weight is not null;

    if v_prior_max_weight is not null and v_prior_session_count >= 3 then
      select max(ls3.weight) into v_session_max_weight
        from public.logged_sets ls3
        join public.session_exercises se3 on se3.id = ls3.session_exercise_id
        where se3.session_id = p_session_id and se3.exercise_id = v_exercise.exercise_id
          and ls3.set_type <> 'warmup' and ls3.weight is not null;

      if v_session_max_weight > v_prior_max_weight * 1.4 then
        v_flagged := true;
        exit;
      end if;
    end if;
  end loop;

  select current_streak_days into v_current_streak from public.streaks where user_id = v_user_id;
  v_multiplier := case
    when coalesce(v_current_streak, 0) >= 30 then 1.4
    when v_current_streak >= 7 then 1.25
    when v_current_streak >= 3 then 1.1
    else 1.0
  end;

  if v_total_sets > 0 or v_duration_seconds >= 600 then
    v_base_points := 50;
  end if;

  v_volume_points := least(150, floor(v_total_volume / 500)::int);

  select coalesce(sum(ls.time_seconds), 0) into v_cardio_seconds
    from public.logged_sets ls
    join public.session_exercises se on se.id = ls.session_exercise_id
    join public.exercises e on e.id = se.exercise_id
    where se.session_id = p_session_id and ls.set_type <> 'warmup'
      and e.tracking_type in ('time', 'distance_duration');
  v_cardio_points := least(120, floor(v_cardio_seconds / 60.0)::int);

  -- Was an inline count filtered to record_type = 'est_1rm'. Extracted to
  -- fn_gp_earning_pr_count (20260906000005) so cardio's best_pace earns GP too, and so the set of
  -- GP-earning record types lives in one place instead of inside this function.
  v_pr_count := public.fn_gp_earning_pr_count(p_session_id);
  v_pr_points := least(3, coalesce(v_pr_count, 0)) * 100;

  if v_routine_id is not null then
    select count(*) into v_planned_count from public.session_exercises where session_id = p_session_id;
    select count(distinct se.id) into v_planned_logged_count
      from public.session_exercises se
      join public.logged_sets ls on ls.session_exercise_id = se.id
      where se.session_id = p_session_id;
    if v_planned_count > 0 and v_planned_logged_count = v_planned_count then
      v_routine_points := 25;
    end if;
  end if;

  v_base_points := round(v_base_points * v_multiplier)::int;
  v_volume_points := round(v_volume_points * v_multiplier)::int;
  v_cardio_points := round(v_cardio_points * v_multiplier)::int;
  v_pr_points := round(v_pr_points * v_multiplier)::int;
  v_routine_points := round(v_routine_points * v_multiplier)::int;

  if v_is_backfilled then
    v_base_points := floor(v_base_points * 0.5)::int;
    v_volume_points := floor(v_volume_points * 0.5)::int;
    v_cardio_points := floor(v_cardio_points * 0.5)::int;
    v_pr_points := floor(v_pr_points * 0.5)::int;
    v_routine_points := floor(v_routine_points * 0.5)::int;
  end if;

  v_points_earned := v_base_points + v_volume_points + v_cardio_points + v_pr_points + v_routine_points;

  select coalesce(sum(points), 0) into v_today_earned
    from public.point_ledger
    where user_id = v_user_id
      and source in ('base', 'volume', 'cardio', 'pr', 'routine')
      and created_at::date = current_date;

  v_headroom := greatest(0, 400 - v_today_earned);

  if v_points_earned > v_headroom then
    v_scale := v_headroom::numeric / nullif(v_points_earned, 0);
    v_base_points := floor(v_base_points * v_scale)::int;
    v_volume_points := floor(v_volume_points * v_scale)::int;
    v_cardio_points := floor(v_cardio_points * v_scale)::int;
    v_pr_points := floor(v_pr_points * v_scale)::int;
    v_routine_points := floor(v_routine_points * v_scale)::int;
    v_points_earned := v_base_points + v_volume_points + v_cardio_points + v_pr_points + v_routine_points;
  end if;

  if v_base_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id, excluded_from_ranking) values (v_user_id, 'base', p_session_id, v_base_points, v_season_id, v_flagged);
  end if;
  if v_volume_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id, excluded_from_ranking) values (v_user_id, 'volume', p_session_id, v_volume_points, v_season_id, v_flagged);
  end if;
  if v_cardio_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id, excluded_from_ranking) values (v_user_id, 'cardio', p_session_id, v_cardio_points, v_season_id, v_flagged);
  end if;
  if v_pr_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id, excluded_from_ranking) values (v_user_id, 'pr', p_session_id, v_pr_points, v_season_id, v_flagged);
  end if;
  if v_routine_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id, excluded_from_ranking) values (v_user_id, 'routine', p_session_id, v_routine_points, v_season_id, v_flagged);
  end if;

  return v_points_earned;
end;
$function$
;

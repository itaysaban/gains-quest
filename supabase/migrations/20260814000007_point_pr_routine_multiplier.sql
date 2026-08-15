-- M3 Epic 1, Story 1.2: award PR and routine-completion GainPoints, and apply the streak multiplier
-- to every session-sourced point source. Still additive alongside the old XP system (see
-- 20260814000006_point_ledger.sql's header comment — unchanged by this migration).
--
-- Restructures Story 1.1's point-awarding block: points are now computed first, then a single
-- streak multiplier is applied to every source (PRD 6.2: "session-sourced GP is multiplied... before
-- being recorded"), and only then inserted — so base/volume/cardio's multiplier catches up to match
-- pr/routine's from the start, not applied only to the two new sources.
create or replace function public.fn_complete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_routine_id uuid;
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
  v_points_earned int;
begin
  select user_id, routine_id, started_at, paused_duration_seconds
    into v_user_id, v_routine_id, v_started_at, v_paused_seconds
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

  perform public.fn_update_streak(v_user_id);

  -- GainPoints (M3 Epic 1). Compute every source's raw points first, then apply the streak
  -- multiplier once to all of them, then insert.
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

  -- Personal record: 100 GP per exercise that set a new estimated-1RM record this session, capped
  -- at 3 exercises. Scoped to est_1rm specifically (not max_weight/max_reps_at_weight) per PRD 6.2.
  select count(distinct exercise_id) into v_pr_count
    from public.personal_records
    where session_id = p_session_id and record_type = 'est_1rm';
  v_pr_points := least(3, coalesce(v_pr_count, 0)) * 100;

  -- Routine completion: every exercise currently in the session (planned at start, or added
  -- mid-session — the schema doesn't distinguish the two) has at least one logged set. Only
  -- applies to routine-based sessions, not quick-start ones.
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

  if v_base_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id) values (v_user_id, 'base', p_session_id, v_base_points, v_season_id);
  end if;
  if v_volume_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id) values (v_user_id, 'volume', p_session_id, v_volume_points, v_season_id);
  end if;
  if v_cardio_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id) values (v_user_id, 'cardio', p_session_id, v_cardio_points, v_season_id);
  end if;
  if v_pr_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id) values (v_user_id, 'pr', p_session_id, v_pr_points, v_season_id);
  end if;
  if v_routine_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id) values (v_user_id, 'routine', p_session_id, v_routine_points, v_season_id);
  end if;

  v_points_earned := v_base_points + v_volume_points + v_cardio_points + v_pr_points + v_routine_points;

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

-- M3 Epic 1, Story 1.5: reverse points on session delete, recalculate on edit.
--
-- No client-reachable "delete a completed session" or "edit a completed session" flow exists yet in
-- this app (checked: progress/session/[sessionId].tsx is read-only, useDiscardSession only ever
-- targets an in-progress session). FR10/FR11 are backend-mechanism requirements, not new-screen
-- requirements, so this story ships the server capability + a thin client hook, matching how
-- point_ledger itself shipped in Story 1.1 without a UI destination yet — wiring an actual
-- delete/edit-completed-session UI is a separate, later concern.
--
-- Refactor: the points-computation block that's been growing across Stories 1.1-1.4 is extracted
-- into fn_award_points_for_session(), a self-contained helper (reads everything it needs off the
-- already-persisted workout_sessions row) — both fn_complete_session and the new
-- fn_recalculate_session_points below call it, instead of a third copy-pasted block.
create or replace function public.fn_award_points_for_session(p_session_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
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

  select count(distinct exercise_id) into v_pr_count
    from public.personal_records
    where session_id = p_session_id and record_type = 'est_1rm';
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
$$;

-- Reverses every non-achievement point_ledger entry attributed to a session, by inserting negative
-- counterpart entries in the SAME source/season as the original (so season-scoped totals — M4 —
-- stay correct even if the reversal happens in a later season than the original award).
create or replace function public.fn_reverse_session_points(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
begin
  for v_entry in
    select user_id, source, achievement_id, points, season_id
    from public.point_ledger
    where session_id = p_session_id and points > 0
  loop
    insert into public.point_ledger (user_id, source, session_id, achievement_id, points, season_id, excluded_from_ranking)
      values (v_entry.user_id, v_entry.source, p_session_id, v_entry.achievement_id, -v_entry.points, v_entry.season_id, false);
  end loop;
end;
$$;

-- FR10: deleting a completed session reverses its points, then removes it (cascades to
-- session_exercises/logged_sets; point_ledger.session_id is ON DELETE SET NULL, so the reversal
-- entries above survive with their season/points intact, just losing the session link).
create or replace function public.fn_delete_completed_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status public.session_status;
begin
  select user_id, status into v_user_id, v_status from public.workout_sessions where id = p_session_id;

  if v_user_id is null then
    raise exception 'Session not found';
  end if;
  if v_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;
  if v_status <> 'completed' then
    raise exception 'Only a completed session can be deleted this way — use discard for an in-progress one';
  end if;

  perform public.fn_reverse_session_points(p_session_id);
  delete from public.workout_sessions where id = p_session_id;
end;
$$;

grant execute on function public.fn_delete_completed_session(uuid) to authenticated;

-- FR11: editing a completed session within 48h of completion triggers point recalculation —
-- reverses the old award and re-runs fn_award_points_for_session with the (by-then-updated)
-- logged_sets/total_volume/total_sets. Sessions older than 48h are rejected outright rather than
-- silently doing nothing, so a caller always gets an explicit signal either way.
create or replace function public.fn_recalculate_session_points(p_session_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status public.session_status;
  v_ended_at timestamptz;
  v_total_volume numeric;
  v_total_sets int;
begin
  select user_id, status, ended_at into v_user_id, v_status, v_ended_at from public.workout_sessions where id = p_session_id;

  if v_user_id is null then
    raise exception 'Session not found';
  end if;
  if v_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;
  if v_status <> 'completed' then
    raise exception 'Session is not completed';
  end if;
  if v_ended_at is null or v_ended_at < now() - interval '48 hours' then
    raise exception 'Session was completed more than 48 hours ago — recalculation window has passed';
  end if;

  select coalesce(sum(coalesce(ls.weight, 0) * coalesce(ls.reps, 1)), 0), count(*)
    into v_total_volume, v_total_sets
    from public.logged_sets ls
    join public.session_exercises se on se.id = ls.session_exercise_id
    where se.session_id = p_session_id and ls.set_type <> 'warmup';

  update public.workout_sessions set total_volume = v_total_volume, total_sets = v_total_sets where id = p_session_id;

  perform public.fn_reverse_session_points(p_session_id);
  return public.fn_award_points_for_session(p_session_id);
end;
$$;

grant execute on function public.fn_recalculate_session_points(uuid) to authenticated;

-- fn_complete_session now delegates its GainPoints block to the shared helper above — same
-- behavior as Story 1.4, just de-duplicated.
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
begin
  select user_id, started_at, paused_duration_seconds
    into v_user_id, v_started_at, v_paused_seconds
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

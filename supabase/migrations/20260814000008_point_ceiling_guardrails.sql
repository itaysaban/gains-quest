-- M3 Epic 1, Story 1.3: enforce the 400 GP/calendar-day session ceiling (clamped, not rejected;
-- achievement-source points are exempt by construction — the cap sum below only ever includes
-- base/volume/cardio/pr/routine) and the trivial-session guardrail (< 60s AND < 2 completed sets
-- earns zero GP — an AND of both thresholds, not either alone).
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
  v_points_earned int := 0;
  v_trivial_session boolean;
  v_today_earned int;
  v_headroom int;
  v_scale numeric;
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

  -- Trivial-session guardrail: PRD 6.9 anti-gaming — under 60s AND fewer than 2 completed sets
  -- earns zero GP. Both conditions must hold; a long session with 1 set, or a fast session with 3,
  -- still earns normally.
  v_trivial_session := v_duration_seconds < 60 and v_total_sets < 2;

  if not v_trivial_session then
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

    v_points_earned := v_base_points + v_volume_points + v_cardio_points + v_pr_points + v_routine_points;

    -- 400 GP/day ceiling, session-sourced only (achievement points are a separate source, never
    -- summed here, so they're exempt by construction rather than by a special-case check). Clamped
    -- proportionally across sources rather than rejected outright.
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
  end if;

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

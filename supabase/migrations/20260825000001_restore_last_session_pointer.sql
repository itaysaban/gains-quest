-- Fix a real P0 regression, found by live user testing: "did a leg exercise, did it again, didn't
-- show the last one" — the always-visible last-time row (PRD §6.1.3, "the feature the product lives
-- or dies on") reads exercise_current_best.last_session_exercise_id (useLastSessionSets.ts), which
-- fn_complete_session is supposed to stamp on every session completion. That stamping block existed
-- from 20260814000005_exercise_current_best.sql onward, but was silently dropped when
-- fn_complete_session was rewritten in 20260817000001_drop_legacy_xp_system.sql (to strip the old
-- XP bookkeeping) — every redefinition since (20260820000001_social_feed.sql, and this file) copied
-- forward from that already-broken version, so the pointer has never been re-stamped since. No
-- scenario test ever asserted on this specific column, so nothing caught it until now.
--
-- fn_complete_session (last defined 20260820000001_social_feed.sql): identical body, with the
-- missing "stamp last_session_exercise_id for every exercise touched" block restored immediately
-- before the return, in the same place and shape it had in 20260814000005.
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
  v_prs jsonb;
  v_new_badges jsonb;
  v_points_earned int;
  v_local_date date;
  v_workout_type text;
  v_pr_count int;
  v_first_pr jsonb;
begin
  select user_id, started_at, paused_duration_seconds, coalesce(local_date, started_at::date), workout_type
    into v_user_id, v_started_at, v_paused_seconds, v_local_date, v_workout_type
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

  v_duration_seconds := greatest(0, extract(epoch from (now() - v_started_at))::int - v_paused_seconds);

  update public.workout_sessions set
    status = 'completed',
    ended_at = now(),
    total_volume = v_total_volume,
    total_sets = v_total_sets
  where id = p_session_id;

  -- Story 1.4's AC: a backfilled session must not repair a currently-broken streak (see
  -- 20260814000011 for the full history of this guard).
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

  insert into public.feed_events (user_id, event_type, session_id, metadata)
    values (v_user_id, 'session_completed', p_session_id, jsonb_build_object(
      'duration_seconds', v_duration_seconds,
      'total_sets', v_total_sets,
      'workout_type', v_workout_type
    ));

  v_pr_count := jsonb_array_length(v_prs);
  if v_pr_count > 0 then
    v_first_pr := v_prs -> 0;
    insert into public.feed_events (user_id, event_type, session_id, metadata)
      values (v_user_id, 'pr_set', p_session_id, jsonb_build_object(
        'exercise_name', v_first_pr ->> 'exercise_name',
        'record_type', v_first_pr ->> 'record_type',
        'pr_count', v_pr_count
      ));
  end if;

  -- Restored: stamp the "last completed session" pointer for every exercise touched, powering the
  -- next session's always-visible last-time row (useLastSessionSets.ts) via one indexed lookup
  -- instead of a historical scan.
  insert into public.exercise_current_best (user_id, exercise_id, last_session_exercise_id, last_session_completed_at, updated_at)
  select v_user_id, se.exercise_id, se.id, now(), now()
  from public.session_exercises se
  where se.session_id = p_session_id
  on conflict (user_id, exercise_id) do update set
    last_session_exercise_id = excluded.last_session_exercise_id,
    last_session_completed_at = excluded.last_session_completed_at,
    updated_at = now();

  return jsonb_build_object(
    'session_id', p_session_id,
    'duration_seconds', v_duration_seconds,
    'total_volume', v_total_volume,
    'total_sets', v_total_sets,
    'points_earned', v_points_earned,
    'prs', v_prs,
    'new_badges', v_new_badges
  );
end;
$$;

grant execute on function public.fn_complete_session(uuid) to authenticated;

-- One-time repair for the window the pointer sat frozen (since 2026-08-17): backfill every user's
-- exercise_current_best row to their actual most-recent completed session for that exercise, same
-- DISTINCT ON approach 20260814000005's original backfill used. Idempotent and safe to re-run.
update public.exercise_current_best ecb set
  last_session_exercise_id = ranked.session_exercise_id,
  last_session_completed_at = ranked.completed_at
from (
  select distinct on (se.user_id, se.exercise_id)
    se.user_id, se.exercise_id, se.id as session_exercise_id, ws.started_at as completed_at
  from public.session_exercises se
  join public.workout_sessions ws on ws.id = se.session_id
  where ws.status = 'completed'
  order by se.user_id, se.exercise_id, ws.started_at desc
) ranked
where ecb.user_id = ranked.user_id and ecb.exercise_id = ranked.exercise_id
  and (ecb.last_session_exercise_id is distinct from ranked.session_exercise_id
    or ecb.last_session_completed_at is distinct from ranked.completed_at);

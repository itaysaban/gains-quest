-- M3 Epic 2, Story 2.3 (remaining piece): recalculate streak state on session delete/edit — the
-- streak-side half of NFR2's "exact, idempotent recalculation" (Epic 1 Story 1.5 already covers the
-- points-side half).
--
-- fn_update_streak's day-by-day walk is inherently sequential/stateful — each call depends on the
-- state the previous call left behind. A deletion or edit in the middle of a user's session history
-- can't be "patched" in place without risking drift from the real history. The only exact,
-- idempotent way to guarantee correctness is a full deterministic replay: reset the streak row to a
-- clean slate, then re-run fn_update_streak once per completed session, in local_date order. Rare
-- operation (only fires on an explicit delete/edit), so the O(session count) cost is acceptable.
create or replace function public.fn_rebuild_streak(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
begin
  update public.streaks set
    current_streak_days = 0,
    longest_streak_days = 0,
    last_workout_date = null,
    freezes_banked = 0,
    streak_freeze_used_dates = '{}',
    rest_used_this_week = 0,
    rest_week_start = null,
    updated_at = now()
  where user_id = p_user_id;
  -- paused_until / pause-day tracking (Story 2.5) is untouched — it isn't derived from session
  -- history, so a session delete/edit has no bearing on it.

  for v_session in
    select coalesce(local_date, started_at::date) as effective_date
    from public.workout_sessions
    where user_id = p_user_id and status = 'completed'
    order by coalesce(local_date, started_at::date) asc, started_at asc
  loop
    perform public.fn_update_streak(p_user_id, v_session.effective_date);
  end loop;
end;
$$;

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
  perform public.fn_rebuild_streak(v_user_id);
end;
$$;

grant execute on function public.fn_delete_completed_session(uuid) to authenticated;

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
  v_points int;
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
  v_points := public.fn_award_points_for_session(p_session_id);
  -- An edit can change which day(s) had a completed session in edge cases (e.g. a session's sets
  -- moving it from "trivial, earns nothing" to real, or vice versa doesn't change its date — but a
  -- full rebuild is cheap and guarantees exactness regardless, matching NFR2).
  perform public.fn_rebuild_streak(v_user_id);

  return v_points;
end;
$$;

grant execute on function public.fn_recalculate_session_points(uuid) to authenticated;

-- M3 Epic 1, Story 1.1: GainPoints ledger — base + volume + cardio session points.
--
-- Strictly additive. The existing xp_events/user_levels/level_thresholds system, the per-set XP
-- insert in fn_process_logged_set, and fn_complete_session's existing session-completion XP insert
-- are all left completely unchanged and still running — point_ledger inserts happen alongside them,
-- not instead of them. Home's stat tile and the Achievements screen still read the old tables; they
-- have nothing to switch to yet. The hard cutover (drop old tables/functions, swap Home + Achievements
-- to read GP) is a later story (epics.md, Epic 3 Story 3.3), once Epics 1 and 2's data is verified
-- live and correct and the new Hall UI exists to display it.

create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('base', 'volume', 'cardio', 'pr', 'routine', 'achievement')),
  session_id uuid references public.workout_sessions(id) on delete set null,
  achievement_id uuid references public.badges(id) on delete set null,
  points int not null,
  -- Calendar-month string (e.g. "2026-08"). Nothing consumes this yet — seasons/leaderboards are M4 —
  -- but it must exist on every row from day one so M4 doesn't need a ledger backfill.
  season_id text not null,
  created_at timestamptz not null default now()
);

create index point_ledger_user_idx on public.point_ledger (user_id, created_at desc);
create index point_ledger_session_idx on public.point_ledger (session_id);

alter table public.point_ledger enable row level security;
create policy "point_ledger_select_own" on public.point_ledger for select using (auth.uid() = user_id);
-- No client insert/update/delete path at all — every row is written by SECURITY DEFINER functions only.
create policy "point_ledger_no_client_write" on public.point_ledger for insert with check (false);

-- Redefines fn_complete_session (originally 20260811000008_functions_triggers.sql) to additionally
-- award GainPoints. Everything above the "GainPoints" comment block is unchanged from the prior
-- definition — same XP, same streak call, same PR/badge aggregation, same return fields — with one
-- new field (`points_earned`) appended so the RPC's return shape is stable for later Epic 1 stories.
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
  v_season_id text := to_char(current_date, 'YYYY-MM');
  v_base_points int := 0;
  v_volume_points int := 0;
  v_cardio_points int := 0;
  v_cardio_seconds int;
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

  -- GainPoints (M3 Epic 1, Story 1.1): base + volume + cardio, in addition to the XP just awarded above.
  -- PRD 6.2: base session (50 GP, >=1 completed working set OR >=10 min activity, once per session).
  if v_total_sets > 0 or v_duration_seconds >= 600 then
    v_base_points := 50;
    insert into public.point_ledger (user_id, source, session_id, points, season_id)
      values (v_user_id, 'base', p_session_id, v_base_points, v_season_id);
  end if;

  -- Strength volume: 1 GP per 500kg working-set volume, capped at 150.
  v_volume_points := least(150, floor(v_total_volume / 500)::int);
  if v_volume_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id)
      values (v_user_id, 'volume', p_session_id, v_volume_points, v_season_id);
  end if;

  -- Cardio/duration: 1 GP per active minute, capped at 120. "Active minutes" = logged time on
  -- time-tracked or distance+time-tracked exercises (running, rowing, plank), warm-ups excluded —
  -- not the session's overall wall-clock duration, which includes rest between strength sets.
  select coalesce(sum(ls.time_seconds), 0) into v_cardio_seconds
    from public.logged_sets ls
    join public.session_exercises se on se.id = ls.session_exercise_id
    join public.exercises e on e.id = se.exercise_id
    where se.session_id = p_session_id and ls.set_type <> 'warmup'
      and e.tracking_type in ('time', 'distance_duration');

  v_cardio_points := least(120, floor(v_cardio_seconds / 60.0)::int);
  if v_cardio_points > 0 then
    insert into public.point_ledger (user_id, source, session_id, points, season_id)
      values (v_user_id, 'cardio', p_session_id, v_cardio_points, v_season_id);
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
    'points_earned', v_base_points + v_volume_points + v_cardio_points,
    'prs', v_prs,
    'new_badges', v_new_badges
  );
end;
$$;

grant execute on function public.fn_complete_session(uuid) to authenticated;

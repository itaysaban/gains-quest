-- Denormalized "current best per exercise" cache. Powers two hot, correctness-sensitive client reads
-- that would otherwise require scanning personal_records/session history on every exercise-card render
-- during an active session: (1) instant client-side PR comparison, (2) the always-visible last-time row.
create table public.exercise_current_best (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,

  best_weight numeric,
  best_weight_reps int,
  best_weight_logged_set_id uuid references public.logged_sets(id) on delete set null,
  best_weight_achieved_at timestamptz,

  best_est_1rm numeric,
  best_est_1rm_weight numeric,
  best_est_1rm_reps int,
  best_est_1rm_logged_set_id uuid references public.logged_sets(id) on delete set null,
  best_est_1rm_achieved_at timestamptz,

  best_set_weight numeric,
  best_set_reps int,
  best_set_volume numeric,
  best_set_logged_set_id uuid references public.logged_sets(id) on delete set null,
  best_set_achieved_at timestamptz,

  -- Points at the session_exercises row from the most recently COMPLETED session containing this
  -- exercise, so the client can fetch that exact previous session's full set list in one indexed query
  -- (logged_sets.session_exercise_id already has an index) instead of a "most recent session with X" scan.
  last_session_exercise_id uuid references public.session_exercises(id) on delete set null,
  last_session_completed_at timestamptz,

  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_current_best enable row level security;
create policy "exercise_current_best_select_own" on public.exercise_current_best for select using (auth.uid() = user_id);
-- Same pattern as personal_records/xp_events: writes only via SECURITY DEFINER functions below.
create policy "exercise_current_best_no_client_write" on public.exercise_current_best for insert with check (false);
create policy "exercise_current_best_no_client_update" on public.exercise_current_best for update using (false);

-- Redefines fn_process_logged_set (last defined in 20260814000004) to also maintain the cache above,
-- reusing values already computed earlier in the same function — no extra queries.
create or replace function public.fn_process_logged_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exercise_id uuid;
  v_session_id uuid;
  v_est_1rm numeric;
  v_set_volume numeric;
  v_xp int;
  v_is_pr boolean := false;
  v_current_max_weight numeric;
  v_current_max_1rm numeric;
  v_current_max_reps_at_weight int;
  v_current_best_set_volume numeric;
begin
  select se.exercise_id, se.session_id into v_exercise_id, v_session_id
    from public.session_exercises se where se.id = new.session_exercise_id;

  if new.set_type = 'warmup' then
    insert into public.xp_events (user_id, session_id, logged_set_id, event_type, xp_amount, metadata)
    values (new.user_id, v_session_id, new.id, 'set_logged', 2, jsonb_build_object('warmup', true));
    return new;
  end if;

  select max(value) into v_current_max_weight from public.personal_records
    where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'max_weight';
  if new.weight is not null and (v_current_max_weight is null or new.weight > v_current_max_weight) then
    insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
    values (new.user_id, v_exercise_id, 'max_weight', new.weight, jsonb_build_object('reps', new.reps), new.id, v_session_id, new.completed_at);
    v_is_pr := true;
  end if;

  if new.set_type = 'working' and new.reps between 1 and 12 then
    v_est_1rm := public.epley_1rm(new.weight, new.reps);
    if v_est_1rm is not null then
      select max(value) into v_current_max_1rm from public.personal_records
        where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'est_1rm';
      if v_current_max_1rm is null or v_est_1rm > v_current_max_1rm then
        insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
        values (new.user_id, v_exercise_id, 'est_1rm', v_est_1rm, jsonb_build_object('weight', new.weight, 'reps', new.reps), new.id, v_session_id, new.completed_at);
        v_is_pr := true;
      end if;
    end if;
  end if;

  if new.weight is not null and new.reps is not null then
    select max((context ->> 'reps')::int) into v_current_max_reps_at_weight
      from public.personal_records
      where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'max_reps_at_weight'
        and value = new.weight;
    if v_current_max_reps_at_weight is null or new.reps > v_current_max_reps_at_weight then
      insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
      values (new.user_id, v_exercise_id, 'max_reps_at_weight', new.weight, jsonb_build_object('reps', new.reps), new.id, v_session_id, new.completed_at);
      v_is_pr := true;
    end if;
  end if;

  v_set_volume := coalesce(new.weight, 0) * coalesce(new.reps, 1);
  if new.weight is not null and new.reps is not null then
    select max(value) into v_current_best_set_volume from public.personal_records
      where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'best_set_volume';
    if v_current_best_set_volume is null or v_set_volume > v_current_best_set_volume then
      insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
      values (new.user_id, v_exercise_id, 'best_set_volume', v_set_volume, jsonb_build_object('weight', new.weight, 'reps', new.reps), new.id, v_session_id, new.completed_at);
      v_is_pr := true;
    end if;
  end if;

  if v_is_pr then
    update public.logged_sets set is_pr = true where id = new.id;
  end if;

  v_xp := public.fn_calculate_set_xp(new.user_id, v_exercise_id, new.weight, new.reps, new.rpe, new.set_type);

  insert into public.xp_events (user_id, session_id, logged_set_id, event_type, xp_amount, metadata)
  values (new.user_id, v_session_id, new.id, 'set_logged', v_xp, jsonb_build_object('is_pr', v_is_pr));

  -- Maintain the current-best cache: an upsert whose CASE guards only ever improve a value, never
  -- regress it, so replaying/editing a set is always safe.
  insert into public.exercise_current_best (
    user_id, exercise_id,
    best_weight, best_weight_reps, best_weight_logged_set_id, best_weight_achieved_at,
    best_est_1rm, best_est_1rm_weight, best_est_1rm_reps, best_est_1rm_logged_set_id, best_est_1rm_achieved_at,
    best_set_weight, best_set_reps, best_set_volume, best_set_logged_set_id, best_set_achieved_at,
    updated_at
  ) values (
    new.user_id, v_exercise_id,
    new.weight, new.reps, new.id, new.completed_at,
    v_est_1rm, new.weight, new.reps, new.id, new.completed_at,
    new.weight, new.reps, v_set_volume, new.id, new.completed_at,
    now()
  )
  on conflict (user_id, exercise_id) do update set
    best_weight = case when new.weight is not null and (exercise_current_best.best_weight is null or new.weight > exercise_current_best.best_weight)
                        then new.weight else exercise_current_best.best_weight end,
    best_weight_reps = case when new.weight is not null and (exercise_current_best.best_weight is null or new.weight > exercise_current_best.best_weight)
                        then new.reps else exercise_current_best.best_weight_reps end,
    best_weight_logged_set_id = case when new.weight is not null and (exercise_current_best.best_weight is null or new.weight > exercise_current_best.best_weight)
                        then new.id else exercise_current_best.best_weight_logged_set_id end,
    best_weight_achieved_at = case when new.weight is not null and (exercise_current_best.best_weight is null or new.weight > exercise_current_best.best_weight)
                        then new.completed_at else exercise_current_best.best_weight_achieved_at end,

    best_est_1rm = case when v_est_1rm is not null and (exercise_current_best.best_est_1rm is null or v_est_1rm > exercise_current_best.best_est_1rm)
                        then v_est_1rm else exercise_current_best.best_est_1rm end,
    best_est_1rm_weight = case when v_est_1rm is not null and (exercise_current_best.best_est_1rm is null or v_est_1rm > exercise_current_best.best_est_1rm)
                        then new.weight else exercise_current_best.best_est_1rm_weight end,
    best_est_1rm_reps = case when v_est_1rm is not null and (exercise_current_best.best_est_1rm is null or v_est_1rm > exercise_current_best.best_est_1rm)
                        then new.reps else exercise_current_best.best_est_1rm_reps end,
    best_est_1rm_logged_set_id = case when v_est_1rm is not null and (exercise_current_best.best_est_1rm is null or v_est_1rm > exercise_current_best.best_est_1rm)
                        then new.id else exercise_current_best.best_est_1rm_logged_set_id end,
    best_est_1rm_achieved_at = case when v_est_1rm is not null and (exercise_current_best.best_est_1rm is null or v_est_1rm > exercise_current_best.best_est_1rm)
                        then new.completed_at else exercise_current_best.best_est_1rm_achieved_at end,

    best_set_weight = case when new.weight is not null and new.reps is not null and (exercise_current_best.best_set_volume is null or v_set_volume > exercise_current_best.best_set_volume)
                        then new.weight else exercise_current_best.best_set_weight end,
    best_set_reps = case when new.weight is not null and new.reps is not null and (exercise_current_best.best_set_volume is null or v_set_volume > exercise_current_best.best_set_volume)
                        then new.reps else exercise_current_best.best_set_reps end,
    best_set_volume = case when new.weight is not null and new.reps is not null and (exercise_current_best.best_set_volume is null or v_set_volume > exercise_current_best.best_set_volume)
                        then v_set_volume else exercise_current_best.best_set_volume end,
    best_set_logged_set_id = case when new.weight is not null and new.reps is not null and (exercise_current_best.best_set_volume is null or v_set_volume > exercise_current_best.best_set_volume)
                        then new.id else exercise_current_best.best_set_logged_set_id end,
    best_set_achieved_at = case when new.weight is not null and new.reps is not null and (exercise_current_best.best_set_volume is null or v_set_volume > exercise_current_best.best_set_volume)
                        then new.completed_at else exercise_current_best.best_set_achieved_at end,

    updated_at = now();

  return new;
end;
$$;

-- Redefines fn_complete_session (originally 20260811000008) to also stamp last_session_exercise_id for
-- every exercise touched in the session that just completed — the pointer the last-time row reads.
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

  -- Stamp the "last completed session" pointer for every exercise touched, powering the next session's
  -- always-visible last-time row via one indexed lookup instead of a historical scan.
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
    'xp_earned', v_xp_after - coalesce(v_xp_before, 0),
    'leveled_up', v_level_after > coalesce(v_level_before, 1),
    'new_level', v_level_after,
    'prs', v_prs,
    'new_badges', v_new_badges
  );
end;
$$;

grant execute on function public.fn_complete_session(uuid) to authenticated;

-- One-time backfill so existing users/data aren't blank on day one.
insert into public.exercise_current_best (user_id, exercise_id, best_weight, best_weight_achieved_at, best_est_1rm, best_est_1rm_achieved_at, best_set_volume, best_set_achieved_at, updated_at)
select user_id, exercise_id,
  max(value) filter (where record_type = 'max_weight'),
  max(achieved_at) filter (where record_type = 'max_weight'),
  max(value) filter (where record_type = 'est_1rm'),
  max(achieved_at) filter (where record_type = 'est_1rm'),
  max(value) filter (where record_type = 'session_volume'), -- best available proxy pre-migration
  max(achieved_at) filter (where record_type = 'session_volume'),
  now()
from public.personal_records
group by user_id, exercise_id
on conflict (user_id, exercise_id) do nothing;

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
where ecb.user_id = ranked.user_id and ecb.exercise_id = ranked.exercise_id;

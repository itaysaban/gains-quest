-- Fix for 20260817000001_drop_legacy_xp_system.sql: production reported
-- `ERROR: 42P01: relation "public.xp_events" does not exist` on that migration.
--
-- Root cause: `drop trigger if exists xp_events_update_level on public.xp_events;` has `IF EXISTS`
-- on the *trigger*, but Postgres still requires the *table* named after ON to exist just to parse
-- the statement — IF EXISTS never covers a missing table there, only a missing trigger on an
-- existing one. Every other statement in that migration (`create or replace function`, and every
-- other `drop ... if exists`) is genuinely idempotent; this one line was the sole gap. Confirmed by
-- checking the disposable test project this session has used throughout: it has already gone
-- through the same migration history and currently has zero legacy XP tables but all four
-- redefined functions present and correct — the same state production's error implies.
--
-- Not edited in place — 20260817000001 already touched a real deployment target (this error came
-- from running it against production), so per this session's own standing rule it's fixed forward
-- in a new migration instead, same pattern used for every other "found a bug after deploying/
-- touching a target" case this session.
--
-- The original script has no explicit BEGIN/COMMIT, so depending on how the SQL editor executed a
-- multi-statement paste, the four `create or replace function` calls that precede the failing line
-- may or may not have already committed. Rather than assume either way, this file is a complete,
-- safe, standalone replacement for the whole original migration: the function bodies below are
-- byte-for-byte identical to 20260817000001's (a repeat CREATE OR REPLACE is always harmless), and
-- the guarded trigger drop only acts if the table actually exists.

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
  v_is_pr boolean := false;
  v_current_max_weight numeric;
  v_current_max_1rm numeric;
  v_current_max_reps_at_weight int;
  v_current_best_set_volume numeric;
begin
  select se.exercise_id, se.session_id into v_exercise_id, v_session_id
    from public.session_exercises se where se.id = new.session_exercise_id;

  if new.set_type = 'warmup' then
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

create or replace function public.fn_check_badges(p_user_id uuid)
returns setof public.badges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge record;
  v_matched boolean;
  v_streak record;
  v_count int;
  v_max_weight numeric;
  v_season_id text := to_char(current_date, 'YYYY-MM');
  v_cumulative_volume numeric;
  v_max_routine_completions int;
  v_distinct_types int;
begin
  select * into v_streak from public.streaks where user_id = p_user_id;

  for v_badge in
    select b.* from public.badges b
    where not exists (select 1 from public.user_badges ub where ub.user_id = p_user_id and ub.badge_id = b.id)
  loop
    v_matched := false;

    case v_badge.criteria ->> 'type'
      when 'streak_days' then
        v_matched := coalesce(v_streak.longest_streak_days, 0) >= (v_badge.criteria ->> 'value')::int;

      when 'exercise_count_created' then
        select count(*) into v_count from public.exercises where user_id = p_user_id and is_system = false;
        v_matched := v_count >= (v_badge.criteria ->> 'value')::int;

      when 'session_count' then
        select count(*) into v_count from public.workout_sessions where user_id = p_user_id and status = 'completed';
        v_matched := v_count >= (v_badge.criteria ->> 'value')::int;

      when 'max_weight_for_exercise' then
        select max(pr.value) into v_max_weight
          from public.personal_records pr
          join public.exercises e on e.id = pr.exercise_id
          where pr.user_id = p_user_id and pr.record_type = 'max_weight'
            and lower(e.name) = lower(v_badge.criteria ->> 'exercise_name');
        v_matched := v_max_weight is not null and v_max_weight >= (v_badge.criteria ->> 'value')::numeric;

      when 'cumulative_volume_kg' then
        select coalesce(sum(coalesce(ls.weight, 0) * coalesce(ls.reps, 1)), 0) into v_cumulative_volume
          from public.logged_sets ls
          join public.session_exercises se on se.id = ls.session_exercise_id
          join public.workout_sessions ws on ws.id = se.session_id
          where ws.user_id = p_user_id and ws.status = 'completed' and ls.set_type <> 'warmup';
        v_matched := v_cumulative_volume >= (v_badge.criteria ->> 'value')::numeric;

      when 'custom_routine_completions' then
        select max(cnt) into v_max_routine_completions
          from (
            select routine_id, count(*) as cnt
            from public.workout_sessions
            where user_id = p_user_id and status = 'completed' and routine_id is not null
            group by routine_id
          ) t;
        v_matched := coalesce(v_max_routine_completions, 0) >= (v_badge.criteria ->> 'value')::int;

      when 'distinct_workout_types_in_week' then
        select count(distinct workout_type) into v_distinct_types
          from public.workout_sessions
          where user_id = p_user_id and status = 'completed' and workout_type is not null
            and started_at >= now() - interval '7 days';
        v_matched := coalesce(v_distinct_types, 0) >= (v_badge.criteria ->> 'value')::int;

      when 'cardio_time_for_distance' then
        select exists (
          select 1 from public.logged_sets ls
          join public.session_exercises se on se.id = ls.session_exercise_id
          join public.workout_sessions ws on ws.id = se.session_id
          where ws.user_id = p_user_id and ws.status = 'completed' and ls.set_type <> 'warmup'
            and ls.distance_meters >= (v_badge.criteria ->> 'distance_km')::numeric * 1000
            and ls.time_seconds > 0
            and ls.time_seconds <= (v_badge.criteria ->> 'max_minutes')::numeric * 60
        ) into v_matched;

      when 'est_1rm_beaten_consecutive_sessions' then
        select exists (
          select 1
          from (
            select
              se.exercise_id,
              ws.id as session_id,
              row_number() over (partition by se.exercise_id order by ws.started_at desc) as rn,
              exists (
                select 1 from public.personal_records pr
                where pr.session_id = ws.id and pr.exercise_id = se.exercise_id and pr.record_type = 'est_1rm'
              ) as set_pr_this_session
            from public.workout_sessions ws
            join public.session_exercises se on se.session_id = ws.id
            where ws.user_id = p_user_id and ws.status = 'completed'
              and exists (
                select 1 from public.logged_sets ls
                where ls.session_exercise_id = se.id and ls.set_type = 'working'
              )
            group by se.exercise_id, ws.id, ws.started_at
          ) ranked
          where rn <= (v_badge.criteria ->> 'value')::int
          group by exercise_id
          having bool_and(set_pr_this_session) and count(*) = (v_badge.criteria ->> 'value')::int
        ) into v_matched;

      when 'friend_count' then
        v_matched := false;

      else
        v_matched := false;
    end case;

    if v_matched then
      insert into public.user_badges (user_id, badge_id) values (p_user_id, v_badge.id) on conflict do nothing;
      insert into public.point_ledger (user_id, source, achievement_id, points, season_id)
        values (p_user_id, 'achievement', v_badge.id, v_badge.points, v_season_id);
      return next v_badge;
    end if;
  end loop;

  return;
end;
$$;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  insert into public.streaks (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'xp_events') then
    execute 'drop trigger if exists xp_events_update_level on public.xp_events';
  end if;
end
$$;

drop function if exists public.fn_update_user_level();
drop function if exists public.fn_calculate_set_xp(uuid, uuid, numeric, int, numeric, public.set_type);

alter table public.workout_sessions drop column if exists xp_earned;

drop table if exists public.user_levels;
drop table if exists public.xp_events;
drop table if exists public.level_thresholds;
drop type if exists public.xp_event_type;

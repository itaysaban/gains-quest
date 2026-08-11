-- Bootstraps profile + gamification rows the moment a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  insert into public.user_levels (user_id) values (new.id);
  insert into public.streaks (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Epley formula: est. 1RM = weight * (1 + reps/30)
create or replace function public.epley_1rm(p_weight numeric, p_reps int)
returns numeric
language sql
immutable
as $$
  select case when p_weight is null or p_reps is null or p_reps <= 0 then null
              else p_weight * (1 + p_reps / 30.0) end;
$$;

-- XP per working set: scaled by volume relative to the user's own trailing baseline for that exercise
-- (so all fitness levels progress fairly), and by effort (RPE) if provided. Warm-ups get flat XP.
-- Tunable here without touching client code.
create or replace function public.fn_calculate_set_xp(
  p_user_id uuid,
  p_exercise_id uuid,
  p_weight numeric,
  p_reps int,
  p_rpe numeric,
  p_set_type public.set_type
) returns int
language plpgsql
as $$
declare
  base_xp constant int := 10;
  v_volume numeric;
  v_trailing_avg numeric;
  v_effort_multiplier numeric := 1.0;
  v_volume_multiplier numeric := 1.0;
  v_xp numeric;
begin
  if p_set_type = 'warmup' then
    return 2;
  end if;

  v_volume := coalesce(p_weight, 0) * coalesce(p_reps, 1);

  select avg(coalesce(ls.weight, 0) * coalesce(ls.reps, 1))
    into v_trailing_avg
    from public.logged_sets ls
    join public.session_exercises se on se.id = ls.session_exercise_id
    where se.user_id = p_user_id
      and se.exercise_id = p_exercise_id
      and ls.set_type <> 'warmup'
      and ls.completed_at > now() - interval '90 days';

  if v_trailing_avg is null or v_trailing_avg = 0 then
    v_volume_multiplier := 1.0; -- first time logging this exercise: neutral baseline
  else
    v_volume_multiplier := 0.5 + 0.5 * least(v_volume / v_trailing_avg, 2);
  end if;

  if p_rpe is not null then
    v_effort_multiplier := greatest(0.8, least(1.3, 1 + (p_rpe - 7) * 0.05));
  end if;

  v_xp := base_xp * v_volume_multiplier * v_effort_multiplier;
  return greatest(1, round(v_xp)::int);
end;
$$;

-- Authoritative per-set processing: PR detection + XP award.
-- Runs on INSERT only (edits to an already-logged set don't retroactively replay XP/PR — keeps the ledger simple
-- and avoids double-counting; the edited value is still reflected in session totals via fn_complete_session).
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
  v_xp int;
  v_is_pr boolean := false;
  v_current_max_weight numeric;
  v_current_max_1rm numeric;
  v_current_max_reps_at_weight int;
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

  if v_is_pr then
    update public.logged_sets set is_pr = true where id = new.id;
  end if;

  v_xp := public.fn_calculate_set_xp(new.user_id, v_exercise_id, new.weight, new.reps, new.rpe, new.set_type);

  insert into public.xp_events (user_id, session_id, logged_set_id, event_type, xp_amount, metadata)
  values (new.user_id, v_session_id, new.id, 'set_logged', v_xp, jsonb_build_object('is_pr', v_is_pr));

  return new;
end;
$$;

create trigger logged_sets_process_after_insert
after insert on public.logged_sets
for each row execute function public.fn_process_logged_set();

-- Recomputes the cached user_levels row whenever new XP lands
create or replace function public.fn_update_user_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_xp int;
  v_level int;
  v_next_threshold int;
  v_current_threshold int;
begin
  select coalesce(sum(xp_amount), 0) into v_total_xp from public.xp_events where user_id = new.user_id;

  select max(level) into v_level from public.level_thresholds where xp_required <= v_total_xp;
  v_level := coalesce(v_level, 1);

  select xp_required into v_current_threshold from public.level_thresholds where level = v_level;
  select xp_required into v_next_threshold from public.level_thresholds where level = v_level + 1;

  insert into public.user_levels (user_id, total_xp, current_level, xp_into_level, xp_for_next_level, updated_at)
  values (
    new.user_id, v_total_xp, v_level,
    v_total_xp - coalesce(v_current_threshold, 0),
    coalesce(v_next_threshold, v_total_xp) - coalesce(v_current_threshold, 0),
    now()
  )
  on conflict (user_id) do update set
    total_xp = excluded.total_xp,
    current_level = excluded.current_level,
    xp_into_level = excluded.xp_into_level,
    xp_for_next_level = excluded.xp_for_next_level,
    updated_at = now();

  return new;
end;
$$;

create trigger xp_events_update_level
after insert on public.xp_events
for each row execute function public.fn_update_user_level();

-- Streak = consecutive calendar days with a completed session. A missed single day is forgiven once
-- via a streak-freeze (gentle loss-aversion per PRD 5.2) rather than resetting the count to zero.
create or replace function public.fn_update_streak(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
  v_last date;
  v_current int;
  v_longest int;
  v_freezes int;
  v_used_dates date[];
begin
  select last_workout_date, current_streak_days, longest_streak_days, streak_freezes_available, streak_freeze_used_dates
    into v_last, v_current, v_longest, v_freezes, v_used_dates
    from public.streaks where user_id = p_user_id for update;

  if v_last is null then
    v_current := 1;
  elsif v_last = v_today then
    return; -- already logged today, no change
  elsif v_last = v_today - 1 then
    v_current := v_current + 1;
  elsif v_last = v_today - 2 and v_freezes > 0 then
    v_current := v_current + 1;
    v_freezes := v_freezes - 1;
    v_used_dates := v_used_dates || (v_today - 1);
  else
    v_current := 1;
  end if;

  v_longest := greatest(v_longest, v_current);

  update public.streaks set
    current_streak_days = v_current,
    longest_streak_days = v_longest,
    last_workout_date = v_today,
    streak_freezes_available = v_freezes,
    streak_freeze_used_dates = v_used_dates,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- Evaluates every not-yet-unlocked badge's criteria for a user; unlocks and awards bonus XP for any that now match.
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

      else
        v_matched := false;
    end case;

    if v_matched then
      insert into public.user_badges (user_id, badge_id) values (p_user_id, v_badge.id) on conflict do nothing;
      insert into public.xp_events (user_id, event_type, xp_amount, metadata)
        values (p_user_id, 'badge_unlocked', 25, jsonb_build_object('badge_code', v_badge.code));
      return next v_badge;
    end if;
  end loop;

  return;
end;
$$;

-- Finish-workout entrypoint. Aggregates the session (warm-ups excluded), awards completion XP,
-- advances the streak, checks badges, and returns everything the summary screen needs in one round trip.
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

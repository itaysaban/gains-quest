-- Persist e1RM on the set row itself (previously computed on the fly, never stored) so exercise-history
-- queries don't need to recompute it, and so it's available for the "best_est_1rm" cache in the next
-- migration without an extra function call per read.
alter table public.logged_sets add column e1rm_kg numeric;

-- PRD 6.1.4: "Only working sets between 1 and 12 reps count toward e1RM." Interpreted literally —
-- set_type = 'working' specifically (excludes drop/failure sets from e1RM, unlike max_weight/max_reps
-- PRs which still consider them).
create or replace function public.fn_set_e1rm()
returns trigger
language plpgsql
as $$
begin
  if new.set_type = 'working' and new.reps between 1 and 12 then
    new.e1rm_kg := public.epley_1rm(new.weight, new.reps);
  else
    new.e1rm_kg := null;
  end if;
  return new;
end;
$$;

create trigger logged_sets_set_e1rm
before insert or update on public.logged_sets
for each row execute function public.fn_set_e1rm();

-- Redefines fn_process_logged_set (originally 20260811000008_functions_triggers.sql) to:
--   1. Gate est_1rm PR detection to set_type = 'working' with 1-12 reps (previously ungated — a bug:
--      any non-warmup set, including a 1-rep max-effort single or a 20-rep burnout, could set an
--      "est_1rm PR" even though Epley's formula is unreliable outside ~1-12 reps).
--   2. Add best_set_volume PR detection (single-set weight*reps, independent of whole-session volume).
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

  return new;
end;
$$;

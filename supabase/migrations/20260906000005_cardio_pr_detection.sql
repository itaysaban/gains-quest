-- Cardio personal records, part 2: detection and GP. Requires 20260906000004 (the enum values) to
-- have been applied in an earlier transaction.
--
-- Implemented as a SEPARATE after-insert trigger rather than by editing fn_process_logged_set. That
-- function is ~120 lines, most of it an exercise_current_best upsert that has nothing to do with
-- cardio; redefining it wholesale to add one block would mean retyping all of that with no way to
-- diff it, which is exactly how transcription bugs get introduced. Two triggers on the same table
-- both setting is_pr is safe — the flag is idempotent and neither reads the other's work.
--
-- PACE MODEL (PRD §11, resolved 2026-09-06 — "pace at or above a distance"):
-- A run counts toward every band up to its own distance, so a 10 km run offers its average pace as a
-- candidate for the 10k, 5k and 1k records at once. This is athletically honest — holding a pace for
-- longer is strictly harder, so it deserves to count for the shorter band too — and it is the only
-- model the data supports: logged_sets stores total distance and total time, with no splits, so
-- "your fastest 5 km inside a 10 km run" is not computable here.
--
-- Pace is stored as SECONDS PER KILOMETRE, where LOWER IS BETTER. Every other record type in this
-- table is "higher is better", so anything that aggregates personal_records generically must special
-- case this one — that is why the band lives in context rather than being folded into value.

create or replace function public.fn_pace_bands()
returns int[]
language sql
immutable
as $$ select array[1000, 5000, 10000, 21097, 42195] $$;

comment on function public.fn_pace_bands() is
  'Distance bands in metres for cardio pace records: 1k, 5k, 10k, half marathon, full marathon.';

create or replace function public.fn_process_cardio_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exercise_id uuid;
  v_session_id uuid;
  v_is_pr boolean := false;
  v_pace numeric;
  v_band int;
  v_current_best numeric;
begin
  -- Warmups are excluded from PR detection everywhere else (§6.1.4); a warm-up jog is not a record.
  if new.set_type = 'warmup' then
    return new;
  end if;

  select se.exercise_id, se.session_id into v_exercise_id, v_session_id
    from public.session_exercises se where se.id = new.session_exercise_id;

  -- Longest distance.
  if new.distance_meters is not null and new.distance_meters > 0 then
    select max(value) into v_current_best from public.personal_records
      where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'longest_distance';
    if v_current_best is null or new.distance_meters > v_current_best then
      insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
      values (new.user_id, v_exercise_id, 'longest_distance', new.distance_meters,
              jsonb_build_object('duration_s', new.time_seconds), new.id, v_session_id, new.completed_at);
      v_is_pr := true;
    end if;
  end if;

  -- Longest duration.
  if new.time_seconds is not null and new.time_seconds > 0 then
    select max(value) into v_current_best from public.personal_records
      where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'longest_duration';
    if v_current_best is null or new.time_seconds > v_current_best then
      insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
      values (new.user_id, v_exercise_id, 'longest_duration', new.time_seconds,
              jsonb_build_object('distance_m', new.distance_meters), new.id, v_session_id, new.completed_at);
      v_is_pr := true;
    end if;
  end if;

  -- Best pace, per band up to the distance covered.
  if new.distance_meters is not null and new.distance_meters > 0
     and new.time_seconds is not null and new.time_seconds > 0 then
    v_pace := (new.time_seconds * 1000.0) / new.distance_meters;   -- seconds per km, lower is better

    foreach v_band in array public.fn_pace_bands() loop
      exit when v_band > new.distance_meters;

      -- min(), not max(): pace is the one record type where lower wins.
      select min(value) into v_current_best from public.personal_records
        where user_id = new.user_id and exercise_id = v_exercise_id and record_type = 'best_pace'
          and (context ->> 'band_m')::int = v_band;

      if v_current_best is null or v_pace < v_current_best then
        insert into public.personal_records (user_id, exercise_id, record_type, value, context, logged_set_id, session_id, achieved_at)
        values (new.user_id, v_exercise_id, 'best_pace', v_pace,
                jsonb_build_object('band_m', v_band, 'distance_m', new.distance_meters, 'duration_s', new.time_seconds),
                new.id, v_session_id, new.completed_at);
        v_is_pr := true;
      end if;
    end loop;
  end if;

  if v_is_pr then
    update public.logged_sets set is_pr = true where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists logged_sets_process_cardio_after_insert on public.logged_sets;
create trigger logged_sets_process_cardio_after_insert
after insert on public.logged_sets
for each row execute function public.fn_process_cardio_set();

-- GP for cardio records. Redefining fn_award_points_for_session wholesale would mean reproducing
-- ~150 lines to change one WHERE clause, so the PR count is extracted into its own function that the
-- award path calls instead. Anything that needs to change about which records earn GP now changes
-- here, in one place.
--
-- best_pace earns; longest_distance and longest_duration do not. That mirrors the strength side,
-- where est_1rm earns but max_weight and best_set_volume do not: GP goes to records that mean you
-- got BETTER, not records that mean you did MORE. Doing more is already paid by the per-minute
-- cardio award and the volume award (§6.2), so paying it twice would make distance the cheapest GP
-- in the game.
--
-- count(distinct exercise_id) is load-bearing here, not incidental: a 10 km run sets pace records in
-- three bands at once, and without the distinct that single run would be worth 300 GP. It also
-- matches the PRD's own wording, "100 GP per exercise that sets a new record".
create or replace function public.fn_gp_earning_pr_count(p_session_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct exercise_id)::int
  from public.personal_records
  where session_id = p_session_id
    and record_type in ('est_1rm', 'best_pace');
$$;

comment on function public.fn_gp_earning_pr_count(uuid) is
  'PR-earning exercises in a session: est_1rm (strength) and best_pace (cardio). "Got better" records earn GP; "did more" records do not.';

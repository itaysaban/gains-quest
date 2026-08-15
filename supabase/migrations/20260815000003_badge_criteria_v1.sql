-- M3 Epic 3, Story 3.2: teach fn_check_badges the 5 new v1.0 criteria types. Story 3.5: every badge
-- unlock now also inserts a source: 'achievement' point_ledger entry, tagged with the badge's id via
-- achievement_id. Exempt from the daily session-point ceiling by construction — fn_award_points_for_session
-- (20260814000010_point_reversal_recalc.sql) only ever sums base/volume/cardio/pr/routine sources for
-- that cap, never 'achievement' — no special-case check needed here.
--
-- The old xp_events insert stays, additive, same pattern as every M3 story so far: the old XP system
-- keeps running untouched until Story 3.3's cutover.
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

      -- Tonnage: lifetime working-set volume across every completed session.
      when 'cumulative_volume_kg' then
        select coalesce(sum(coalesce(ls.weight, 0) * coalesce(ls.reps, 1)), 0) into v_cumulative_volume
          from public.logged_sets ls
          join public.session_exercises se on se.id = ls.session_exercise_id
          join public.workout_sessions ws on ws.id = se.session_id
          where ws.user_id = p_user_id and ws.status = 'completed' and ls.set_type <> 'warmup';
        v_matched := v_cumulative_volume >= (v_badge.criteria ->> 'value')::numeric;

      -- Architect: some single routine_id completed at least N times ("a custom routine", i.e. one
      -- the user built and returns to — every routine in this schema is user-owned, there's no
      -- separate system/template concept for routines the way exercises have one).
      when 'custom_routine_completions' then
        select max(cnt) into v_max_routine_completions
          from (
            select routine_id, count(*) as cnt
            from public.workout_sessions
            where user_id = p_user_id and status = 'completed' and routine_id is not null
            group by routine_id
          ) t;
        v_matched := coalesce(v_max_routine_completions, 0) >= (v_badge.criteria ->> 'value')::int;

      -- Well Rounded: distinct workout_type values logged in the trailing 7 days.
      when 'distinct_workout_types_in_week' then
        select count(distinct workout_type) into v_distinct_types
          from public.workout_sessions
          where user_id = p_user_id and status = 'completed' and workout_type is not null
            and started_at >= now() - interval '7 days';
        v_matched := coalesce(v_distinct_types, 0) >= (v_badge.criteria ->> 'value')::int;

      -- Speed Demon: any single set carrying both distance and time (distance_duration tracking)
      -- meeting the pace bar in one go.
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

      -- Progressive Overload: for some exercise, its most recent N completed-and-logged sessions
      -- (N = criteria value) each set a new est_1rm PR in that same session.
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

      -- Social Butterfly: M4's friends system doesn't exist yet. Recognized, never errors, always
      -- false until that ships (Story 3.2 AC).
      when 'friend_count' then
        v_matched := false;

      else
        v_matched := false;
    end case;

    if v_matched then
      insert into public.user_badges (user_id, badge_id) values (p_user_id, v_badge.id) on conflict do nothing;
      insert into public.xp_events (user_id, event_type, xp_amount, metadata)
        values (p_user_id, 'badge_unlocked', v_badge.points, jsonb_build_object('badge_code', v_badge.code));
      insert into public.point_ledger (user_id, source, achievement_id, points, season_id)
        values (p_user_id, 'achievement', v_badge.id, v_badge.points, v_season_id);
      return next v_badge;
    end if;
  end loop;

  return;
end;
$$;

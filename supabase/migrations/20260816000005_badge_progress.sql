-- M3 Epic 3, Story 3.3 (design handoff): the new Achievement Hall design shows progress toward each
-- locked badge in its subtitle ("Log 100 sessions · 84/100"), not just the static requirement text.
-- Covers the criteria types with a natural linear "current / target" reading: session_count,
-- streak_days, cumulative_volume_kg, custom_routine_completions, distinct_workout_types_in_week.
-- The others (cardio_time_for_distance, est_1rm_beaten_consecutive_sessions, friend_count) aren't a
-- single accumulating number in any meaningful sense — those badges return a null current_value, and
-- the client falls back to showing the plain requirement text instead of a fraction.
create or replace function public.fn_badge_progress(p_user_id uuid)
returns table(badge_id uuid, current_value numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    b.id,
    case b.criteria ->> 'type'
      when 'session_count' then (
        select count(*)::numeric from public.workout_sessions
        where user_id = p_user_id and status = 'completed'
      )
      when 'streak_days' then (
        select coalesce(longest_streak_days, 0)::numeric from public.streaks where user_id = p_user_id
      )
      when 'cumulative_volume_kg' then (
        select coalesce(sum(coalesce(ls.weight, 0) * coalesce(ls.reps, 1)), 0)
        from public.logged_sets ls
        join public.session_exercises se on se.id = ls.session_exercise_id
        join public.workout_sessions ws on ws.id = se.session_id
        where ws.user_id = p_user_id and ws.status = 'completed' and ls.set_type <> 'warmup'
      )
      when 'custom_routine_completions' then (
        select coalesce(max(cnt), 0)::numeric
        from (
          select count(*) as cnt from public.workout_sessions
          where user_id = p_user_id and status = 'completed' and routine_id is not null
          group by routine_id
        ) t
      )
      when 'distinct_workout_types_in_week' then (
        select count(distinct workout_type)::numeric from public.workout_sessions
        where user_id = p_user_id and status = 'completed' and workout_type is not null
          and started_at >= now() - interval '7 days'
      )
      else null
    end as current_value
  from public.badges b
  where not exists (
    select 1 from public.user_badges ub where ub.user_id = p_user_id and ub.badge_id = b.id
  );
end;
$$;

grant execute on function public.fn_badge_progress(uuid) to authenticated;

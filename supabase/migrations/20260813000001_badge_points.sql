-- Per-badge point values (shown in the Achievement Hall UI, e.g. "500 pts") and awarded as XP on unlock,
-- replacing the flat 25 XP every badge previously granted.
alter table public.badges add column points integer not null default 100;

update public.badges set points = 100 where code = 'first_workout';
update public.badges set points = 500 where code = 'streak_7';
update public.badges set points = 750 where code = 'streak_30';
update public.badges set points = 250 where code = 'exercises_10';
update public.badges set points = 2000 where code = 'sessions_50';
update public.badges set points = 1000 where code = 'squat_100kg';
update public.badges set points = 1000 where code = 'bench_100kg';
update public.badges set points = 1000 where code = 'deadlift_140kg';

-- fn_check_badges (20260811000008_functions_triggers.sql) awarded a hardcoded 25 XP per unlock;
-- redefine it to award each badge's own point value instead.
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
        values (p_user_id, 'badge_unlocked', v_badge.points, jsonb_build_object('badge_code', v_badge.code));
      return next v_badge;
    end if;
  end loop;

  return;
end;
$$;

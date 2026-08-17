-- M3 Epic 3, Story 3.3: the Achievement Hall's LIFETIME card — total GP, sessions, volume, PRs,
-- badges unlocked/total — in one round trip. Season rank isn't included: that's an M4 dependency
-- (seasonal leaderboards don't exist yet), rendered as a static placeholder client-side rather than
-- faked here.
create or replace function public.fn_lifetime_stats(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_gp numeric;
  v_sessions int;
  v_volume numeric;
  v_prs int;
  v_badges_unlocked int;
  v_badges_total int;
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select coalesce(sum(points), 0) into v_total_gp from public.point_ledger where user_id = p_user_id;
  select count(*) into v_sessions from public.workout_sessions where user_id = p_user_id and status = 'completed';
  select coalesce(sum(total_volume), 0) into v_volume from public.workout_sessions where user_id = p_user_id and status = 'completed';
  select count(*) into v_prs from public.personal_records where user_id = p_user_id;
  select count(*) into v_badges_unlocked from public.user_badges where user_id = p_user_id;
  select count(*) into v_badges_total from public.badges;

  return jsonb_build_object(
    'total_gp', v_total_gp,
    'sessions', v_sessions,
    'volume_kg', v_volume,
    'prs', v_prs,
    'badges_unlocked', v_badges_unlocked,
    'badges_total', v_badges_total
  );
end;
$$;

grant execute on function public.fn_lifetime_stats(uuid) to authenticated;

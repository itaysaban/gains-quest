-- M4 (Social), Story 1: Friends — the prerequisite for both the Friends leaderboard and the social
-- feed, and the first real data behind the "Social Butterfly" badge (friend_count >= 5, PRD §6.4),
-- stubbed always-false since Story 3.2 pending exactly this. Scoped to search + request + accept/
-- decline + remove for this pass; "invite by link" (PRD §6.1.2/§7.4's "Friends and Invite" screen)
-- is a separate deep-linking mechanism, deferred rather than built half-specified.
--
-- Single-table design: a friendship is one row in friend_requests, 'accepted'. No separate mutable
-- "friends" table to keep in sync — same "derive, don't duplicate" reasoning as point_ledger (PRD §8).

create type public.friend_request_status as enum ('pending', 'accepted', 'declined');

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index friend_requests_addressee_idx on public.friend_requests (addressee_id, status);
create index friend_requests_requester_idx on public.friend_requests (requester_id, status);

alter table public.friend_requests enable row level security;
create policy "friend_requests_select_own" on public.friend_requests
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
-- Every row is written by a SECURITY DEFINER function below — same pattern as point_ledger/personal_records.
create policy "friend_requests_no_client_insert" on public.friend_requests for insert with check (false);
create policy "friend_requests_no_client_update" on public.friend_requests for update using (false);
create policy "friend_requests_no_client_delete" on public.friend_requests for delete using (false);

-- Search returns only what's needed to show a result row (id, name, avatar) plus this user's
-- existing relationship to each match, never a broad "browse all users" capability — profiles stay
-- friends-only by default (PRD §9 privacy: "profile is friends-only"). profiles_select_own on the
-- base table is untouched; this is the one controlled window through it.
create or replace function public.fn_search_users(p_query text)
returns table(id uuid, display_name text, avatar_url text, relationship text)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    coalesce(
      (select fr.status::text from public.friend_requests fr
        where (fr.requester_id = auth.uid() and fr.addressee_id = p.id)
           or (fr.requester_id = p.id and fr.addressee_id = auth.uid())
        limit 1),
      'none'
    ) as relationship
  from public.profiles p
  where p.id <> auth.uid()
    and p.display_name ilike '%' || p_query || '%'
  order by p.display_name
  limit 20;
$$;

grant execute on function public.fn_search_users(text) to authenticated;

create or replace function public.fn_send_friend_request(p_addressee_id uuid)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.friend_requests;
  v_result public.friend_requests;
begin
  if p_addressee_id = auth.uid() then
    raise exception 'Cannot send a friend request to yourself';
  end if;

  select * into v_existing from public.friend_requests
    where (requester_id = auth.uid() and addressee_id = p_addressee_id)
       or (requester_id = p_addressee_id and addressee_id = auth.uid());

  if v_existing.id is not null then
    if v_existing.status = 'accepted' then
      raise exception 'Already friends';
    elsif v_existing.status = 'pending' then
      raise exception 'A request is already pending';
    end if;
    -- A prior 'declined' row is replaced by a fresh request rather than left to block retrying.
    update public.friend_requests set status = 'pending', requester_id = auth.uid(), addressee_id = p_addressee_id,
      created_at = now(), responded_at = null
      where id = v_existing.id
      returning * into v_result;
    return v_result;
  end if;

  insert into public.friend_requests (requester_id, addressee_id)
    values (auth.uid(), p_addressee_id)
    returning * into v_result;
  return v_result;
end;
$$;

grant execute on function public.fn_send_friend_request(uuid) to authenticated;

-- Only the addressee may respond — the requester accepting their own request would let anyone
-- friend themselves onto someone else's list without consent.
create or replace function public.fn_respond_friend_request(p_request_id uuid, p_accept boolean)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.friend_requests;
  v_result public.friend_requests;
begin
  select * into v_request from public.friend_requests where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found';
  end if;
  if v_request.addressee_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Request already resolved';
  end if;

  update public.friend_requests
    set status = (case when p_accept then 'accepted' else 'declined' end)::public.friend_request_status, responded_at = now()
    where id = p_request_id
    returning * into v_result;
  return v_result;
end;
$$;

grant execute on function public.fn_respond_friend_request(uuid, boolean) to authenticated;

-- Unfriending: either party can end an accepted friendship. Deletes the row outright (not a status
-- flip to 'declined') so a future re-request starts clean rather than looking like a rejected ask.
create or replace function public.fn_remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friend_requests
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = p_friend_id)
        or (requester_id = p_friend_id and addressee_id = auth.uid()));
end;
$$;

grant execute on function public.fn_remove_friend(uuid) to authenticated;

create or replace function public.fn_list_friends(p_user_id uuid)
returns table(id uuid, display_name text, avatar_url text, friends_since timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
    select p.id, p.display_name, p.avatar_url, fr.responded_at as friends_since
    from public.friend_requests fr
    join public.profiles p on p.id = case when fr.requester_id = p_user_id then fr.addressee_id else fr.requester_id end
    where fr.status = 'accepted' and (fr.requester_id = p_user_id or fr.addressee_id = p_user_id)
    order by fr.responded_at desc nulls last;
end;
$$;

grant execute on function public.fn_list_friends(uuid) to authenticated;

create or replace function public.fn_pending_friend_requests(p_user_id uuid)
returns table(id uuid, from_user_id uuid, display_name text, avatar_url text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
    select fr.id, fr.requester_id as from_user_id, p.display_name, p.avatar_url, fr.created_at
    from public.friend_requests fr
    join public.profiles p on p.id = fr.requester_id
    where fr.addressee_id = p_user_id and fr.status = 'pending'
    order by fr.created_at desc;
end;
$$;

grant execute on function public.fn_pending_friend_requests(uuid) to authenticated;

-- fn_check_badges (last defined 20260817000001_drop_legacy_xp_system.sql): friend_count now reads
-- real data instead of the always-false stub — Social Butterfly (PRD §6.4: "Add 5 friends") can
-- unlock for the first time.
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
  v_friend_count int;
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
        select count(*) into v_friend_count
          from public.friend_requests
          where status = 'accepted' and (requester_id = p_user_id or addressee_id = p_user_id);
        v_matched := coalesce(v_friend_count, 0) >= (v_badge.criteria ->> 'value')::int;

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

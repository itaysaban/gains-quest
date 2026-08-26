-- M4 (Social), Story 3: Social Feed — PRD §6.5. "Friend activity cards showing who did what and
-- when, with a heart reaction... Feed events: session completed, PR set, badge unlocked, streak
-- milestone... default the feed to activity type and duration only, with weights and loads opt-in."
--
-- Scoped out of this pass: streak_milestone events (fn_update_streak has a long, hard-won bug-fix
-- history this session — not touched again without a specific driving need) and the per-session
-- "share weights" opt-in toggle from the Session Summary mockup (every session posts at the default
-- privacy level — activity shape only, never a weight/volume number — until that toggle exists).
-- "Invite by link" and reactions beyond a single heart are likewise out of scope; PRD only ever
-- specifies one reaction type.

create type public.feed_event_type as enum ('session_completed', 'pr_set', 'badge_unlocked');

create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type public.feed_event_type not null,
  session_id uuid references public.workout_sessions(id) on delete set null,
  badge_id uuid references public.badges(id) on delete set null,
  -- Activity-shape data only (duration, set count, workout type, PR exercise/record type) — never a
  -- weight or volume number by default, matching PRD §6.5's privacy default.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index feed_events_user_idx on public.feed_events (user_id, created_at desc);
create index feed_events_created_idx on public.feed_events (created_at desc);

alter table public.feed_events enable row level security;
-- Friends-only visibility (PRD §9: "profile is friends-only") — a user sees their own events plus
-- events from anyone they have an accepted friendship with, in either direction.
create policy "feed_events_select_own_or_friends" on public.feed_events
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = feed_events.user_id)
          or (fr.requester_id = feed_events.user_id and fr.addressee_id = auth.uid()))
    )
  );
create policy "feed_events_no_client_write" on public.feed_events for insert with check (false);

create table public.feed_reactions (
  id uuid primary key default gen_random_uuid(),
  feed_event_id uuid not null references public.feed_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (feed_event_id, user_id)
);

create index feed_reactions_event_idx on public.feed_reactions (feed_event_id);

alter table public.feed_reactions enable row level security;
-- Re-derives the same "event visible to me" condition as feed_events' own policy — a table's RLS
-- doesn't extend to a different table queried against it, so this needs its own explicit check.
create policy "feed_reactions_select_visible" on public.feed_reactions
  for select using (
    exists (
      select 1 from public.feed_events fe
      where fe.id = feed_reactions.feed_event_id
        and (fe.user_id = auth.uid() or exists (
          select 1 from public.friend_requests fr
          where fr.status = 'accepted'
            and ((fr.requester_id = auth.uid() and fr.addressee_id = fe.user_id)
              or (fr.requester_id = fe.user_id and fr.addressee_id = auth.uid()))
        ))
    )
  );
create policy "feed_reactions_no_client_insert" on public.feed_reactions for insert with check (false);
create policy "feed_reactions_no_client_delete" on public.feed_reactions for delete using (false);

-- Paginated, reverse-chronological, self + accepted friends only. SECURITY DEFINER functions bypass
-- RLS entirely (they run as the owner), so the visibility check is re-implemented here explicitly —
-- same reasoning as feed_reactions' own policy above.
create or replace function public.fn_friend_feed(p_limit int default 20, p_before timestamptz default null)
returns table(
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  event_type text,
  metadata jsonb,
  badge_code text,
  badge_name text,
  badge_icon text,
  created_at timestamptz,
  reaction_count int,
  reacted_by_me boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
    select
      fe.id, fe.user_id, p.display_name, p.avatar_url, fe.event_type::text, fe.metadata,
      b.code, b.name, b.icon,
      fe.created_at,
      (select count(*)::int from public.feed_reactions fr2 where fr2.feed_event_id = fe.id) as reaction_count,
      exists(select 1 from public.feed_reactions fr3 where fr3.feed_event_id = fe.id and fr3.user_id = auth.uid()) as reacted_by_me
    from public.feed_events fe
    join public.profiles p on p.id = fe.user_id
    left join public.badges b on b.id = fe.badge_id
    where (fe.user_id = auth.uid() or exists (
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and ((fr.requester_id = auth.uid() and fr.addressee_id = fe.user_id)
            or (fr.requester_id = fe.user_id and fr.addressee_id = auth.uid()))
      ))
      and (p_before is null or fe.created_at < p_before)
    order by fe.created_at desc
    limit p_limit;
end;
$$;

grant execute on function public.fn_friend_feed(int, timestamptz) to authenticated;

-- Toggle a heart reaction — re-validates visibility server-side rather than trusting the client only
-- caught this on a visible event (belt-and-suspenders with the RLS policies above).
create or replace function public.fn_toggle_reaction(p_feed_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visible boolean;
  v_existing uuid;
begin
  select exists(
    select 1 from public.feed_events fe
    where fe.id = p_feed_event_id
      and (fe.user_id = auth.uid() or exists (
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and ((fr.requester_id = auth.uid() and fr.addressee_id = fe.user_id)
            or (fr.requester_id = fe.user_id and fr.addressee_id = auth.uid()))
      ))
  ) into v_visible;

  if not v_visible then
    raise exception 'Not authorized';
  end if;

  select id into v_existing from public.feed_reactions where feed_event_id = p_feed_event_id and user_id = auth.uid();

  if v_existing is not null then
    delete from public.feed_reactions where id = v_existing;
    return false;
  else
    insert into public.feed_reactions (feed_event_id, user_id) values (p_feed_event_id, auth.uid());
    return true;
  end if;
end;
$$;

grant execute on function public.fn_toggle_reaction(uuid) to authenticated;

-- fn_complete_session (last defined 20260817000001_drop_legacy_xp_system.sql): posts one
-- session_completed event (activity shape only — duration, set count, workout type — never volume/
-- weight), and one pr_set event when the session set at least one PR (carries the first exercise's
-- name/record type + a count, not a card per individual PR — avoids flooding the feed with a card
-- per exercise on a big PR day).
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
  v_workout_type text;
  v_pr_count int;
  v_first_pr jsonb;
begin
  select user_id, started_at, paused_duration_seconds, coalesce(local_date, started_at::date), workout_type
    into v_user_id, v_started_at, v_paused_seconds, v_local_date, v_workout_type
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

  insert into public.feed_events (user_id, event_type, session_id, metadata)
    values (v_user_id, 'session_completed', p_session_id, jsonb_build_object(
      'duration_seconds', v_duration_seconds,
      'total_sets', v_total_sets,
      'workout_type', v_workout_type
    ));

  v_pr_count := jsonb_array_length(v_prs);
  if v_pr_count > 0 then
    v_first_pr := v_prs -> 0;
    insert into public.feed_events (user_id, event_type, session_id, metadata)
      values (v_user_id, 'pr_set', p_session_id, jsonb_build_object(
        'exercise_name', v_first_pr ->> 'exercise_name',
        'record_type', v_first_pr ->> 'record_type',
        'pr_count', v_pr_count
      ));
  end if;

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

-- fn_check_badges (last defined 20260818000001_friends.sql): posts one badge_unlocked feed event
-- per badge unlocked, alongside the existing user_badges/point_ledger inserts.
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
      insert into public.feed_events (user_id, event_type, badge_id)
        values (p_user_id, 'badge_unlocked', v_badge.id);
      return next v_badge;
    end if;
  end loop;

  return;
end;
$$;

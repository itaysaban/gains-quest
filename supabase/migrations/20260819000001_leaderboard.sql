-- M4 (Social), Story 2: Leaderboards — MVP scope. PRD §6.2: ranked boards are seasonal (calendar
-- month), never all-time; lifetime GP stays in the Achievement Hall. Uses the season_id column
-- point_ledger has carried since M3 Epic 1 (unused until now) — no new points infrastructure needed,
-- purely additive ranking on top of what already exists.
--
-- Tier size default: the PRD's own open question (§11, "is 100 the right cohort, or should it scale
-- with the user base?") is still genuinely unresolved — shipping with the design handoff's own
-- example (100, "Tier 14 · 100 lifters") as a starting default rather than blocking the whole
-- leaderboard on it. TIER_SIZE below is the one place that changes if/when this gets revisited.
--
-- Not built in this pass: season rollover archival ("final standings are archived to the user's
-- profile", §6.2 — only current-season standings are queryable, no history), promotion/relegation
-- logic (the mockup's "promotion top 20" line is display-only context, nothing acts on it yet), and
-- the 15-minute cache / near-real-time-own-row refresh cadence (§6.2) — plain query caching for MVP.

create or replace function public.fn_leaderboard(p_scope text)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  avatar_url text,
  season_gp int,
  is_self boolean,
  tier_number int,
  tier_size int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_season_id text := to_char(current_date, 'YYYY-MM');
  v_tier_size constant int := 100;
begin
  if p_scope not in ('global', 'friends') then
    raise exception 'Invalid scope: % (expected ''global'' or ''friends'')', p_scope;
  end if;

  if p_scope = 'friends' then
    -- Unbounded, always includes the caller even with zero friends or zero season GP — the "friends
    -- with no friends" empty-invite-prompt state is a client-side call on this same list being just
    -- the caller alone, not something this function special-cases.
    return query
      with friend_ids as (
        select auth.uid() as uid
        union
        select case when fr.requester_id = auth.uid() then fr.addressee_id else fr.requester_id end
        from public.friend_requests fr
        where fr.status = 'accepted' and (fr.requester_id = auth.uid() or fr.addressee_id = auth.uid())
      ),
      gp as (
        select fi.uid, coalesce(sum(pl.points), 0)::int as total_gp
        from friend_ids fi
        left join public.point_ledger pl on pl.user_id = fi.uid and pl.season_id = v_season_id
        group by fi.uid
      )
      select
        row_number() over (order by g.total_gp desc, g.uid)::int as rank,
        g.uid as user_id,
        p.display_name,
        p.avatar_url,
        g.total_gp as season_gp,
        (g.uid = auth.uid()) as is_self,
        null::int as tier_number,
        null::int as tier_size
      from gp g
      join public.profiles p on p.id = g.uid
      order by 1;
    return;
  end if;

  -- global: ranked among everyone with season GP, but only the caller's own tier of ~v_tier_size is
  -- returned — "ranking against everyone is meaningless at scale... podium and list both render
  -- within the user's tier" (PRD §6.2).
  return query
    with ranked as (
      select pl.user_id, sum(pl.points)::int as total_gp,
        row_number() over (order by sum(pl.points) desc, pl.user_id)::int as rn
      from public.point_ledger pl
      where pl.season_id = v_season_id
      group by pl.user_id
    ),
    my_rn as (
      select coalesce((select ranked.rn from ranked where ranked.user_id = auth.uid()), 1) as rn
    ),
    tier_bounds as (
      select
        (((select rn from my_rn) - 1) / v_tier_size) * v_tier_size + 1 as lo,
        (((select rn from my_rn) - 1) / v_tier_size) * v_tier_size + v_tier_size as hi,
        (((select rn from my_rn) - 1) / v_tier_size) + 1 as tier_num
    )
    select
      r.rn as rank,
      r.user_id,
      p.display_name,
      p.avatar_url,
      r.total_gp as season_gp,
      (r.user_id = auth.uid()) as is_self,
      tb.tier_num::int as tier_number,
      (select count(*)::int from ranked r2 where r2.rn between tb.lo and tb.hi) as tier_size
    from ranked r
    join tier_bounds tb on r.rn between tb.lo and tb.hi
    join public.profiles p on p.id = r.user_id
    order by r.rn;
end;
$$;

grant execute on function public.fn_leaderboard(text) to authenticated;

-- fn_lifetime_stats (last defined 20260816000006_lifetime_stats.sql): season_rank was always omitted
-- ("an M4 dependency... rendered as a static placeholder client-side rather than faked here") —
-- now that leaderboards are real, return the caller's actual current-season global rank, or null if
-- they have no season_id activity yet this month (the client keeps showing "—" for that case, still
-- never a fabricated number).
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
  v_season_id text := to_char(current_date, 'YYYY-MM');
  v_season_rank int;
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

  select rn into v_season_rank from (
    select user_id, row_number() over (order by sum(points) desc, user_id) as rn
    from public.point_ledger where season_id = v_season_id group by user_id
  ) ranked where user_id = p_user_id;

  return jsonb_build_object(
    'total_gp', v_total_gp,
    'sessions', v_sessions,
    'volume_kg', v_volume,
    'prs', v_prs,
    'badges_unlocked', v_badges_unlocked,
    'badges_total', v_badges_total,
    'season_rank', v_season_rank
  );
end;
$$;

grant execute on function public.fn_lifetime_stats(uuid) to authenticated;

-- Season rollover — PRD §6.2 ("Season length: calendar month. Seasons reset at 00:00 local on the
-- 1st; final standings are archived to the user's profile"), the gap left open by
-- 20260819000001_leaderboard.sql's own "Not built in this pass" note.
--
-- Design: standings are ARCHIVED, not recomputed on demand. point_ledger is season-stamped and
-- effectively immutable, so a past season's standings are deterministic — but not quite stable, see
-- the edit-window note on fn_archive_season below. Archiving also means a past board stays cheap to
-- read as the ledger grows, and gives promotion/relegation (not built here, see the note at the
-- bottom) a concrete row to act on later.
--
-- No scheduled job: this project has no pg_cron, and the lazy pattern fn_active_challenges already
-- uses fits better — the first caller after a season closes archives it. Archival is idempotent, so
-- concurrent callers racing on the same season is harmless.

-- One source of truth for the cohort size, replacing the `v_tier_size constant int := 100` that
-- 20260819000001 flagged as "the one place that changes if/when this gets revisited". Revisited
-- 2026-09-06: 50, resolved against the PRD §11 open question.
create or replace function public.fn_tier_size()
returns int
language sql
immutable
as $$ select 50 $$;

grant execute on function public.fn_tier_size() to authenticated;

create table if not exists public.season_standings (
  season_id   text not null,                                   -- 'YYYY-MM', matches point_ledger
  user_id     uuid not null references auth.users(id) on delete cascade,
  rank        int  not null,                                   -- global rank across the whole season
  tier_number int  not null,
  season_gp   int  not null,
  archived_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create index if not exists idx_season_standings_season_rank
  on public.season_standings (season_id, rank);

alter table public.season_standings enable row level security;

-- Read-your-own only. Other users' historical standings are exposed exclusively through
-- fn_season_standings below (security definer, tier-scoped), mirroring how fn_leaderboard is the
-- only route to other users' current standings — the table itself is never broadly readable.
drop policy if exists "own season standings are readable" on public.season_standings;
create policy "own season standings are readable"
  on public.season_standings for select to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy: writes happen only inside the security-definer functions below.

-- Archives one closed season's final standings. Idempotent — re-running overwrites, so a season
-- archived slightly too eagerly can be corrected by a later run.
--
-- The 48-hour buffer past month end is deliberate and not paranoia: §9 allows editing a completed
-- session for 48 hours, and fn_recalculate_session_points re-awards into the CURRENT season while
-- fn_reverse_session_points reverses into the ORIGINAL one. So a 30 Sep session edited on 1 Oct
-- moves GP out of September after September has ended. Archiving before that window shuts would
-- freeze a number the ledger then disagrees with.
create or replace function public.fn_archive_season(p_season_id text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closes_at timestamptz;
  v_rows int;
begin
  if p_season_id !~ '^\d{4}-\d{2}$' then
    raise exception 'Invalid season id: % (expected YYYY-MM)', p_season_id;
  end if;

  v_closes_at := (to_date(p_season_id || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '48 hours');
  if now() < v_closes_at then
    raise exception 'Season % is still open for edits until %', p_season_id, v_closes_at;
  end if;

  insert into public.season_standings (season_id, user_id, rank, tier_number, season_gp)
  select
    p_season_id,
    ranked.user_id,
    ranked.rn,
    ((ranked.rn - 1) / public.fn_tier_size()) + 1,
    ranked.total_gp
  from (
    select
      pl.user_id,
      sum(pl.points)::int as total_gp,
      row_number() over (order by sum(pl.points) desc, pl.user_id)::int as rn
    from public.point_ledger pl
    where pl.season_id = p_season_id
      and not pl.excluded_from_ranking
    group by pl.user_id
  ) ranked
  on conflict (season_id, user_id) do update
    set rank = excluded.rank,
        tier_number = excluded.tier_number,
        season_gp = excluded.season_gp,
        archived_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

grant execute on function public.fn_archive_season(text) to authenticated;

-- Lazy catch-up: archives every closed-but-unarchived season found in the ledger. Cheap no-op in the
-- common case (one existence check per distinct past season). The client calls this when the
-- Leaderboard mounts; it deliberately does NOT live inside fn_leaderboard, which is `stable` and so
-- cannot write.
create or replace function public.fn_ensure_seasons_archived()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season text;
  v_archived int := 0;
begin
  for v_season in
    select distinct pl.season_id
    from public.point_ledger pl
    where pl.season_id < to_char(current_date, 'YYYY-MM')
      and now() >= (to_date(pl.season_id || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '48 hours')
      and not exists (
        select 1 from public.season_standings ss where ss.season_id = pl.season_id
      )
    order by 1
  loop
    perform public.fn_archive_season(v_season);
    v_archived := v_archived + 1;
  end loop;

  return v_archived;
end;
$$;

grant execute on function public.fn_ensure_seasons_archived() to authenticated;

-- Reads one archived season's board, scoped to the tier the caller finished in — the same shape
-- fn_leaderboard returns for the live season, so the client can render past and present with one
-- component. Returns nothing if the caller has no standing in that season.
create or replace function public.fn_season_standings(p_season_id text)
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
  v_my_tier int;
begin
  select ss.tier_number into v_my_tier
  from public.season_standings ss
  where ss.season_id = p_season_id and ss.user_id = auth.uid();

  if v_my_tier is null then
    return;
  end if;

  return query
    select
      ss.rank,
      ss.user_id,
      p.display_name,
      p.avatar_url,
      ss.season_gp,
      (ss.user_id = auth.uid()) as is_self,
      ss.tier_number,
      (select count(*)::int from public.season_standings s2
        where s2.season_id = p_season_id and s2.tier_number = v_my_tier) as tier_size
    from public.season_standings ss
    join public.profiles p on p.id = ss.user_id
    where ss.season_id = p_season_id and ss.tier_number = v_my_tier
    order by ss.rank;
end;
$$;

grant execute on function public.fn_season_standings(text) to authenticated;

-- Lists the seasons the caller actually has an archived standing in, newest first, so the client can
-- offer a season picker without probing months that hold nothing.
create or replace function public.fn_my_seasons()
returns table(season_id text, rank int, tier_number int, season_gp int)
language sql
security definer
set search_path = public
stable
as $$
  select ss.season_id, ss.rank, ss.tier_number, ss.season_gp
  from public.season_standings ss
  where ss.user_id = auth.uid()
  order by ss.season_id desc;
$$;

grant execute on function public.fn_my_seasons() to authenticated;

-- Redefined for two reasons. (1) Tier size moves to fn_tier_size() — 100 -> 50. (2) BUG FIX: the
-- original summed every ledger row for the season, ignoring `excluded_from_ranking`. That column is
-- set by the implausible-load flagging in 20260814000009, whose whole purpose per PRD §9 is that
-- such GP is "excluded from leaderboard GP pending review" — the flag was written but never read, so
-- flagged points have been ranking normally. fn_archive_season above filters the same way, so live
-- and archived boards agree.
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
  v_tier_size int := public.fn_tier_size();
begin
  if p_scope not in ('global', 'friends') then
    raise exception 'Invalid scope: % (expected ''global'' or ''friends'')', p_scope;
  end if;

  if p_scope = 'friends' then
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
        left join public.point_ledger pl
          on pl.user_id = fi.uid
         and pl.season_id = v_season_id
         and not pl.excluded_from_ranking
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

  return query
    with ranked as (
      select pl.user_id, sum(pl.points)::int as total_gp,
        row_number() over (order by sum(pl.points) desc, pl.user_id)::int as rn
      from public.point_ledger pl
      where pl.season_id = v_season_id
        and not pl.excluded_from_ranking
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

-- Same excluded_from_ranking fix for the season_rank this returns — it computed rank from the same
-- unfiltered sum, so Achievement Hall could disagree with the Leaderboard for a flagged user.
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

  -- Lifetime GP deliberately still counts everything, flagged or not: §9 excludes flagged GP from
  -- *leaderboard* ranking, not from the user's own lifetime total.
  select coalesce(sum(points), 0) into v_total_gp from public.point_ledger where user_id = p_user_id;
  select count(*) into v_sessions from public.workout_sessions where user_id = p_user_id and status = 'completed';
  select coalesce(sum(total_volume), 0) into v_volume from public.workout_sessions where user_id = p_user_id and status = 'completed';
  select count(*) into v_prs from public.personal_records where user_id = p_user_id;
  select count(*) into v_badges_unlocked from public.user_badges where user_id = p_user_id;
  select count(*) into v_badges_total from public.badges;

  select rn into v_season_rank from (
    select user_id, row_number() over (order by sum(points) desc, user_id) as rn
    from public.point_ledger
    where season_id = v_season_id and not excluded_from_ranking
    group by user_id
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

-- STILL NOT BUILT: promotion and relegation (PRD §6.2, "promoted or relegated at season end").
-- Deliberately out of scope here, because it is not the same shape of change as archival. Tiers are
-- currently DERIVED — tier_number is just (rank-1)/tier_size recomputed on every read, with nothing
-- persisted between seasons. Real promotion/relegation needs tier to become an ASSIGNED, persistent
-- property that carries across seasons, plus rules this project has never specified: how many go up,
-- how many go down, where a brand-new user enters, and what happens to someone who logs nothing for
-- a season. season_standings gives that future work a row to act on. Until it exists, a new season
-- simply re-derives everyone's tier from their current GP, which is coherent on its own terms.

-- Season rollover, part 2: promotion and relegation — PRD §6.2, "Users are placed into tiers of
-- roughly 50 by season GP, promoted or relegated at season end."
--
-- Read that sentence closely, because it decides the whole design. Tiers are "placed ... by season
-- GP" — which is exactly the derived model already in fn_leaderboard, where tier_number is
-- (rank-1)/tier_size over the season's global ranking. Promotion and relegation are therefore not a
-- separate league mechanic to invent; they are the *consequence* of your tier differing from last
-- season's, because your GP rank moved.
--
-- The alternative reading — persistent league membership, where a fixed cohort competes and the top
-- N advance — is a materially different product: tier becomes an assigned property independent of
-- global rank, needing rules for entry, inactivity and cohort assignment that this project has never
-- specified, and fn_leaderboard would have to rank within an assigned cohort rather than slicing the
-- global ranking. It is deliberately NOT built here. If that is what is wanted, this migration is
-- the thing to replace, not to extend.
--
-- Movement is derived, never stored: season_standings already holds the tier for every archived
-- season, so comparing consecutive rows is exact and cannot drift out of sync with the standings.

-- Adds movement to the caller's archived seasons. `movement` compares each season's tier to the
-- caller's own previous ARCHIVED season, not to the calendar-previous month — a user who skipped a
-- month entirely is compared against the last season they actually placed in, which is the
-- comparison that means something to them.
--
-- Lower tier_number is better (tier 1 is the top), so a DECREASE is a promotion.
drop function if exists public.fn_my_seasons();

create or replace function public.fn_my_seasons()
returns table(
  season_id text,
  rank int,
  tier_number int,
  season_gp int,
  previous_tier_number int,
  movement text
)
language sql
security definer
set search_path = public
stable
as $$
  with mine as (
    select
      ss.season_id,
      ss.rank,
      ss.tier_number,
      ss.season_gp,
      lag(ss.tier_number) over (order by ss.season_id) as prev_tier
    from public.season_standings ss
    where ss.user_id = auth.uid()
  )
  select
    m.season_id,
    m.rank,
    m.tier_number,
    m.season_gp,
    m.prev_tier,
    case
      when m.prev_tier is null then 'first'
      when m.tier_number < m.prev_tier then 'promoted'
      when m.tier_number > m.prev_tier then 'relegated'
      else 'held'
    end as movement
  from mine m
  order by m.season_id desc;
$$;

grant execute on function public.fn_my_seasons() to authenticated;

-- The caller's most recent archived season, or null if they have never completed one. Exists so the
-- client can render a "last season" card without pulling the caller's whole history and taking the
-- first row — the common case is one small object, and a user with ten seasons should not transfer
-- ten rows to show one.
create or replace function public.fn_last_season()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row record;
begin
  select * into v_row from public.fn_my_seasons() limit 1;

  if v_row is null then
    return null;
  end if;

  return jsonb_build_object(
    'season_id', v_row.season_id,
    'rank', v_row.rank,
    'tier_number', v_row.tier_number,
    'season_gp', v_row.season_gp,
    'previous_tier_number', v_row.previous_tier_number,
    'movement', v_row.movement
  );
end;
$$;

grant execute on function public.fn_last_season() to authenticated;

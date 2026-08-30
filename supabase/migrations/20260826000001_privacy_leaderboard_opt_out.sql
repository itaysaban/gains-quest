-- M5 (Polish): Privacy settings. PRD §9's only concrete privacy requirement: "Leaderboard
-- participation can be turned off entirely without losing points or badges." No other privacy
-- surface is specified anywhere in the PRD (search confirms this is the sole concrete ask).
--
-- Design decisions (no existing spec beyond the one line above):
--   - Purely a ranking-VISIBILITY toggle: point_ledger, personal_records, and user_badges are never
--     touched by this column — an opted-out user keeps earning GP and unlocking badges exactly as
--     before, matching "without losing points or badges" literally.
--   - An opted-out user is excluded from the RANKING POOL entirely (not just hidden from the output
--     with a gap left behind) — everyone else's rank closes up around them, on both scopes.
--   - They can still VIEW both leaderboards (fn_leaderboard doesn't reject/short-circuit for them) —
--     "participation... turned off" reads as opt-out-of-being-ranked, not opt-out-of-viewing. If
--     they've opted out, their own row simply won't appear (is_self never true in the result set).
--   - fn_lifetime_stats' season_rank (Achievement Hall) is deliberately NOT touched — that's a
--     private stat shown only to the user themselves (self-check already enforced), not something
--     visible to other users the way the ranked boards are; PRD §6.2 itself draws this same
--     lifetime-vs-ranked-board distinction ("Lifetime GP still accumulates, but it lives in the
--     Achievement Hall, not on the ranked board").

alter table public.profiles add column leaderboard_opt_out boolean not null default false;
-- Client-updatable directly via the existing profiles_update_own RLS policy — same pattern as
-- unit_preference/weekly_goal_days/onboarding_completed_at. No new function needed for the toggle.

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
      where not p.leaderboard_opt_out
      order by 1;
    return;
  end if;

  return query
    with ranked as (
      select pl.user_id, sum(pl.points)::int as total_gp,
        row_number() over (order by sum(pl.points) desc, pl.user_id)::int as rn
      from public.point_ledger pl
      join public.profiles p on p.id = pl.user_id
      where pl.season_id = v_season_id and not p.leaderboard_opt_out
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

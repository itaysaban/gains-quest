-- M4 (Social), Story 4: Challenges — PRD F6 (P2). Navigation placement confirmed by the user
-- (AskUserQuestion): a section inside the existing Add Workout screen, not a 5th bottom tab.
--
-- Deliberately NOT the same shape as the separate, unapproved Daily Quests draft
-- (_bmad-output/planning-artifacts/daily-quests-feature.md) — that spec is per-user-inferred and
-- one-per-day; Challenges here is a small, fixed, server-config pool of week-scoped challenges every
-- user sees the same set of, individually tracked. No personalization/inference in this pass.
--
-- Progress is computed live on read (fn_active_challenges), not incrementally maintained via
-- fn_complete_session — a challenge's progress is a simple aggregate over sessions/PRs/sets already
-- in the period, so recomputing on each read is correct and avoids touching fn_complete_session's
-- already-long, carefully-tested history again for a P2 feature. GP is awarded exactly once, the
-- first read after progress reaches the target (status flips 'active' -> 'completed').
--
-- Week boundary: server-clock (UTC) ISO week (Monday-Sunday) via date_trunc('week', current_date) —
-- not per-user-local-timezone weeks. Same "ship the smallest thing that validates the assumption"
-- reasoning as the leaderboard's tier-size default; revisit if it matters in practice.
--
-- Not built in this pass: personalization/inference (that's Daily Quests' job, not approved yet),
-- a social/feed tie-in ("your friend completed a challenge" — feed_events schema would need a new
-- event_type), and challenge history beyond the current week (no archive of past weeks' outcomes).

create table public.challenge_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text not null,
  metric text not null check (metric in ('sessions_completed', 'new_prs', 'total_sets')),
  target_value int not null check (target_value > 0),
  points int not null check (points >= 0),
  is_active boolean not null default true
);

-- Server-config catalogue, same "tunable without an app release" spirit as badges (PRD §6.4) — no
-- client writes; content changes happen via a future admin/ops path, not the app itself.
alter table public.challenge_templates enable row level security;
create policy "challenge_templates_select_all" on public.challenge_templates for select using (true);
create policy "challenge_templates_no_client_write" on public.challenge_templates for insert with check (false);
create policy "challenge_templates_no_client_update" on public.challenge_templates for update using (false);

create table public.user_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_template_id uuid not null references public.challenge_templates(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  progress_value int not null default 0,
  status text not null default 'active' check (status in ('active', 'completed')),
  completed_at timestamptz,
  unique (user_id, challenge_template_id, period_start)
);

create index user_challenges_user_idx on public.user_challenges (user_id, period_start);

alter table public.user_challenges enable row level security;
create policy "user_challenges_select_own" on public.user_challenges for select using (auth.uid() = user_id);
-- Every row is written by fn_active_challenges (SECURITY DEFINER) — same pattern as every other
-- gamification table this session (point_ledger, personal_records, friend_requests, feed_events).
create policy "user_challenges_no_client_insert" on public.user_challenges for insert with check (false);
create policy "user_challenges_no_client_update" on public.user_challenges for update using (false);

alter table public.point_ledger drop constraint point_ledger_source_check;
alter table public.point_ledger add constraint point_ledger_source_check
  check (source in ('base', 'volume', 'cardio', 'pr', 'routine', 'achievement', 'challenge'));
-- 'challenge' is deliberately excluded from the 400 GP/day session ceiling's source list
-- (20260814000008_point_ceiling_guardrails.sql only sums 'base','volume','cardio','pr','routine') —
-- same exemption already given to 'achievement', for the same reason: small, fixed, capped-frequency
-- reward, not farmable.

insert into public.challenge_templates (code, name, description, metric, target_value, points) values
  ('weekly_3_sessions', 'Get Moving', 'Complete 3 workouts this week', 'sessions_completed', 3, 150),
  ('weekly_new_pr', 'Chase a Record', 'Set 1 new personal record this week', 'new_prs', 1, 100),
  ('weekly_20_sets', 'Grind It Out', 'Log 20 working sets this week', 'total_sets', 20, 100);

-- Lazy-assigns the current week's row for every active template (on_conflict do nothing — a repeat
-- call this week is a no-op assignment), recomputes progress for any still-'active' row from source
-- tables, and awards GP exactly once on the read that first crosses the target.
create or replace function public.fn_active_challenges(p_user_id uuid)
returns table(
  id uuid,
  code text,
  name text,
  description text,
  metric text,
  target_value int,
  progress_value int,
  status text,
  points int,
  period_end date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start date := date_trunc('week', current_date)::date;
  v_period_end date := v_period_start + 6;
  v_template record;
  v_uc record;
  v_progress int;
  v_season_id text := to_char(current_date, 'YYYY-MM');
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  for v_template in select * from public.challenge_templates ct where ct.is_active order by ct.code loop
    insert into public.user_challenges (user_id, challenge_template_id, period_start, period_end)
      values (p_user_id, v_template.id, v_period_start, v_period_end)
      on conflict (user_id, challenge_template_id, period_start) do nothing;

    select * into v_uc from public.user_challenges uc
      where uc.user_id = p_user_id and uc.challenge_template_id = v_template.id and uc.period_start = v_period_start;

    if v_uc.status = 'active' then
      -- local_date is nullable and left unset for a normal (non-backfilled) session — every date
      -- filter elsewhere in this codebase coalesces to started_at::date (see fn_complete_session,
      -- fn_update_streak, streak recalculation); doing the same here so an ordinary session isn't
      -- silently excluded from progress.
      case v_template.metric
        when 'sessions_completed' then
          select count(*) into v_progress from public.workout_sessions ws
            where ws.user_id = p_user_id and ws.status = 'completed'
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end;
        when 'new_prs' then
          -- Distinct exercises, not raw personal_records rows: a single first-time lift can set up
          -- to 4 record-type rows at once (max_weight, max_reps_at_weight, est_1rm, best_set_volume)
          -- — counting rows would let one good set alone satisfy a "set N PRs" challenge. Counting
          -- exercises matches how a lifter actually thinks about "I hit a PR on X".
          select count(distinct pr.exercise_id) into v_progress from public.personal_records pr
            join public.workout_sessions ws on ws.id = pr.session_id
            where pr.user_id = p_user_id
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end;
        when 'total_sets' then
          select count(*) into v_progress from public.logged_sets ls
            join public.session_exercises se on se.id = ls.session_exercise_id
            join public.workout_sessions ws on ws.id = se.session_id
            where ws.user_id = p_user_id and ws.status = 'completed' and ls.set_type <> 'warmup'
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end;
        else
          v_progress := 0;
      end case;

      update public.user_challenges uc set progress_value = v_progress where uc.id = v_uc.id;
      v_uc.progress_value := v_progress;

      if v_progress >= v_template.target_value then
        update public.user_challenges uc set status = 'completed', completed_at = now() where uc.id = v_uc.id;
        v_uc.status := 'completed';
        insert into public.point_ledger (user_id, source, points, season_id)
          values (p_user_id, 'challenge', v_template.points, v_season_id);
      end if;
    end if;

    id := v_uc.id;
    code := v_template.code;
    name := v_template.name;
    description := v_template.description;
    metric := v_template.metric;
    target_value := v_template.target_value;
    progress_value := v_uc.progress_value;
    status := v_uc.status;
    points := v_template.points;
    period_end := v_uc.period_end;
    return next;
  end loop;
end;
$$;

grant execute on function public.fn_active_challenges(uuid) to authenticated;

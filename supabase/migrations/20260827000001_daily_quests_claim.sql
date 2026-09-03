-- M4 Story 4, redesign per second design handoff (2026-09-01): Challenges -> Daily Quests. Same
-- underlying tables/architecture (challenge_templates, user_challenges, fn_active_challenges) —
-- internal identifiers are deliberately NOT renamed, only user-facing copy and the reward/target
-- values. What genuinely changes is the completion mechanic: GP no longer auto-awards the instant
-- a target is hit. A new intermediate 'ready_to_claim' status holds the row until the user taps
-- Claim (fn_claim_challenge). An unclaimed-but-ready row auto-claims as a side effect of the next
-- period's fn_active_challenges call, before it lazily assigns that day's fresh rows — reusing the
-- exact lazy-evaluation pattern this function already uses, no cron/scheduled job introduced.
--
-- 20260821000001_challenges.sql and 20260822000001_challenges_daily.sql are left as-is (already
-- committed/pushed) — fixed forward here, same pattern as every other "redefine again" case this
-- session.

alter table public.user_challenges drop constraint user_challenges_status_check;
alter table public.user_challenges add constraint user_challenges_status_check
  check (status in ('active', 'ready_to_claim', 'completed'));

-- New copy + reward scale from the design handoff (README.md, "Daily Quests — states"):
-- 20 GP (show up), 35 GP (a real session's worth of work, target raised 8 -> 12 working sets),
-- 50 GP (a PR). Full clear = 105 GP.
update public.challenge_templates set
  name = 'Log a workout', description = 'Log a workout',
  target_value = 1, points = 20
  where code = 'daily_workout';

update public.challenge_templates set
  name = 'Complete 12 working sets', description = 'Complete 12 working sets',
  target_value = 12, points = 35
  where code = 'daily_total_sets';

update public.challenge_templates set
  name = 'Beat one personal record', description = 'Beat one personal record',
  target_value = 1, points = 50
  where code = 'daily_new_pr';

-- fn_active_challenges (last defined 20260822000001_challenges_daily.sql): the completion branch no
-- longer awards GP directly — it flips 'active' -> 'ready_to_claim' only. A new first pass sweeps
-- the caller's own stale 'ready_to_claim' rows from a PRIOR period (i.e. never claimed before the
-- day rolled over) and auto-claims them — same GP-award logic fn_claim_challenge uses below, kept
-- inline here rather than factored out, since both call sites are this file and small enough that a
-- shared helper would be more indirection than the duplication it removes.
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
  v_period_start date := current_date;
  v_period_end date := current_date;
  v_template record;
  v_uc record;
  v_stale record;
  v_progress int;
  v_season_id text := to_char(current_date, 'YYYY-MM');
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  -- Auto-claim anything left ready_to_claim from a previous period before assigning today's set.
  for v_stale in
    select uc.id, uc.challenge_template_id, ct.points
    from public.user_challenges uc
    join public.challenge_templates ct on ct.id = uc.challenge_template_id
    where uc.user_id = p_user_id and uc.status = 'ready_to_claim' and uc.period_start < v_period_start
  loop
    update public.user_challenges uc set status = 'completed', completed_at = now() where uc.id = v_stale.id;
    insert into public.point_ledger (user_id, source, points, season_id)
      values (p_user_id, 'challenge', v_stale.points, v_season_id);
  end loop;

  for v_template in select * from public.challenge_templates ct where ct.is_active order by ct.code loop
    insert into public.user_challenges (user_id, challenge_template_id, period_start, period_end)
      values (p_user_id, v_template.id, v_period_start, v_period_end)
      on conflict (user_id, challenge_template_id, period_start) do nothing;

    select * into v_uc from public.user_challenges uc
      where uc.user_id = p_user_id and uc.challenge_template_id = v_template.id and uc.period_start = v_period_start;

    if v_uc.status = 'active' then
      case v_template.metric
        when 'sessions_completed' then
          select count(*) into v_progress from public.workout_sessions ws
            where ws.user_id = p_user_id and ws.status = 'completed'
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end;
        when 'new_prs' then
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
        update public.user_challenges uc set status = 'ready_to_claim' where uc.id = v_uc.id;
        v_uc.status := 'ready_to_claim';
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

-- A tap claims exactly one ready_to_claim row: verifies ownership and current status, awards the
-- GP, flips to completed. Rejects a not-ready or already-completed row (including a double-tap
-- racing the same row twice) rather than silently no-opping, so the client can surface a real error
-- instead of showing a false success.
create or replace function public.fn_claim_challenge(p_user_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uc record;
  v_points int;
  v_season_id text := to_char(current_date, 'YYYY-MM');
begin
  select uc.*, ct.points as template_points into v_uc
    from public.user_challenges uc
    join public.challenge_templates ct on ct.id = uc.challenge_template_id
    where uc.id = p_user_challenge_id;

  if v_uc.id is null then
    raise exception 'Quest not found';
  end if;
  if v_uc.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;
  if v_uc.status <> 'ready_to_claim' then
    raise exception 'Not ready to claim';
  end if;

  v_points := v_uc.template_points;

  update public.user_challenges set status = 'completed', completed_at = now() where id = p_user_challenge_id;
  insert into public.point_ledger (user_id, source, points, season_id)
    values (auth.uid(), 'challenge', v_points, v_season_id);
end;
$$;

grant execute on function public.fn_claim_challenge(uuid) to authenticated;

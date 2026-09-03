-- Dev-only follow-up: fn_dev_reset_challenges previously only deleted today's user_challenges rows,
-- but fn_active_challenges recomputes progress from real workout/PR/set data on every call — so a
-- quest whose underlying activity already happened today snapped straight back to ready_to_claim on
-- the very next read (verified live against test-alex: reset deletes the rows, the immediate refetch
-- recreates them at the same progress, because the workout that satisfies the quest genuinely
-- happened). Explicit ask: keep the real activity as-is, but let a /dev tester see a quest go back to
-- 0 and then complete again by logging a FRESH workout after tapping reset — without a separate
-- zero-activity test account and without touching real session/PR/set history.
--
-- Approach: a per-user "reset watermark" timestamp. Activity from before it stops counting toward
-- today's progress; activity from at/after it counts normally. No row for a user (the common case —
-- nobody has ever tapped dev-reset) means no filtering at all, so this is a no-op for every real user.

create table public.dev_challenge_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reset_at timestamptz not null default now()
);

alter table public.dev_challenge_resets enable row level security;
-- No client policies — written only by fn_dev_reset_challenges, read only by fn_active_challenges,
-- both SECURITY DEFINER. Same "no direct client access" pattern as user_challenges/streaks.

create or replace function public.fn_dev_reset_challenges(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  delete from public.user_challenges
    where user_id = p_user_id and period_start = current_date;

  insert into public.dev_challenge_resets (user_id, reset_at)
    values (p_user_id, now())
    on conflict (user_id) do update set reset_at = excluded.reset_at;
end;
$$;

grant execute on function public.fn_dev_reset_challenges(uuid) to authenticated;

-- fn_active_challenges (last defined 20260827000001_daily_quests_claim.sql): each metric query now
-- also requires the underlying activity to be at/after the caller's reset watermark, if they have
-- one. Uses each source's own "when did this actually happen" column, not period_start/end (which
-- only bound the calendar day, not the reset moment within it):
--   sessions_completed -> workout_sessions.ended_at (falls back to started_at, though a 'completed'
--     row should always have ended_at set)
--   new_prs            -> personal_records.achieved_at
--   total_sets         -> logged_sets.completed_at
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
  v_reset_at timestamptz;
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select dcr.reset_at into v_reset_at from public.dev_challenge_resets dcr where dcr.user_id = p_user_id;
  v_reset_at := coalesce(v_reset_at, '-infinity'::timestamptz);

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
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end
              and coalesce(ws.ended_at, ws.started_at) >= v_reset_at;
        when 'new_prs' then
          select count(distinct pr.exercise_id) into v_progress from public.personal_records pr
            join public.workout_sessions ws on ws.id = pr.session_id
            where pr.user_id = p_user_id
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end
              and pr.achieved_at >= v_reset_at;
        when 'total_sets' then
          select count(*) into v_progress from public.logged_sets ls
            join public.session_exercises se on se.id = ls.session_exercise_id
            join public.workout_sessions ws on ws.id = se.session_id
            where ws.user_id = p_user_id and ws.status = 'completed' and ls.set_type <> 'warmup'
              and coalesce(ws.local_date, ws.started_at::date) between v_period_start and v_period_end
              and ls.completed_at >= v_reset_at;
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

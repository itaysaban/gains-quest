-- M4 Story 4 follow-up: Challenges now reset daily instead of weekly, per explicit user request
-- after trying the weekly version. Same architecture (fixed server-config pool, lazy assignment,
-- progress computed live on read, GP awarded exactly once) — only the period boundary and the
-- templates' target/points/copy change, rescaled for a single day instead of 7.
--
-- 20260821000001_challenges.sql is left as-is (already committed/pushed) rather than edited in
-- place, matching this session's standing pattern of redefining a function again in a later
-- migration instead of rewriting an earlier one (fn_complete_session/fn_check_badges have each been
-- redefined this way 3+ times already).

update public.challenge_templates set
  code = 'daily_workout', name = 'Show Up', description = 'Complete a workout today',
  target_value = 1, points = 50
  where code = 'weekly_3_sessions';

update public.challenge_templates set
  code = 'daily_new_pr', name = 'Chase a Record', description = 'Set a new personal record today',
  target_value = 1, points = 75
  where code = 'weekly_new_pr';

update public.challenge_templates set
  code = 'daily_total_sets', name = 'Grind It Out', description = 'Log 8 working sets today',
  target_value = 8, points = 50
  where code = 'weekly_20_sets';

-- Daily equivalent of the same "server-clock UTC day, not per-user-local-timezone" simplification
-- the weekly version already used for its week boundary.
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
      -- local_date is nullable and left unset for a normal (non-backfilled) session — coalesced to
      -- started_at::date everywhere, matching the codebase-wide convention (see fn_complete_session,
      -- fn_update_streak, streak recalculation).
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

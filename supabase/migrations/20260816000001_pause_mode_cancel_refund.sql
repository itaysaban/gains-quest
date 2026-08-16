-- M3 Epic 2, Story 2.5 (bug fix): fn_cancel_pause_mode charged the full requested day count against
-- the quarterly budget even when cancelled the same day it was enabled — reported 2026-08-16: a 3-day
-- pause started and immediately cancelled still burned 3 days from the quota. The original reasoning
-- ("quota is spent on the request regardless") was borrowed from a different scenario — re-enabling
-- while already paused, where NOT charging the new request would let a user churn the quota for free —
-- but it doesn't hold here: cancelling the same day nothing was actually held, and the user should get
-- the whole thing back.
--
-- Refund = days granted minus days actually elapsed (only full days strictly before today count as
-- "used" — cancelling same-day refunds the whole window; cancelling after N days in refunds the
-- remainder). Returns the refunded amount so the client can show it.
--
-- Return type changes from void to jsonb, which Postgres won't allow via CREATE OR REPLACE alone
-- (errors "cannot change return type of existing function") -- drop it first.
drop function if exists public.fn_cancel_pause_mode();

create or replace function public.fn_cancel_pause_mode()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_paused_until date;
  v_pause_started_at date;
  v_used int;
  v_days_granted int;
  v_days_actually_used int;
  v_refund int;
begin
  if v_user_id is null then
    raise exception 'Not authorized';
  end if;

  select paused_until, pause_started_at, pause_days_used_this_quarter
    into v_paused_until, v_pause_started_at, v_used
    from public.streaks where user_id = v_user_id for update;

  if v_paused_until is null or v_pause_started_at is null then
    raise exception 'No active pause to cancel';
  end if;

  v_days_granted := (v_paused_until - v_pause_started_at) + 1;
  v_days_actually_used := greatest(0, least(v_days_granted, (current_date - v_pause_started_at)));
  v_refund := v_days_granted - v_days_actually_used;

  update public.streaks set
    paused_until = null,
    pause_started_at = null,
    pause_days_used_this_quarter = greatest(0, v_used - v_refund),
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('days_refunded', v_refund);
end;
$$;

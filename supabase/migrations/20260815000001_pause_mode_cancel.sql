-- M3 Epic 2, Story 2.5 (extended): let a user end Pause Mode early, before paused_until passes.
-- Found missing during manual production testing 2026-08-15 — the original AC only specified enabling
-- a pause and it expiring naturally, not an early-cancel path, but any real user who over-requested
-- days (or recovered sooner than expected) needs a way out rather than waiting out the window.
--
-- Clears the pause window outright (does not just move paused_until back a day) so there's no
-- ambiguity about whether "today" is still inside it. The pause-day quota already spent is NOT
-- refunded — consistent with the existing "quota is spent on the request regardless" behavior in
-- fn_enable_pause_mode.
create or replace function public.fn_cancel_pause_mode()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authorized';
  end if;

  update public.streaks set
    paused_until = null,
    pause_started_at = null,
    updated_at = now()
  where user_id = v_user_id;
end;
$$;

grant execute on function public.fn_cancel_pause_mode() to authenticated;

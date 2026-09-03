-- Second design handoff (2026-09-01): Session Summary's "Share to Feed" toggle pair. The PRD's
-- privacy language ("weights opt-in", §6.5/§9) has been implemented since Story 3 as a fixed
-- always-activity-only default with no client control at all — this adds the actual control.
--
-- Design: "Activity type and duration" is on by default with nothing to opt out of (the feed's
-- baseline shape always carries duration/set-count/workout-type — there's no lesser state below
-- it), so only "Include weights and loads" is a real toggle.
--
-- The toggle can't be a parameter to fn_complete_session — the feed event is already posted by the
-- time the user sees this screen (fn_complete_session already ran). Instead, a small SECURITY
-- DEFINER function updates that specific session_completed feed_events row's metadata after the
-- fact, verifying ownership itself rather than relying on an RLS UPDATE policy (feed_events has
-- none — the only permissive policies are select and a client-write-blocking insert, so a raw
-- client update is already denied by default; this function bypasses RLS as owner, same as every
-- other write path in this schema).
create or replace function public.fn_update_session_feed_privacy(p_session_id uuid, p_include_weights boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feed_event_id uuid;
  v_total_volume numeric;
begin
  select fe.id into v_feed_event_id
    from public.feed_events fe
    where fe.session_id = p_session_id and fe.event_type = 'session_completed' and fe.user_id = auth.uid();

  if v_feed_event_id is null then
    raise exception 'Feed event not found';
  end if;

  if p_include_weights then
    select total_volume into v_total_volume from public.workout_sessions where id = p_session_id;
    update public.feed_events set metadata = metadata || jsonb_build_object('total_volume', v_total_volume)
      where id = v_feed_event_id;
  else
    update public.feed_events set metadata = metadata - 'total_volume'
      where id = v_feed_event_id;
  end if;
end;
$$;

grant execute on function public.fn_update_session_feed_privacy(uuid, boolean) to authenticated;

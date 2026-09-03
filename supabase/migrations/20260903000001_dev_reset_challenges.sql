-- Dev-only testing convenience: deletes the caller's own today's user_challenges rows so
-- fn_active_challenges re-assigns a fresh 'active' set on its next call. Does NOT touch
-- point_ledger — GP already claimed stays claimed; this only resets in-progress quest state,
-- not the economy. Requested after the manual SQL delete the user was running by hand kept
-- tripping on date-literal quoting.

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
end;
$$;

grant execute on function public.fn_dev_reset_challenges(uuid) to authenticated;

-- Self-service: delete all of the current user's notifications (and their delivery events via cascade).
create or replace function public.clear_all_my_notifications()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'تسجيل الدخول مطلوب' using errcode = '42501';
  end if;
  delete from public.notifications
   where recipient_id = v_user;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.clear_all_my_notifications() from public, anon, authenticated;
grant execute on function public.clear_all_my_notifications() to authenticated;

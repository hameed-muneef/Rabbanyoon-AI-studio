-- Auto-expire: notifications stay unread for 30 minutes, then become read (badge clears).
-- Client calls expire_my_notifications(30) on load and periodically; server marks stale unread as read.
create or replace function public.expire_my_notifications(p_minutes integer default 30)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
  v_minutes integer := greatest(5, least(coalesce(p_minutes, 30), 1440));
begin
  if v_user is null then
    raise exception 'تسجيل الدخول مطلوب' using errcode = '42501';
  end if;
  update public.notifications
     set read_at = now()
   where recipient_id = v_user
     and read_at is null
     and created_at < now() - make_interval(mins => v_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.expire_my_notifications(integer) from public, anon, authenticated;
grant execute on function public.expire_my_notifications(integer) to authenticated;

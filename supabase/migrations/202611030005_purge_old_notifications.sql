-- Self-service retention: a user's own read notifications older than 90 days are removed.
create or replace function public.purge_my_old_notifications(p_days integer default 90)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'تسجيل الدخول مطلوب' using errcode = '42501';
  end if;
  if p_days is null or p_days < 30 then
    raise exception 'مدة الاحتفاظ لا تقل عن 30 يومًا' using errcode = '22023';
  end if;
  delete from public.notifications
   where recipient_id = v_user
     and read_at is not null
     and created_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.purge_my_old_notifications(integer) from public, anon, authenticated;
grant execute on function public.purge_my_old_notifications(integer) to authenticated;

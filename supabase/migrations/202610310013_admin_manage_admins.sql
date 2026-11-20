-- Existing administrators can promote or demote confirmed accounts. The private
-- allowlist is kept in sync so a demoted account is not re-granted on its next
-- email update.
create function public.admin_set_admin(p_user_id uuid, p_make_admin boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_confirmed timestamptz;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'إدارة المشرفين للمشرفين فقط' using errcode = '42501';
  end if;
  if p_user_id is null or p_make_admin is null then
    raise exception 'بيانات غير صالحة' using errcode = '22023';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at into v_email, v_confirmed
    from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'الحساب غير موجود' using errcode = 'P0002';
  end if;

  if p_make_admin then
    if v_confirmed is null or v_email is null or v_email = '' then
      raise exception 'يجب تأكيد بريد الحساب قبل منحه صلاحية الإشراف' using errcode = '22023';
    end if;
    insert into private.admin_allowlist(email) values (v_email) on conflict do nothing;
    insert into public.admin_accounts(user_id) values (p_user_id) on conflict do nothing;
  else
    if p_user_id = (select auth.uid()) then
      raise exception 'لا يمكنك إزالة صلاحية الإشراف عن حسابك' using errcode = '22023';
    end if;
    delete from public.admin_accounts where user_id = p_user_id;
    delete from private.admin_allowlist where lower(btrim(email)) = v_email;
  end if;
end $$;

revoke all on function public.admin_set_admin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

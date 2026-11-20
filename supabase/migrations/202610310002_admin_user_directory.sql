create function public.admin_list_users(
  p_search text default '',
  p_role text default 'all',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  email_confirmed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  first_name text,
  last_name text,
  country text,
  is_admin boolean,
  teacher_status text,
  is_approved_teacher boolean,
  total_count bigint,
  confirmed_count bigint,
  admin_count bigint,
  approved_teacher_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'إدارة قائمة المستخدمين للمشرفين فقط' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('all','admin','approved_teacher','pending_teacher','member')
     or p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset < 0
     or char_length(v_search) > 120 then
    raise exception 'معايير البحث غير صالحة' using errcode = '22023';
  end if;

  return query
  with accounts as (
    select u.id as account_id,
           u.email::text as account_email,
           (u.email_confirmed_at is not null) as confirmed,
           u.created_at as registered_at,
           u.last_sign_in_at as last_seen_at,
           coalesce(p.first_name, '') as given_name,
           coalesce(p.last_name, '') as family_name,
           coalesce(p.country, '') as country_name,
           exists (select 1 from public.admin_accounts a where a.user_id = u.id) as administrator,
           t.status as application_status,
           coalesce(t.status = 'approved'
             and t.identity_status = 'approved'
             and t.qualification_status = 'approved'
             and t.endorsement_status = 'approved', false) as approved_teacher
      from auth.users u
      left join public.user_preferences p on p.user_id = u.id
      left join public.teacher_applications t on t.user_id = u.id
  ), filtered as (
    select a.* from accounts a
     where (v_search = ''
       or coalesce(a.account_email, '') ilike '%' || v_search || '%'
       or (a.given_name || ' ' || a.family_name) ilike '%' || v_search || '%'
       or a.country_name ilike '%' || v_search || '%')
       and case p_role
         when 'admin' then a.administrator
         when 'approved_teacher' then a.approved_teacher
         when 'pending_teacher' then a.application_status = 'submitted'
         when 'member' then not a.administrator and not a.approved_teacher
         else true
       end
  )
  select f.account_id,
         f.account_email,
         f.confirmed,
         f.registered_at,
         f.last_seen_at,
         f.given_name,
         f.family_name,
         f.country_name,
         f.administrator,
         f.application_status,
         f.approved_teacher,
         count(*) over (),
         count(*) filter (where f.confirmed) over (),
         count(*) filter (where f.administrator) over (),
         count(*) filter (where f.approved_teacher) over ()
    from filtered f
   order by f.registered_at desc, f.account_id
   limit p_limit offset p_offset;
end $$;

revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
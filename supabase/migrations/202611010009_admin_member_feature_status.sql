create function public.list_admin_member_feature_status(p_email text)
returns table(
  feature_key text,
  feature_title text,
  override_allowed boolean,
  effective_allowed boolean,
  access_source text,
  latest_allowed boolean,
  latest_changed_by_email text,
  latest_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode = '42501';
  end if;
  if p_email is null or char_length(btrim(p_email)) not between 3 and 320 then
    raise exception 'البريد الإلكتروني غير صالح' using errcode = '22023';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and u.email_confirmed_at is not null;
  if v_user_id is null then
    raise exception 'الحساب غير موجود أو غير مؤكد' using errcode = 'P0001';
  end if;

  return query
  select
    f.key,
    f.title,
    o.allowed,
    (
      f.enabled and coalesce(
        o.allowed,
        not f.requires_premium
        or exists (
          select 1
          from public.paid_subscriptions ps
          where ps.user_id = v_user_id
            and ps.status = 'active'
            and ps.paid_until > now()
            and (ps.feature_key is null or ps.feature_key = f.key)
        )
        or exists (
          select 1
          from public.subscriptions s
          where s.user_id = v_user_id
            and (
              (s.status = 'active' and (s.paid_until is null or s.paid_until > now()))
              or (s.status = 'cancelled' and s.cancel_at > now() and s.paid_until > now())
            )
            and (s.feature_key is null or s.feature_key = f.key)
        )
      )
    ) as effective_allowed,
    case
      when not f.enabled then 'feature_disabled'
      when o.allowed is true then 'admin_grant'
      when o.allowed is false then 'admin_revoke'
      when not f.requires_premium then 'free_default'
      when exists (
        select 1 from public.paid_subscriptions ps
        where ps.user_id = v_user_id
          and ps.status = 'active'
          and ps.paid_until > now()
          and (ps.feature_key is null or ps.feature_key = f.key)
      ) or exists (
        select 1 from public.subscriptions s
        where s.user_id = v_user_id
          and (
            (s.status = 'active' and (s.paid_until is null or s.paid_until > now()))
            or (s.status = 'cancelled' and s.cancel_at > now() and s.paid_until > now())
          )
          and (s.feature_key is null or s.feature_key = f.key)
      ) then 'subscription'
      else 'premium_required'
    end as access_source,
    latest.allowed,
    latest.changed_by_email,
    latest.changed_at
  from public.platform_features f
  left join public.member_feature_overrides o
    on o.user_id = v_user_id and o.feature_key = f.key
  left join lateral (
    select e.allowed, actor.email::text as changed_by_email, e.changed_at
    from public.member_feature_events e
    left join auth.users actor on actor.id = e.changed_by
    where e.user_id = v_user_id and e.feature_key = f.key
    order by e.changed_at desc, e.id desc
    limit 1
  ) latest on true
  order by f.title;
end;
$$;

revoke all on function public.list_admin_member_feature_status(text)
  from public, anon, authenticated;
grant execute on function public.list_admin_member_feature_status(text)
  to authenticated;

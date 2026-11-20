alter table public.platform_features
  add column price_amount numeric(12,3),
  add column currency_code text,
  add column billing_interval text;

alter table public.platform_features
  add constraint platform_features_price_fields_check check (
    (price_amount is null and currency_code is null and billing_interval is null)
    or (requires_premium and price_amount > 0 and currency_code ~ '^[A-Z]{3}$'
      and billing_interval in ('monthly','yearly'))
  );

alter table public.paid_subscriptions
  add column feature_key text references public.platform_features(key);
alter table public.paid_subscription_events
  add column feature_key text references public.platform_features(key);

create table public.platform_feature_events (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.platform_features(key),
  before_state jsonb,
  after_state jsonb not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
create index platform_feature_events_changed_at_idx on public.platform_feature_events(changed_at desc);
alter table public.platform_feature_events enable row level security;
revoke all on public.platform_feature_events from public,anon,authenticated;
grant select,insert on public.platform_feature_events to service_role;

create or replace function public.has_feature_access(p_feature_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_features f
    where f.key=p_feature_key and f.enabled and auth.uid() is not null
      and coalesce((select o.allowed from public.member_feature_overrides o
        where o.user_id=auth.uid() and o.feature_key=f.key),
        not f.requires_premium or exists (
          select 1 from public.paid_subscriptions s
          where s.user_id=auth.uid() and s.status='active' and s.paid_until>now()
            and (s.feature_key is null or s.feature_key=f.key)
        ))
  );
$$;
revoke all on function public.has_feature_access(text) from public,anon,authenticated;
grant execute on function public.has_feature_access(text) to authenticated;

create function public.record_verified_subscription_event_scoped(
  p_provider text,p_event_id text,p_subscription_id text,p_user_id uuid,
  p_status text,p_paid_until timestamptz,p_event_at timestamptz,p_feature_key text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_inserted integer; v_applied integer;
begin
  if p_provider is null or char_length(btrim(p_provider)) not between 2 and 80
     or p_event_id is null or char_length(btrim(p_event_id)) not between 1 and 200
     or p_subscription_id is null or char_length(btrim(p_subscription_id)) not between 1 and 200
     or p_user_id is null or p_status not in ('active','cancelled','refunded')
     or p_paid_until is null or p_event_at is null then
    raise exception 'بيانات حدث الاشتراك غير صالحة' using errcode='22023';
  end if;
  if p_feature_key is not null and not exists (
    select 1 from public.platform_features where key=p_feature_key and requires_premium
  ) then
    raise exception 'الميزة المدفوعة غير موجودة' using errcode='P0001';
  end if;
  insert into public.paid_subscription_events(provider,provider_event_id,provider_subscription_id,user_id,
    status,event_at,feature_key)
  values(btrim(p_provider),btrim(p_event_id),btrim(p_subscription_id),p_user_id,p_status,p_event_at,p_feature_key)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted=0 then return false; end if;
  insert into public.paid_subscriptions(user_id,provider,provider_subscription_id,status,paid_until,last_event_at,feature_key)
  values(p_user_id,btrim(p_provider),btrim(p_subscription_id),p_status,p_paid_until,p_event_at,p_feature_key)
  on conflict(provider,provider_subscription_id) do update
    set status=excluded.status,paid_until=excluded.paid_until,last_event_at=excluded.last_event_at,updated_at=now()
    where public.paid_subscriptions.user_id=excluded.user_id
      and public.paid_subscriptions.feature_key is not distinct from excluded.feature_key
      and public.paid_subscriptions.last_event_at<excluded.last_event_at;
  get diagnostics v_applied = row_count;
  if v_applied=0 and exists (
    select 1 from public.paid_subscriptions s
     where s.provider=btrim(p_provider) and s.provider_subscription_id=btrim(p_subscription_id)
       and (s.user_id<>p_user_id or s.feature_key is distinct from p_feature_key)
  ) then raise exception 'معرّف الاشتراك مرتبط بحساب أو ميزة أخرى' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public.record_verified_subscription_event_scoped(text,text,text,uuid,text,timestamptz,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.record_verified_subscription_event_scoped(text,text,text,uuid,text,timestamptz,timestamptz,text)
  to service_role;

create or replace function public.record_verified_subscription_event(
  p_provider text,p_event_id text,p_subscription_id text,p_user_id uuid,
  p_status text,p_paid_until timestamptz,p_event_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  return public.record_verified_subscription_event_scoped(
    p_provider,p_event_id,p_subscription_id,p_user_id,p_status,p_paid_until,p_event_at,null
  );
end $$;
revoke all on function public.record_verified_subscription_event(text,text,text,uuid,text,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.record_verified_subscription_event(text,text,text,uuid,text,timestamptz,timestamptz)
  to service_role;

create function public.save_platform_feature_pricing(
  p_key text,p_title text,p_description text,p_enabled boolean,p_requires_premium boolean,
  p_price_amount numeric,p_currency_code text,p_billing_interval text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb; v_currency text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  v_currency:=upper(btrim(coalesce(p_currency_code,'')));
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{2,63}$'
    or p_title is null or char_length(btrim(p_title)) not between 2 and 120
    or char_length(coalesce(p_description,''))>500
    or p_enabled is null or p_requires_premium is null then
    raise exception 'بيانات الميزة غير صالحة' using errcode='22023';
  end if;
  if p_key='circle_live' and not p_requires_premium then
    raise exception 'جلسات التواصي تتطلب Premium' using errcode='22023';
  end if;
  if p_requires_premium then
    if (p_price_amount is null)<>(v_currency='') or (p_price_amount is null)<>(p_billing_interval is null)
       or (p_price_amount is not null and (p_price_amount<=0 or p_price_amount>999999999.999
         or v_currency !~ '^[A-Z]{3}$' or p_billing_interval not in ('monthly','yearly'))) then
      raise exception 'أدخل سعرًا موجبًا وعملة من ثلاثة أحرف وفترة شهرية أو سنوية، أو اتركها جميعًا فارغة' using errcode='22023';
    end if;
  elsif p_price_amount is not null or v_currency<>'' or p_billing_interval is not null then
    raise exception 'الميزة المجانية لا تحمل إعداد سعر' using errcode='22023';
  end if;

  select jsonb_build_object('title',f.title,'description',f.description,'enabled',f.enabled,
    'requires_premium',f.requires_premium,'price_amount',f.price_amount,'currency_code',f.currency_code,
    'billing_interval',f.billing_interval)
    into v_before from public.platform_features f where f.key=p_key;
  insert into public.platform_features(key,title,description,enabled,requires_premium,
    price_amount,currency_code,billing_interval,updated_at,updated_by)
  values(p_key,btrim(p_title),coalesce(p_description,''),p_enabled,p_requires_premium,
    p_price_amount,nullif(v_currency,''),p_billing_interval,now(),auth.uid())
  on conflict(key) do update set title=excluded.title,description=excluded.description,
    enabled=excluded.enabled,requires_premium=excluded.requires_premium,price_amount=excluded.price_amount,
    currency_code=excluded.currency_code,billing_interval=excluded.billing_interval,
    updated_at=now(),updated_by=excluded.updated_by;
  select jsonb_build_object('title',f.title,'description',f.description,'enabled',f.enabled,
    'requires_premium',f.requires_premium,'price_amount',f.price_amount,'currency_code',f.currency_code,
    'billing_interval',f.billing_interval)
    into v_after from public.platform_features f where f.key=p_key;
  insert into public.platform_feature_events(feature_key,before_state,after_state,changed_by)
  values(p_key,v_before,v_after,auth.uid());
end $$;
revoke all on function public.save_platform_feature_pricing(text,text,text,boolean,boolean,numeric,text,text)
  from public,anon,authenticated;
grant execute on function public.save_platform_feature_pricing(text,text,text,boolean,boolean,numeric,text,text)
  to authenticated;

create or replace function public.save_platform_feature(p_key text,p_title text,p_description text,
  p_enabled boolean,p_requires_premium boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_price numeric; v_currency text; v_interval text;
begin
  if p_requires_premium then
    select price_amount,currency_code,billing_interval into v_price,v_currency,v_interval
      from public.platform_features where key=p_key;
  end if;
  perform public.save_platform_feature_pricing(p_key,p_title,p_description,p_enabled,p_requires_premium,
    v_price,v_currency,v_interval);
end $$;
revoke all on function public.save_platform_feature(text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.save_platform_feature(text,text,text,boolean,boolean) to authenticated;

create function public.list_admin_platform_feature_events(p_limit integer default 50)
returns table(id uuid,feature_key text,before_state jsonb,after_state jsonb,changed_by_email text,changed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'حجم السجل غير صالح' using errcode='22023';
  end if;
  return query select e.id,e.feature_key,e.before_state,e.after_state,u.email::text,e.changed_at
    from public.platform_feature_events e left join auth.users u on u.id=e.changed_by
    order by e.changed_at desc limit p_limit;
end $$;
revoke all on function public.list_admin_platform_feature_events(integer) from public,anon,authenticated;
grant execute on function public.list_admin_platform_feature_events(integer) to authenticated;

create function public.list_admin_member_feature_events(p_email text,p_limit integer default 50)
returns table(id uuid,feature_key text,feature_title text,allowed boolean,changed_by_email text,changed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  if p_email is null or char_length(btrim(p_email)) not between 3 and 320
     or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'بيانات سجل الصلاحيات غير صالحة' using errcode='22023';
  end if;
  return query select e.id,e.feature_key,f.title,e.allowed,actor.email::text,e.changed_at
    from public.member_feature_events e
    join auth.users target on target.id=e.user_id
    join public.platform_features f on f.key=e.feature_key
    left join auth.users actor on actor.id=e.changed_by
   where lower(target.email)=lower(btrim(p_email))
   order by e.changed_at desc limit p_limit;
end $$;
revoke all on function public.list_admin_member_feature_events(text,integer) from public,anon,authenticated;
grant execute on function public.list_admin_member_feature_events(text,integer) to authenticated;
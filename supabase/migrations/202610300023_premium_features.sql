-- Premium access is earned from a verified payment integration (service_role only).
-- Platform admins may manage feature catalog entries and member-specific overrides.
create table public.platform_features (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description)<=500),
  enabled boolean not null default true,
  requires_premium boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.platform_features(key,title,description,enabled,requires_premium)
values ('circle_live','جلسات التواصي المباشرة','فتح رابط اللقاء لأعضاء الحلقة المصرح لهم',true,true);
alter table public.platform_features enable row level security;
revoke all on public.platform_features from public,anon,authenticated;
grant select on public.platform_features to authenticated;
grant select,insert,update,delete on public.platform_features to service_role;
create policy feature_catalog_read on public.platform_features for select to authenticated using (true);

create table public.paid_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (char_length(btrim(provider)) between 2 and 80),
  provider_subscription_id text not null check (char_length(btrim(provider_subscription_id)) between 1 and 200),
  status text not null check (status in ('active','cancelled','refunded')),
  paid_until timestamptz not null,
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,provider_subscription_id)
);
create index paid_subscriptions_user_idx on public.paid_subscriptions(user_id,status,paid_until);
alter table public.paid_subscriptions enable row level security;
revoke all on public.paid_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.paid_subscriptions to service_role;

create table public.paid_subscription_events (
  provider text not null,
  provider_event_id text not null,
  provider_subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('active','cancelled','refunded')),
  event_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key(provider,provider_event_id)
);
alter table public.paid_subscription_events enable row level security;
revoke all on public.paid_subscription_events from public,anon,authenticated;
grant select,insert on public.paid_subscription_events to service_role;

-- Only a backend holding service_role may call this after verifying the provider's
-- signature. Idempotency and event ordering protect against webhook retries.
create function public.record_verified_subscription_event(
  p_provider text,p_event_id text,p_subscription_id text,p_user_id uuid,
  p_status text,p_paid_until timestamptz,p_event_at timestamptz
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
  insert into public.paid_subscription_events(provider,provider_event_id,provider_subscription_id,user_id,status,event_at)
    values(btrim(p_provider),btrim(p_event_id),btrim(p_subscription_id),p_user_id,p_status,p_event_at)
    on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted=0 then return false; end if;
  insert into public.paid_subscriptions(user_id,provider,provider_subscription_id,status,paid_until,last_event_at)
    values(p_user_id,btrim(p_provider),btrim(p_subscription_id),p_status,p_paid_until,p_event_at)
    on conflict(provider,provider_subscription_id) do update
      set status=excluded.status,paid_until=excluded.paid_until,
          last_event_at=excluded.last_event_at,updated_at=now()
      where public.paid_subscriptions.user_id=excluded.user_id
        and public.paid_subscriptions.last_event_at<excluded.last_event_at;
  get diagnostics v_applied = row_count;
  if v_applied=0 and exists (
    select 1 from public.paid_subscriptions s
    where s.provider=btrim(p_provider) and s.provider_subscription_id=btrim(p_subscription_id)
      and s.user_id<>p_user_id
  ) then raise exception 'معرّف الاشتراك مرتبط بحساب آخر' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public.record_verified_subscription_event(text,text,text,uuid,text,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.record_verified_subscription_event(text,text,text,uuid,text,timestamptz,timestamptz)
  to service_role;

create table public.member_feature_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null references public.platform_features(key) on delete cascade,
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  primary key(user_id,feature_key)
);
alter table public.member_feature_overrides enable row level security;
revoke all on public.member_feature_overrides from public,anon,authenticated;
grant select,insert,update,delete on public.member_feature_overrides to service_role;

create table public.member_feature_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null references public.platform_features(key),
  allowed boolean,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
create index member_feature_events_user_idx on public.member_feature_events(user_id,changed_at desc);
alter table public.member_feature_events enable row level security;
revoke all on public.member_feature_events from public,anon,authenticated;
grant select,insert on public.member_feature_events to service_role;

create function public.has_feature_access(p_feature_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_features f
    where f.key=p_feature_key and f.enabled and auth.uid() is not null
      and coalesce((select o.allowed from public.member_feature_overrides o
        where o.user_id=auth.uid() and o.feature_key=f.key),
        not f.requires_premium or exists (
          select 1 from public.paid_subscriptions s
          where s.user_id=auth.uid() and s.status='active' and s.paid_until>now()
        ))
  );
$$;
revoke all on function public.has_feature_access(text) from public,anon,authenticated;
grant execute on function public.has_feature_access(text) to authenticated;

create function public.save_platform_feature(p_key text,p_title text,p_description text,
  p_enabled boolean,p_requires_premium boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{2,63}$'
    or p_title is null or char_length(btrim(p_title)) not between 2 and 120
    or char_length(coalesce(p_description,''))>500
    or p_enabled is null or p_requires_premium is null then
    raise exception 'بيانات الميزة غير صالحة' using errcode='22023';
  end if;
  if p_key='circle_live' and not p_requires_premium then
    raise exception 'جلسات التواصي تتطلب Premium' using errcode='22023';
  end if;
  insert into public.platform_features(key,title,description,enabled,requires_premium,updated_by)
  values(p_key,btrim(p_title),coalesce(p_description,''),p_enabled,p_requires_premium,auth.uid())
  on conflict(key) do update set title=excluded.title,description=excluded.description,
    enabled=excluded.enabled,requires_premium=excluded.requires_premium,
    updated_at=now(),updated_by=excluded.updated_by;
end $$;

create function public.set_member_feature(p_email text,p_feature_key text,p_allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  if p_email is null or p_feature_key is null then
    raise exception 'الحساب والميزة مطلوبان' using errcode='22023';
  end if;
  select id into v_user from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'الحساب غير موجود أو غير مؤكد' using errcode='P0001'; end if;
  if not exists(select 1 from public.platform_features where key=p_feature_key) then
    raise exception 'الميزة غير موجودة' using errcode='P0001';
  end if;
  if p_allowed is null then
    delete from public.member_feature_overrides where user_id=v_user and feature_key=p_feature_key;
  else
    insert into public.member_feature_overrides(user_id,feature_key,allowed,updated_by)
    values(v_user,p_feature_key,p_allowed,auth.uid())
    on conflict(user_id,feature_key) do update set allowed=excluded.allowed,
      updated_at=now(),updated_by=excluded.updated_by;
  end if;
  insert into public.member_feature_events(user_id,feature_key,allowed,changed_by)
    values(v_user,p_feature_key,p_allowed,auth.uid());
end $$;

create function public.list_member_features(p_email text)
returns table(feature_key text,allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'إدارة المنصة مطلوبة' using errcode='42501';
  end if;
  return query select o.feature_key,o.allowed from public.member_feature_overrides o
    join auth.users u on u.id=o.user_id where lower(u.email)=lower(btrim(p_email));
end $$;

revoke all on function public.save_platform_feature(text,text,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.set_member_feature(text,text,boolean) from public,anon,authenticated;
revoke all on function public.list_member_features(text) from public,anon,authenticated;
grant execute on function public.save_platform_feature(text,text,text,boolean,boolean) to authenticated;
grant execute on function public.set_member_feature(text,text,boolean) to authenticated;
grant execute on function public.list_member_features(text) to authenticated;

-- Never reveal a Meet URL without current membership and current entitlement.
create or replace function public.reveal_circle_meeting_url(p_session_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_url text;
begin
  if auth.uid() is null then raise exception 'تسجيل الدخول مطلوب' using errcode='42501'; end if;
  if not public.has_feature_access('circle_live') then
    raise exception 'هذه الجلسة تتطلب اشتراك Premium أو صلاحية من إدارة المنصة' using errcode='42501';
  end if;
  select s.meeting_url into v_url from public.circle_live_sessions s
    join public.study_groups g on g.id=s.circle_id
    join public.group_members m on m.group_id=s.circle_id and m.user_id=auth.uid()
    where s.id=p_session_id and s.status='scheduled' and g.status='active';
  if not found or v_url='' then raise exception 'رابط اللقاء غير متاح' using errcode='42501'; end if;
  return v_url;
end $$;

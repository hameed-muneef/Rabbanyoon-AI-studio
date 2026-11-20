-- ============================================================================
-- ترحيل محرك الإشعارات والمنبهات الموحد (2026-11-03)
-- يضيف جداول التذكيرات الشخصية، تفضيلات الإشعارات، أحداث الإشعارات،
-- مكتبة الأصوات، ورموز الأجهزة للمستقبل. جميع الجداول مفعّل عليها RLS
-- ولا يُسمح بالوصول المباشر إلا للمستلم أو المشرف.
-- ============================================================================

-- ---------- التذكيرات الشخصية ----------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  scheduled_at timestamptz not null,
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekday','weekdays','weekly','monthly','custom','specific_dates')),
  recurrence_config jsonb not null default '{}' check (jsonb_typeof(recurrence_config) = 'object'),
  sound_id text,
  category text not null default 'custom' check (char_length(btrim(category)) between 1 and 50),
  linked_goal_id text,
  linked_task_id text,
  enabled boolean not null default true,
  snooze_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user_idx on public.reminders(user_id, enabled, scheduled_at);
create index reminders_due_idx on public.reminders(user_id, scheduled_at) where enabled = true;

alter table public.reminders enable row level security;
revoke all on public.reminders from public, anon, authenticated;
grant select, insert, update, delete on public.reminders to public;
grant select, insert, update, delete on public.reminders to service_role;
create policy reminder_own_select on public.reminders for select to authenticated
  using (user_id = (select auth.uid()));
create policy reminder_own_insert on public.reminders for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy reminder_own_update on public.reminders for update to authenticated
  using (user_id = (select auth.uid()));
create policy reminder_own_delete on public.reminders for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- تفضيلات الإشعارات ----------
create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  global_enabled boolean not null default true,
  categories jsonb not null default '{}' check (jsonb_typeof(categories) = 'object'),
  prayer_settings jsonb not null default '{}' check (jsonb_typeof(prayer_settings) = 'object'),
  reminder_settings jsonb not null default '{}' check (jsonb_typeof(reminder_settings) = 'object'),
  quiet_hours jsonb not null default '{}' check (jsonb_typeof(quiet_hours) = 'object'),
  dnd_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from public, anon, authenticated;
grant select, insert, update, delete on public.notification_settings to public;
grant select, insert, update, delete on public.notification_settings to service_role;
create policy notification_settings_own_select on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_settings_own_upsert on public.notification_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_settings_own_update on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid()));

-- ---------- أحداث الإشعارات (تاريخ التسليم) ----------
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  channel text not null default 'in_app' check (channel in ('in_app','system','both')),
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  error text
);
create index notification_events_user_idx on public.notification_events(user_id, delivered_at desc);
alter table public.notification_events enable row level security;
revoke all on public.notification_events from public, anon, authenticated;
grant select, insert, update, delete on public.notification_events to public;
grant select, insert, update, delete on public.notification_events to service_role;
create policy notification_events_own_select on public.notification_events for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- مكتبة الأصوات ----------
create table public.audio_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  kind text not null default 'custom' check (kind in ('system','tone','adhan','custom')),
  url text not null check (char_length(url) > 0),
  duration integer,
  is_default boolean not null default false,
  is_uploaded boolean not null default false,
  uploader_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.audio_resources enable row level security;
revoke all on public.audio_resources from public, anon, authenticated;
grant select, insert, update, delete on public.audio_resources to public;
grant select, insert, update, delete on public.audio_resources to service_role;
create policy audio_resources_select_all on public.audio_resources for select to authenticated
  using (true);
create policy audio_resources_own_insert on public.audio_resources for insert to authenticated
  with check (uploader_id = (select auth.uid()) or uploader_id is null);
create policy audio_resources_own_delete on public.audio_resources for delete to authenticated
  using (uploader_id = (select auth.uid()) or is_default = true);

-- ---------- رموز الأجهزة للمستقبل ----------
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) > 0),
  platform text not null default 'web' check (platform in ('web','android','ios')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens(user_id);
alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.device_tokens to public;
grant select, insert, update, delete on public.device_tokens to service_role;
create policy device_tokens_own_select on public.device_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy device_tokens_own_insert on public.device_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy device_tokens_own_delete on public.device_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- توسيع أنواع الإشعارات ----------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='notifications') then
    alter table public.notifications
    drop constraint if exists notifications_kind_check,
    add constraint notifications_kind_check
    check (kind in ('announcement','join_request','join_decision','course','session','report','system','mudarasa','share','invitation','prayer','reminder','worship','goal','task'));
  end if;
end $$;

-- ---------- دوال RPC للإشعارات والتذكيرات ----------

-- إنشاء تذكير شخصي (يُحشَد user_id من auth.uid())
create or replace function public.create_reminder(
  p_title text,
  p_scheduled_at timestamptz,
  p_description text default '',
  p_recurrence text default 'none',
  p_recurrence_config jsonb default '{}',
  p_sound_id text default null,
  p_category text default 'custom',
  p_linked_goal_id text default null,
  p_linked_task_id text default null,
  p_enabled boolean default true
)
returns public.reminders
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.reminders(
    user_id, title, description, scheduled_at, recurrence, recurrence_config,
    sound_id, category, linked_goal_id, linked_task_id, enabled, created_at, updated_at
  )
  values (
    (select auth.uid()), p_title, p_description, p_scheduled_at, p_recurrence, p_recurrence_config,
    p_sound_id, p_category, p_linked_goal_id, p_linked_task_id, p_enabled, now(), now()
  )
  returning *;
$$;

-- تحديث تذكير (فقط المستلم)
create or replace function public.update_reminder(
  p_reminder_id uuid,
  p_title text default null,
  p_description text default null,
  p_scheduled_at timestamptz default null,
  p_recurrence text default null,
  p_recurrence_config jsonb default null,
  p_sound_id text default null,
  p_category text default null,
  p_linked_goal_id text default null,
  p_linked_task_id text default null,
  p_enabled boolean default null
)
returns public.reminders
language sql
volatile
security definer
set search_path = ''
as $$
  update public.reminders
  set title = coalesce(p_title, title),
      description = coalesce(p_description, description),
      scheduled_at = coalesce(p_scheduled_at, scheduled_at),
      recurrence = coalesce(p_recurrence, recurrence),
      recurrence_config = coalesce(p_recurrence_config, recurrence_config),
      sound_id = coalesce(p_sound_id, sound_id),
      category = coalesce(p_category, category),
      linked_goal_id = coalesce(p_linked_goal_id, linked_goal_id),
      linked_task_id = coalesce(p_linked_task_id, linked_task_id),
      enabled = coalesce(p_enabled, enabled),
      updated_at = now()
  where id = p_reminder_id
    and user_id = (select auth.uid())
  returning *;
$$;

-- حذف تذكير (فقط المستلم)
create or replace function public.delete_reminder(p_reminder_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.reminders
  where id = p_reminder_id
    and user_id = (select auth.uid());
$$;

-- قائمة التذكيرات (فقط المستلم)
create or replace function public.list_reminders()
returns table (
  id uuid, user_id uuid, title text, description text, scheduled_at timestamptz,
  recurrence text, recurrence_config jsonb, sound_id text, category text,
  linked_goal_id text, linked_task_id text, enabled boolean, snooze_until timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, user_id, title, description, scheduled_at, recurrence, recurrence_config,
         sound_id, category, linked_goal_id, linked_task_id, enabled, snooze_until,
         created_at, updated_at
  from public.reminders
  where user_id = (select auth.uid())
  order by scheduled_at;
$$;

-- تأجيل تذكير
create or replace function public.snooze_reminder(p_reminder_id uuid, p_minutes integer default 10)
returns public.reminders
language sql
volatile
security definer
set search_path = ''
as $$
  update public.reminders
  set snooze_until = now() + (p_minutes || ' minutes')::interval,
      updated_at = now()
  where id = p_reminder_id
    and user_id = (select auth.uid())
  returning *;
$$;

-- تفعيل/تعطيل تذكير
create or replace function public.toggle_reminder(p_reminder_id uuid, p_enabled boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.reminders
  set enabled = p_enabled, updated_at = now()
  where id = p_reminder_id
    and user_id = (select auth.uid());
$$;

-- تفضيلات الإشعارات: جلب
create or replace function public.get_notification_preferences()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'user_id', user_id,
      'global_enabled', global_enabled,
      'categories', categories,
      'prayer_settings', prayer_settings,
      'reminder_settings', reminder_settings,
      'quiet_hours', quiet_hours,
      'dnd_enabled', dnd_enabled,
      'updated_at', updated_at
    )
    from public.notification_settings
    where user_id = (select auth.uid())
  ), '{}'::jsonb);
$$;

-- تفضيلات الإشعارات: حفظ/تعديل
create or replace function public.save_notification_preferences(
  p_global_enabled boolean default true,
  p_categories jsonb default '{}',
  p_prayer_settings jsonb default '{}',
  p_reminder_settings jsonb default '{}',
  p_quiet_hours jsonb default '{}',
  p_dnd_enabled boolean default false,
  p_default_sound_id text default null,
  p_default_channel text default 'both',
  p_snooze_minutes integer default 10
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notification_settings(
    user_id, global_enabled, categories, prayer_settings, reminder_settings,
    quiet_hours, dnd_enabled, updated_at
  )
  values (
    (select auth.uid()), p_global_enabled, p_categories, p_prayer_settings,
    p_reminder_settings, p_quiet_hours, p_dnd_enabled, now()
  )
  on conflict (user_id) do update set
    global_enabled = excluded.global_enabled,
    categories = excluded.categories,
    prayer_settings = excluded.prayer_settings,
    reminder_settings = excluded.reminder_settings,
    quiet_hours = excluded.quiet_hours,
    dnd_enabled = excluded.dnd_enabled,
    updated_at = now();
  select coalesce((
    select jsonb_build_object(
      'user_id', user_id,
      'global_enabled', global_enabled,
      'categories', categories,
      'prayer_settings', prayer_settings,
      'reminder_settings', reminder_settings,
      'quiet_hours', quiet_hours,
      'dnd_enabled', dnd_enabled,
      'updated_at', updated_at
    )
    from public.notification_settings
    where user_id = (select auth.uid())
  ), '{}'::jsonb);
$$;

-- تسجيل رمز جهاز (للمستقبل)
create or replace function public.register_device_token(p_token text, p_platform text default 'web')
returns public.device_tokens
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.device_tokens(user_id, token, platform, created_at, last_used_at)
  values ((select auth.uid()), p_token, p_platform, now(), now())
  on conflict (token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    last_used_at = now()
  returning *;
$$;

-- إزالة رمز جهاز
create or replace function public.unregister_device_token(p_token text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.device_tokens
  where token = p_token
    and user_id = (select auth.uid());
$$;

-- ---------- منح الوصول على الدوال ----------
grant execute on function public.create_reminder(text,timestamptz,text,text,jsonb,text,text,text,text,boolean) to authenticated;
grant execute on function public.update_reminder(uuid,text,text,timestamptz,text,jsonb,text,text,text,text,boolean) to authenticated;
grant execute on function public.delete_reminder(uuid) to authenticated;
grant execute on function public.list_reminders() to authenticated;
grant execute on function public.snooze_reminder(uuid,integer) to authenticated;
grant execute on function public.toggle_reminder(uuid,boolean) to authenticated;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.save_notification_preferences(boolean,jsonb,jsonb,jsonb,jsonb,boolean,text,text,integer) to authenticated;
grant execute on function public.register_device_token(text,text) to authenticated;
grant execute on function public.unregister_device_token(text) to authenticated;

-- ---------- بيانات أولية لمكتبة الأصوات ----------
insert into public.audio_resources(title, kind, url, is_default, is_uploaded, created_at)
values
  ('Default System Sound', 'system', 'about:blank', true, false, now()),
  ('Short Notification Tone', 'tone', 'about:blank', false, false, now()),
  ('Makkah Adhan', 'adhan', 'about:blank', false, false, now()),
  ('Madinah Adhan', 'adhan', 'about:blank', false, false, now()),
  ('Silent', 'system', 'about:blank', false, false, now())
on conflict do nothing;

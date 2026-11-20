-- User profile and account settings. The profile lives in user_preferences, which
-- already had owner-only RLS, so no new table is needed and no new exposure is
-- created. Age is stored as a birth year so it never goes stale.
alter table public.user_preferences
  add column first_name text not null default '' check (char_length(btrim(first_name)) <= 60),
  add column last_name text not null default '' check (char_length(btrim(last_name)) <= 60),
  add column country text not null default '' check (char_length(country) <= 80),
  add column birth_year integer check (birth_year between 1900 and 2100),
  add column gender text not null default '' check (gender in ('', 'male', 'female')),
  add column profile_updated_at timestamptz;

create function public.save_user_profile(p_first_name text, p_last_name text, p_country text,
  p_age integer default null, p_gender text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_birth_year integer;
begin
  if v_user is null then
    raise exception 'حفظ الملف الشخصي يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  if p_first_name is null or p_last_name is null or p_country is null then
    raise exception 'الاسم والبلد مطلوبان' using errcode = '22023';
  end if;
  if char_length(btrim(p_first_name)) not between 1 and 60
     or char_length(btrim(p_last_name)) not between 1 and 60 then
    raise exception 'الاسم الأول والاسم الأخير مطلوبان' using errcode = '22023';
  end if;
  if char_length(btrim(p_country)) not between 1 and 80 then
    raise exception 'البلد مطلوب' using errcode = '22023';
  end if;
  if p_gender is null or p_gender not in ('', 'male', 'female') then
    raise exception 'قيمة غير صالحة' using errcode = '22023';
  end if;
  if p_age is not null and (p_age < 13 or p_age > 100) then
    raise exception 'العمر يجب أن يكون بين 13 و100 سنة' using errcode = '22023';
  end if;
  -- Age is stored as a birth year so the value stays correct over time.
  v_birth_year := case when p_age is null then null else extract(year from current_date)::integer - p_age end;
  insert into public.user_preferences
    (user_id, first_name, last_name, country, birth_year, gender, profile_updated_at, updated_at)
  values (v_user, btrim(p_first_name), btrim(p_last_name), btrim(p_country), v_birth_year, p_gender, now(), now())
  on conflict (user_id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    country = excluded.country,
    birth_year = excluded.birth_year,
    gender = excluded.gender,
    profile_updated_at = now(),
    updated_at = now();
end $$;

create function public.update_user_settings(p_timezone text default null, p_locale text default null,
  p_city text default null, p_work_start time default null, p_sleep_time time default null,
  p_prayer_settings jsonb default null, p_notification_preferences jsonb default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'حفظ الإعدادات يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  if p_timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'منطقة زمنية غير معروفة' using errcode = '22023';
  end if;
  if p_locale is not null and p_locale not in ('ar', 'ar-EG', 'ar-SA', 'ar-MA', 'ar-DZ', 'en') then
    raise exception 'لغة غير مدعومة' using errcode = '22023';
  end if;
  if p_prayer_settings is not null and jsonb_typeof(p_prayer_settings) <> 'object' then
    raise exception 'إعدادات الصلاة غير صالحة' using errcode = '22023';
  end if;
  if p_notification_preferences is not null and jsonb_typeof(p_notification_preferences) <> 'object' then
    raise exception 'تفضيلات الإشعارات غير صالحة' using errcode = '22023';
  end if;
  insert into public.user_preferences (user_id, timezone, locale, city, work_start, sleep_time,
      prayer_settings, notification_preferences, updated_at)
  values (v_user,
      coalesce(p_timezone, 'Africa/Cairo'),
      coalesce(p_locale, 'ar'),
      nullif(btrim(coalesce(p_city, '')), ''),
      p_work_start, p_sleep_time,
      coalesce(p_prayer_settings, '{}'::jsonb),
      coalesce(p_notification_preferences, '{}'::jsonb),
      now())
  on conflict (user_id) do update set
    timezone = coalesce(p_timezone, user_preferences.timezone),
    locale = coalesce(p_locale, user_preferences.locale),
    city = coalesce(nullif(btrim(coalesce(p_city, '')), ''), user_preferences.city),
    work_start = coalesce(p_work_start, user_preferences.work_start),
    sleep_time = coalesce(p_sleep_time, user_preferences.sleep_time),
    prayer_settings = coalesce(p_prayer_settings, user_preferences.prayer_settings),
    notification_preferences = coalesce(p_notification_preferences, user_preferences.notification_preferences),
    updated_at = now();
end $$;

-- حذف الحساب: يزيل بيانات المستخدم من جداول المنصة، ثم يُحذف سجل المصادقة.
-- user's own rows cascade from auth.users, so deleting the auth row is enough.
create function public.delete_user_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'حذف الحساب يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  delete from auth.users where id = v_user;
end $$;

revoke all on function public.delete_user_account() from public, anon, authenticated;
grant execute on function public.delete_user_account() to authenticated;
revoke all on function public.save_user_profile(text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.update_user_settings(text, text, text, time, time, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_user_profile(text, text, text, integer, text) to authenticated;
grant execute on function public.update_user_settings(text, text, text, time, time, jsonb, jsonb) to authenticated;

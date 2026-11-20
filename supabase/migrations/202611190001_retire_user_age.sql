-- Retire the age from the user profile: it is no longer collected at signup and
-- no longer stored. The user_preferences.birth_year column and the
-- save_user_profile(p_age) plumbing are removed with it.

alter table public.user_preferences
  drop column if exists birth_year;

drop function if exists public.save_user_profile(text, text, text, integer, text);

create function public.save_user_profile(p_first_name text, p_last_name text, p_country text,
  p_gender text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
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
  insert into public.user_preferences
    (user_id, first_name, last_name, country, gender, profile_updated_at, updated_at)
  values (v_user, btrim(p_first_name), btrim(p_last_name), btrim(p_country), p_gender, now(), now())
  on conflict (user_id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    country = excluded.country,
    gender = excluded.gender,
    profile_updated_at = now(),
    updated_at = now();
end $$;

revoke all on function public.save_user_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_user_profile(text, text, text, text) to authenticated;

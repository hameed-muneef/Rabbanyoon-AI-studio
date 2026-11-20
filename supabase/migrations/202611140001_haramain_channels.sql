-- قسم «من الحرمين الشريفين»: بث مباشر من قناتي القرآن الكريم والسنة النبوية
-- (هيئة الإذاعة السعودية — علولاء). لا نقوم بتوزيع البث: نُظهر الصفحة الرسمية
-- أو رابط HLS الرسمي الذي يحدّده المدير، والقراءة عامة والتعديل للمدير فقط.
-- تعديل الروابط من لوحة الإدارة دون تغيير في الكود.

create table if not exists public.haramain_channels (
  id text primary key,
  title text not null,
  subtitle text,
  -- الصفحة الرسمية للقناة (تُعرض داخل إطار embed) — مطلوبة دائمًا كمسار احتياطي.
  official_url text not null check (official_url ~ '^https://'),
  -- رابط HLS رسمي اختياري (إن أُتاح من المزود). فارغ = عرض الصفحة الرسمية فقط.
  hls_url text check (hls_url is null or hls_url ~ '^https://'),
  sort int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.haramain_channels is
  'قنوات البث المباشر من الحرمين (علولاء/هيئة الإذاعة السعودية)؛ لا إعادة توزيع — روابط رسمية يحدّثها المدير.';

alter table public.haramain_channels enable row level security;

drop policy if exists haramain_channels_read on public.haramain_channels;
drop policy if exists haramain_channels_admin_insert on public.haramain_channels;
drop policy if exists haramain_channels_admin_update on public.haramain_channels;
drop policy if exists haramain_channels_admin_delete on public.haramain_channels;

create policy haramain_channels_read on public.haramain_channels for select to authenticated
  using (is_active or (select public.is_admin()));
create policy haramain_channels_admin_insert on public.haramain_channels for insert to authenticated
  with check ((select public.is_admin()));
create policy haramain_channels_admin_update on public.haramain_channels for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy haramain_channels_admin_delete on public.haramain_channels for delete to authenticated
  using ((select public.is_admin()));

-- القناتان الرسميتان (لا نعيد الكتابة عند وجود الصف: تعديلات المدير محفوظة).
insert into public.haramain_channels (id, title, subtitle, official_url, sort) values
  ('quran', 'قناة القرآن الكريم', 'البث المباشر من الحرم المكي', 'https://aloula.sba.sa/live/quran', 1),
  ('sunna', 'قناة السنة النبوية', 'البث المباشر من المسجد النبوي', 'https://aloula.sba.sa/live/sunna', 2)
on conflict (id) do nothing;

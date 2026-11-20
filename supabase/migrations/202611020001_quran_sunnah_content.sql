-- Quran & Sunnah content foundation (Phase 1).
-- Source text is immutable: authenticated users can only read it, and ordinary
-- admin forms cannot update or delete verses. Corrections are made by importing
-- a new source version and marking the previous one superseded, which keeps an
-- auditable trail. Hadith collections are registered even when their licensed
-- source is not available yet; the UI must show that status honestly.

-- ============ إصدارات المصدر القرآني ============

create table public.quran_source_versions (
  id uuid primary key default gen_random_uuid(),
  version_key text not null unique check (version_key ~ '^[a-z0-9][a-z0-9._-]{2,80}$'),
  source_name text not null,
  source_url text not null default '',
  narration text not null default 'حفص عن عاصم',
  script text not null default 'الرسم العثماني',
  source_file text not null default '',
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_bytes bigint not null default 0 check (source_bytes >= 0),
  asset_sha256 text not null default '' check (asset_sha256 = '' or asset_sha256 ~ '^[0-9a-f]{64}$'),
  asset_text_sha256 text not null default '' check (asset_text_sha256 = '' or asset_text_sha256 ~ '^[0-9a-f]{64}$'),
  verse_count int not null default 0 check (verse_count between 0 and 7000),
  surah_count int not null default 0 check (surah_count between 0 and 114),
  status text not null default 'active' check (status in ('active','superseded','rejected')),
  superseded_by uuid references public.quran_source_versions(id),
  notes text not null default '' check (char_length(notes) <= 2000),
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id)
);

create table public.quran_surahs (
  source_version_id uuid not null references public.quran_source_versions(id) on delete restrict,
  number int not null check (number between 1 and 114),
  name text not null check (char_length(name) between 1 and 80),
  english_name text not null default '',
  revelation_type text not null check (revelation_type in ('مكية','مدنية')),
  revelation_order int not null check (revelation_order between 1 and 114),
  ayah_count int not null check (ayah_count between 1 and 300),
  primary key (source_version_id, number)
);

create table public.quran_verses (
  source_version_id uuid not null references public.quran_source_versions(id) on delete restrict,
  surah_number int not null check (surah_number between 1 and 114),
  ayah_number int not null check (ayah_number between 1 and 300),
  text_uthmani text not null check (char_length(text_uthmani) between 1 and 2000),
  text_search text not null check (char_length(text_search) between 1 and 2000),
  juz int not null check (juz between 1 and 30),
  hizb int not null check (hizb between 1 and 60),
  page int not null check (page between 1 and 604),
  is_sajda boolean not null default false,
  primary key (source_version_id, surah_number, ayah_number),
  foreign key (source_version_id, surah_number) references public.quran_surahs(source_version_id, number) on delete restrict
);
create index quran_verses_page_idx on public.quran_verses(source_version_id, page);
create index quran_verses_juz_idx on public.quran_verses(source_version_id, juz);
create index quran_verses_hizb_idx on public.quran_verses(source_version_id, hizb);

-- ============ الحديث: تسجيل المجموعات وبنيتها ============

create table public.hadith_collections (
  id uuid primary key default gen_random_uuid(),
  collection_key text not null unique check (collection_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  title text not null check (char_length(title) between 2 and 160),
  author text not null default '',
  edition text not null default '',
  editor text not null default '',
  numbering_system text not null default '',
  source_name text not null default '',
  source_url text not null default '',
  license_status text not null default 'blocked' check (license_status in ('blocked','pending','approved')),
  import_status text not null default 'not_imported' check (import_status in ('not_imported','partial','complete')),
  total_narrations int check (total_narrations is null or total_narrations > 0),
  imported_narrations int not null default 0 check (imported_narrations >= 0),
  source_file text not null default '',
  source_sha256 text not null default '' check (source_sha256 = '' or source_sha256 ~ '^[0-9a-f]{64}$'),
  attribution text not null default '',
  notes text not null default '' check (char_length(notes) <= 2000),
  imported_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.hadith_books (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.hadith_collections(id) on delete restrict,
  book_number int not null check (book_number > 0),
  title text not null check (char_length(title) between 1 and 300),
  unique (collection_id, book_number)
);

create table public.hadith_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.hadith_books(id) on delete restrict,
  chapter_number int not null check (chapter_number > 0),
  title text not null check (char_length(title) between 1 and 400),
  unique (book_id, chapter_number)
);

create table public.hadith_narrations (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.hadith_collections(id) on delete restrict,
  book_id uuid references public.hadith_books(id) on delete restrict,
  chapter_id uuid references public.hadith_chapters(id) on delete restrict,
  number_in_collection int not null check (number_in_collection > 0),
  number_in_book int check (number_in_book is null or number_in_book > 0),
  narrator text not null default '',
  text_arabic text not null check (char_length(text_arabic) between 1 and 20000),
  grading_text text not null default '',
  grading_source text not null default '',
  reference_url text not null default '',
  unique (collection_id, number_in_collection)
);
create index hadith_narrations_narrator_idx on public.hadith_narrations(collection_id, narrator);
create index hadith_narrations_book_idx on public.hadith_narrations(book_id, number_in_collection);

-- ============ الصوت: ترخيص منفصل عن الملف ============

create table public.content_audio_licenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  licensor text not null,
  license_text text not null default '',
  license_url text not null default '',
  allows_offline_cache boolean not null default false,
  allows_redistribution boolean not null default false,
  verified_at date,
  verified_by uuid references auth.users(id),
  notes text not null default ''
);

create table public.content_audio_resources (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.content_audio_licenses(id) on delete restrict,
  content_type text not null check (content_type in ('quran','hadith')),
  reciter text not null default '',
  surah_number int check (surah_number is null or surah_number between 1 and 114),
  ayah_from int check (ayah_from is null or ayah_from > 0),
  ayah_to int check (ayah_to is null or ayah_to > 0),
  collection_key text,
  audio_url text not null check (audio_url ~ '^https://'),
  mime_type text not null default 'audio/mpeg',
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  check (ayah_to is null or ayah_from is null or ayah_to >= ayah_from)
);

-- ============ الحماية من تعديل النص ============

create function private.forbid_content_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'المحتوى المصدري غير قابل للتعديل أو الحذف: %', tg_table_name using errcode = '42501';
end $$;
revoke all on function private.forbid_content_mutation() from public, anon, authenticated;

create trigger quran_surahs_immutable before update or delete on public.quran_surahs
  for each row execute function private.forbid_content_mutation();
create trigger quran_verses_immutable before update or delete on public.quran_verses
  for each row execute function private.forbid_content_mutation();
create trigger hadith_books_immutable before update or delete on public.hadith_books
  for each row execute function private.forbid_content_mutation();
create trigger hadith_chapters_immutable before update or delete on public.hadith_chapters
  for each row execute function private.forbid_content_mutation();
create trigger hadith_narrations_immutable before update or delete on public.hadith_narrations
  for each row execute function private.forbid_content_mutation();

create function private.protect_quran_source_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'لا يُحذف إصدار مصدر قرآني' using errcode = '42501';
  end if;
  if new.version_key is distinct from old.version_key
     or new.source_name is distinct from old.source_name
     or new.source_url is distinct from old.source_url
     or new.narration is distinct from old.narration
     or new.script is distinct from old.script
     or new.source_file is distinct from old.source_file
     or new.source_sha256 is distinct from old.source_sha256
     or new.source_bytes is distinct from old.source_bytes
     or new.asset_sha256 is distinct from old.asset_sha256
     or new.asset_text_sha256 is distinct from old.asset_text_sha256
     or new.verse_count is distinct from old.verse_count
     or new.surah_count is distinct from old.surah_count
     or new.imported_at is distinct from old.imported_at
     or new.imported_by is distinct from old.imported_by then
    raise exception 'لا يُعدّل نص إصدار المصدر أو بصمته؛ أنشئ إصدارًا جديدًا' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.protect_quran_source_version() from public, anon, authenticated;

create trigger quran_source_versions_immutable before update or delete on public.quran_source_versions
  for each row execute function private.protect_quran_source_version();

-- ============ الصلاحيات وRLS ============

alter table public.quran_source_versions enable row level security;
alter table public.quran_surahs enable row level security;
alter table public.quran_verses enable row level security;
alter table public.hadith_collections enable row level security;
alter table public.hadith_books enable row level security;
alter table public.hadith_chapters enable row level security;
alter table public.hadith_narrations enable row level security;
alter table public.content_audio_licenses enable row level security;
alter table public.content_audio_resources enable row level security;

revoke all on public.quran_source_versions, public.quran_surahs, public.quran_verses,
  public.hadith_collections, public.hadith_books, public.hadith_chapters, public.hadith_narrations,
  public.content_audio_licenses, public.content_audio_resources from public, anon, authenticated;

grant select on public.quran_source_versions, public.quran_surahs, public.quran_verses,
  public.hadith_collections, public.hadith_books, public.hadith_chapters, public.hadith_narrations,
  public.content_audio_licenses, public.content_audio_resources to authenticated;

-- الاستيراد يتم بمفتاح الخدمة على الخادم فقط؛ لا كتابة من الواجهة.
-- النصوص (السور/الآيات/الأحاديث) للقراءة والإدراج فقط، ولا يمكن تحديثها أو حذفها
-- حتى بمفتاح الخدمة؛ الحماية يفرضها مشغّل قاعدة البيانات أدناه.
grant select, insert on public.quran_source_versions, public.quran_surahs, public.quran_verses,
  public.hadith_collections, public.hadith_books, public.hadith_chapters, public.hadith_narrations,
  public.content_audio_licenses, public.content_audio_resources to service_role;
-- حالة الإصدار (نشط/مستبدل) وبيانات اعتماد المجموعة قابلة للتحديث، مع حماية الحقول المصدرية بمشغّل.
grant update on public.quran_source_versions, public.hadith_collections to service_role;

create policy quran_source_read on public.quran_source_versions for select to authenticated using (true);
create policy quran_surah_read on public.quran_surahs for select to authenticated using (true);
create policy quran_verse_read on public.quran_verses for select to authenticated using (true);
create policy hadith_collection_read on public.hadith_collections for select to authenticated using (true);
create policy hadith_book_read on public.hadith_books for select to authenticated using (true);
create policy hadith_chapter_read on public.hadith_chapters for select to authenticated using (true);
create policy hadith_narration_read on public.hadith_narrations for select to authenticated using (true);
create policy audio_license_read on public.content_audio_licenses for select to authenticated using (true);
create policy audio_resource_read on public.content_audio_resources for select to authenticated using (is_approved);

-- ============ وظائف الإدارة والفحص ============

-- ملخص حالة الاستيراد للوحة الإدارة. لا يعيد نصوص الأحاديث.
create function public.content_import_overview()
returns table (
  kind text, key text, title text, license_status text, import_status text,
  imported_count bigint, expected_count int, version text, sha256 text, updated_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select public.is_admin()), false) is not true then
    raise exception 'عرض حالة الاستيراد يتطلب صلاحية الإدارة' using errcode = '42501';
  end if;
  return query
    select 'quran'::text, v.version_key, v.source_name, 'approved'::text, 'complete'::text,
      (select count(*) from public.quran_verses q where q.source_version_id = v.id),
      v.verse_count, v.version_key, v.asset_sha256, v.imported_at
    from public.quran_source_versions v
    where v.status = 'active'
    union all
    select 'hadith'::text, c.collection_key, c.title, c.license_status, c.import_status,
      (select count(*) from public.hadith_narrations n where n.collection_id = c.id),
      c.total_narrations, coalesce(nullif(c.edition, ''), c.collection_key), c.source_sha256, c.updated_at
    from public.hadith_collections c
    order by 1, 2;
end $$;

-- فحص سلامة النص القرآني على الخادم. يفشل بوضوح عند أي نقص أو تكرار.
create function public.quran_content_integrity()
returns table (check_name text, passed boolean, detail text)
language plpgsql security definer set search_path = '' as $$
declare
  v_version uuid;
  v_verses bigint;
  v_surahs bigint;
  v_duplicates bigint;
  v_bad_order bigint;
begin
  if coalesce((select public.is_admin()), false) is not true then
    raise exception 'فحص سلامة المحتوى يتطلب صلاحية الإدارة' using errcode = '42501';
  end if;
  select id into v_version from public.quran_source_versions where status = 'active' order by imported_at desc limit 1;
  if v_version is null then
    return query select 'active_source'::text, false, 'لا يوجد إصدار مصدر نشط'::text;
    return;
  end if;
  select count(*) into v_verses from public.quran_verses where source_version_id = v_version;
  select count(*) into v_surahs from public.quran_surahs where source_version_id = v_version;
  select count(*) into v_duplicates from (
    select surah_number, ayah_number from public.quran_verses
    where source_version_id = v_version
    group by surah_number, ayah_number having count(*) > 1
  ) d;
  select count(*) into v_bad_order from public.quran_surahs s
   where s.source_version_id = v_version
     and exists (
       select 1 from public.quran_verses q
        where q.source_version_id = v_version and q.surah_number = s.number
          and q.ayah_number > s.ayah_count
     );
  return query
    select 'surahs'::text, v_surahs = 114, format('السور: %s', v_surahs)
    union all select 'verses', v_verses = 6236, format('الآيات: %s', v_verses)
    union all select 'duplicates', v_duplicates = 0, format('التكرار: %s', v_duplicates)
    union all select 'ordering', v_bad_order = 0, format('خارج ترتيب السورة: %s', v_bad_order)
    union all select 'checksum', exists (
      select 1 from public.quran_source_versions v where v.id = v_version and v.asset_sha256 ~ '^[0-9a-f]{64}$'
    ), 'بصمة الأصل المشتق مسجلة';
end $$;

revoke all on function public.content_import_overview() from public, anon, authenticated;
revoke all on function public.quran_content_integrity() from public, anon, authenticated;
grant execute on function public.content_import_overview() to authenticated;
grant execute on function public.quran_content_integrity() to authenticated;

-- المجموعتان معروضتان دائمًا بحالة صريحة، حتى قبل توفر المصدر المرخص.
insert into public.hadith_collections(collection_key, title, author, edition, numbering_system, source_name, source_url, license_status, import_status, total_narrations, imported_narrations, attribution, notes)
values
  ('bukhari', 'صحيح البخاري', 'الإمام محمد بن إسماعيل البخاري', 'fawazahmed0/hadith-api Arabic file ara-bukhari; printed edition unspecified', 'hadithnumber + book; convention unverified', 'fawazahmed0/hadith-api Arabic data; content rights unverified', 'https://github.com/fawazahmed0/hadith-api/tree/df57907be35291c91ad6a6691180e22ca9920784', 'pending', 'not_imported', null, 0, 'Text and database rights are unverified; exact upstream provenance is not established.', 'معاينة التطوير تعرض 7,580 متنًا من 7,589 سجلًا مصدرًا؛ تسعة سجلات بلا متن. لا تُعد المجموعة مكتملة أو مرخصة، ولا يوجد استيراد إلى قاعدة الإنتاج.'),
  ('muslim', 'صحيح مسلم', 'الإمام مسلم بن الحجاج', 'fawazahmed0/hadith-api Arabic file ara-muslim; printed edition unspecified', 'hadithnumber + book; convention unverified', 'fawazahmed0/hadith-api Arabic data; content rights unverified', 'https://github.com/fawazahmed0/hadith-api/tree/df57907be35291c91ad6a6691180e22ca9920784', 'pending', 'not_imported', null, 0, 'Text and database rights are unverified; exact upstream provenance is not established.', 'معاينة التطوير تعرض 7,360 متنًا من 7,563 سجلًا مصدرًا؛ 203 سجلات بلا متن. لا تُعد المجموعة مكتملة أو مرخصة، ولا يوجد استيراد إلى قاعدة الإنتاج.')
on conflict (collection_key) do nothing;

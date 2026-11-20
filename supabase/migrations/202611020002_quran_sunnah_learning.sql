-- Quran & Sunnah personal learning data (Phase 2).
-- Every row belongs to exactly one authenticated user. Source content lives in
-- separate immutable tables (202611020001); nothing here can alter Quran or
-- Hadith text. Reflections are private by default and never public.

-- ============ القراءة ============

create table public.quran_reading_positions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  surah_number int not null check (surah_number between 1 and 114),
  ayah_number int not null check (ayah_number between 1 and 300),
  juz int check (juz is null or juz between 1 and 30),
  page int check (page is null or page between 1 and 604),
  updated_at timestamptz not null default now()
);

create table public.quran_bookmarks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  surah_number int not null check (surah_number between 1 and 114),
  ayah_number int not null check (ayah_number between 1 and 300),
  label text not null default '' check (char_length(label) <= 200),
  created_at timestamptz not null default now()
);
create index quran_bookmarks_user_idx on public.quran_bookmarks(user_id, created_at desc);
create unique index quran_bookmarks_unique_idx on public.quran_bookmarks(user_id, surah_number, ayah_number, label);

create table public.quran_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  surah_number int not null check (surah_number between 1 and 114),
  ayah_start int not null check (ayah_start between 1 and 300),
  ayah_end int not null check (ayah_end between 1 and 300),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ayah_end >= ayah_start)
);
create index quran_notes_user_idx on public.quran_notes(user_id, created_at desc);

create table public.quran_reading_history (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  surah_number int not null check (surah_number between 1 and 114),
  ayah_start int not null check (ayah_start between 1 and 300),
  ayah_end int not null check (ayah_end between 1 and 300),
  read_at timestamptz not null default now(),
  check (ayah_end >= ayah_start)
);
create index quran_reading_history_user_idx on public.quran_reading_history(user_id, read_at desc);

-- ============ الحفظ والمراجعة (قرآن وحديث) ============

create table public.memorization_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('quran','hadith')),
  title text not null check (char_length(title) between 1 and 200),
  start_surah int check (start_surah is null or start_surah between 1 and 114),
  start_ayah int check (start_ayah is null or start_ayah between 1 and 300),
  end_surah int check (end_surah is null or end_surah between 1 and 114),
  end_ayah int check (end_ayah is null or end_ayah between 1 and 300),
  collection_key text,
  hadith_start int check (hadith_start is null or hadith_start > 0),
  hadith_end int check (hadith_end is null or hadith_end > 0),
  daily_target int not null default 3 check (daily_target between 1 and 604),
  target_unit text not null default 'verses' check (target_unit in ('verses','hadith','pages')),
  schedule jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule) = 'object'),
  status text not null default 'active' check (status in ('active','paused','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (content_type = 'quran' and start_surah is not null and start_ayah is not null)
    or (content_type = 'hadith' and collection_key is not null and hadith_start is not null)
  )
);
create index memorization_plans_user_idx on public.memorization_plans(user_id, status, created_at desc);

create table public.memorization_passages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.memorization_plans(id) on delete set null,
  content_type text not null check (content_type in ('quran','hadith')),
  surah_number int check (surah_number is null or surah_number between 1 and 114),
  ayah_start int check (ayah_start is null or ayah_start between 1 and 300),
  ayah_end int check (ayah_end is null or ayah_end between 1 and 300),
  collection_key text,
  hadith_number int check (hadith_number is null or hadith_number > 0),
  state text not null default 'new' check (state in ('new','learning','needs_revision','good','mastered')),
  ease numeric(5,2) not null default 2.50 check (ease between 1.30 and 3.50),
  interval_days int not null default 0 check (interval_days between 0 and 3650),
  due_date date,
  last_reviewed_at timestamptz,
  review_count int not null default 0 check (review_count >= 0),
  lapses int not null default 0 check (lapses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (content_type = 'quran' and surah_number is not null and ayah_start is not null and ayah_end is not null)
    or (content_type = 'hadith' and collection_key is not null and hadith_number is not null)
  ),
  check (ayah_end is null or ayah_start is null or ayah_end >= ayah_start)
);
create index memorization_passages_user_due_idx on public.memorization_passages(user_id, due_date);
create index memorization_passages_plan_idx on public.memorization_passages(plan_id);

create table public.revision_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid not null references public.memorization_passages(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  quality int not null check (quality between 0 and 5),
  outcome text not null check (outcome in ('failed','passed')),
  next_due_date date,
  interval_days int not null check (interval_days between 0 and 3650)
);
create index revision_events_user_idx on public.revision_events(user_id, reviewed_at desc);

-- ============ التأمل والتطبيق ============

create table public.quran_reflections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('quran','hadith')),
  surah_number int check (surah_number is null or surah_number between 1 and 114),
  ayah_start int check (ayah_start is null or ayah_start between 1 and 300),
  ayah_end int check (ayah_end is null or ayah_end between 1 and 300),
  collection_key text,
  hadith_number int check (hadith_number is null or hadith_number > 0),
  learned text not null default '' check (char_length(learned) <= 2000),
  meaning text not null default '' check (char_length(meaning) <= 2000),
  action text not null default '' check (char_length(action) <= 2000),
  trait text not null default '' check (char_length(trait) <= 500),
  intention text not null default '' check (char_length(intention) <= 500),
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'quran' and surah_number is not null and ayah_start is not null)
    or (source_type = 'hadith' and collection_key is not null and hadith_number is not null)
  )
);
create index quran_reflections_user_idx on public.quran_reflections(user_id, created_at desc);

-- ============ الورد اليومي ============

create table public.quran_routine_activities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quran_reading','quran_memorization','quran_revision','hadith_reading','hadith_memorization','reflection')),
  slot text not null check (slot in ('fajr','duha','dhuhr','asr','maghrib','isha','any')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  days int[] not null default '{0,1,2,3,4,5,6}'::int[],
  enabled boolean not null default true,
  linked_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (days <@ '{0,1,2,3,4,5,6}'::int[])
);
create index quran_routine_user_idx on public.quran_routine_activities(user_id, enabled);

-- ============ السنة: العلامات والملاحظات ============

create table public.hadith_bookmarks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_key text not null,
  hadith_number int not null check (hadith_number > 0),
  label text not null default '' check (char_length(label) <= 200),
  created_at timestamptz not null default now()
);
create index hadith_bookmarks_user_idx on public.hadith_bookmarks(user_id, created_at desc);
create unique index hadith_bookmarks_unique_idx on public.hadith_bookmarks(user_id, collection_key, hadith_number, label);

-- ============ إعدادات القراءة ============

create table public.quran_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  font_size int not null default 30 check (font_size between 18 and 64),
  theme text not null default 'light' check (theme in ('light','dark')),
  updated_at timestamptz not null default now()
);

-- ============ تسجيلات المستخدم ============

create table public.user_recitation_recordings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid references public.memorization_passages(id) on delete set null,
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  mime_type text not null check (mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  duration_seconds int check (duration_seconds is null or duration_seconds between 1 and 1800),
  created_at timestamptz not null default now()
);
create index user_recitation_recordings_user_idx on public.user_recitation_recordings(user_id, created_at desc);

create trigger quran_reading_positions_touch before update on public.quran_reading_positions
  for each row execute function private.set_updated_at();
create trigger quran_notes_touch before update on public.quran_notes
  for each row execute function private.set_updated_at();
create trigger memorization_plans_touch before update on public.memorization_plans
  for each row execute function private.set_updated_at();
create trigger memorization_passages_touch before update on public.memorization_passages
  for each row execute function private.set_updated_at();
create trigger quran_reflections_touch before update on public.quran_reflections
  for each row execute function private.set_updated_at();
create trigger quran_routine_activities_touch before update on public.quran_routine_activities
  for each row execute function private.set_updated_at();
create trigger quran_user_settings_touch before update on public.quran_user_settings
  for each row execute function private.set_updated_at();

-- ============ الصلاحيات وRLS: الملكية الفردية ============

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'quran_reading_positions','quran_bookmarks','quran_notes','quran_reading_history',
    'memorization_plans','memorization_passages','revision_events','quran_reflections',
    'quran_routine_activities','hadith_bookmarks','quran_user_settings','user_recitation_recordings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name || '_owner_read', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', table_name || '_owner_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_owner_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', table_name || '_owner_delete', table_name);
  end loop;
end $$;

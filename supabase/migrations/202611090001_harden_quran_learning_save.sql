-- Quran & Sunnah learning sync (Phase 3).
-- One atomic RPC saves the user's local learning state into the normalized
-- tables, and one loads it back. Ownership is always derived from auth.uid();
-- a caller cannot write another user's rows even by forging JSON keys.

create or replace function public.save_quran_learning_state(p_state jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_position jsonb;
begin
  if v_user is null then
    raise exception 'حفظ بيانات القرآن والسنة يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'بيانات التعلم غير صالحة' using errcode = '22023';
  end if;
  if octet_length(p_state::text) > 2097152 then
    raise exception 'حجم بيانات التعلم كبير جدًا' using errcode = '22023';
  end if;

  -- القراءة: موضع واحد لكل مستخدم
  delete from public.quran_reading_positions where user_id = v_user;
  v_position := p_state -> 'readingPosition';
  if v_position is not null and jsonb_typeof(v_position) = 'object'
     and nullif(v_position->>'surah','') is not null
     and nullif(v_position->>'ayah','') is not null then
    insert into public.quran_reading_positions(user_id, surah_number, ayah_number, juz, page, updated_at)
    values (
      v_user, nullif(v_position->>'surah','')::int, nullif(v_position->>'ayah','')::int,
      nullif(v_position->>'juz','')::int, nullif(v_position->>'page','')::int,
      coalesce(nullif(v_position->>'updatedAt','')::timestamptz, now())
    )
    on conflict (user_id) do update set
      surah_number=excluded.surah_number, ayah_number=excluded.ayah_number,
      juz=excluded.juz, page=excluded.page, updated_at=excluded.updated_at;
  end if;

  delete from public.revision_events where user_id = v_user;
  delete from public.memorization_passages where user_id = v_user;
  delete from public.memorization_plans where user_id = v_user;
  delete from public.quran_bookmarks where user_id = v_user;
  delete from public.quran_notes where user_id = v_user;
  delete from public.quran_reading_history where user_id = v_user;
  delete from public.quran_reflections where user_id = v_user;
  delete from public.quran_routine_activities where user_id = v_user;
  delete from public.hadith_bookmarks where user_id = v_user;

  insert into public.quran_bookmarks(id, user_id, surah_number, ayah_number, label, created_at)
  select nullif(item->>'id','')::uuid, v_user, nullif(item->>'surah','')::int, nullif(item->>'ayah','')::int,
    left(coalesce(item->>'label',''), 200), coalesce(nullif(item->>'createdAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'bookmarks','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'surah','') is not null
    and nullif(item->>'ayah','') is not null
  on conflict (user_id, surah_number, ayah_number, label) do nothing;

  insert into public.quran_notes(id, user_id, surah_number, ayah_start, ayah_end, body, created_at, updated_at)
  select nullif(item->>'id','')::uuid, v_user, nullif(item->>'surah','')::int, nullif(item->>'ayahStart','')::int, nullif(item->>'ayahEnd','')::int,
    left(item->>'body', 4000), coalesce(nullif(item->>'createdAt','')::timestamptz, now()),
    coalesce(nullif(item->>'updatedAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'notes','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'surah','') is not null
    and nullif(item->>'ayahStart','') is not null
    and nullif(item->>'ayahEnd','') is not null
    and char_length(coalesce(item->>'body','')) between 1 and 4000;

  insert into public.quran_reading_history(id, user_id, surah_number, ayah_start, ayah_end, read_at)
  select nullif(item->>'id','')::uuid, v_user, nullif(item->>'surah','')::int, nullif(item->>'ayahStart','')::int, nullif(item->>'ayahEnd','')::int,
    coalesce(nullif(item->>'readAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'history','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'surah','') is not null
    and nullif(item->>'ayahStart','') is not null
    and nullif(item->>'ayahEnd','') is not null;

  insert into public.memorization_plans(
    id, user_id, content_type, title, start_surah, start_ayah, end_surah, end_ayah,
    collection_key, hadith_start, hadith_end, daily_target, target_unit, schedule, status, created_at, updated_at)
  select (item->>'id')::uuid, v_user, item->>'contentType', left(item->>'title',200),
    nullif(item->>'startSurah','')::int, nullif(item->>'startAyah','')::int,
    nullif(item->>'endSurah','')::int, nullif(item->>'endAyah','')::int,
    nullif(item->>'collectionKey',''), nullif(item->>'hadithStart','')::int, nullif(item->>'hadithEnd','')::int,
    coalesce(nullif(item->>'dailyTarget','')::int, 3), coalesce(nullif(item->>'targetUnit',''), 'verses'),
    coalesce(item->'schedule', '{}'::jsonb), coalesce(nullif(item->>'status',''), 'active'),
    coalesce(nullif(item->>'createdAt','')::timestamptz, now()),
    coalesce(nullif(item->>'updatedAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'plans','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'contentType','') is not null;

  insert into public.memorization_passages(
    id, user_id, plan_id, content_type, surah_number, ayah_start, ayah_end, collection_key,
    hadith_number, state, ease, interval_days, due_date, last_reviewed_at, review_count, lapses, created_at, updated_at)
  select (item->>'id')::uuid, v_user, nullif(item->>'planId','')::uuid, item->>'contentType',
    nullif(item->>'surah','')::int, nullif(item->>'ayahStart','')::int, nullif(item->>'ayahEnd','')::int,
    nullif(item->>'collectionKey',''), nullif(item->>'hadithNumber','')::int,
    coalesce(nullif(item->>'state',''), 'new'), coalesce(nullif(item->>'ease','')::numeric, 2.50),
    coalesce(nullif(item->>'intervalDays','')::int, 0), nullif(item->>'dueDate','')::date,
    nullif(item->>'lastReviewedAt','')::timestamptz,
    coalesce(nullif(item->>'reviewCount','')::int, 0), coalesce(nullif(item->>'lapses','')::int, 0),
    coalesce(nullif(item->>'createdAt','')::timestamptz, now()),
    coalesce(nullif(item->>'updatedAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'passages','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'contentType','') is not null;

  insert into public.revision_events(id, user_id, passage_id, reviewed_at, quality, outcome, next_due_date, interval_days)
  select nullif(item->>'id','')::uuid, v_user, nullif(item->>'passageId','')::uuid,
    coalesce(nullif(item->>'reviewedAt','')::timestamptz, now()),
    coalesce(nullif(item->>'quality','')::int, 0), item->>'outcome', nullif(item->>'nextDueDate','')::date,
    coalesce(nullif(item->>'intervalDays','')::int, 0)
  from jsonb_array_elements(coalesce(p_state->'revisionEvents','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'passageId','') is not null
    and exists (select 1 from public.memorization_passages p where p.id = nullif(item->>'passageId','')::uuid and p.user_id = v_user);

  insert into public.quran_reflections(
    id, user_id, source_type, surah_number, ayah_start, ayah_end, collection_key, hadith_number,
    learned, meaning, action, trait, intention, is_private, created_at, updated_at)
  select (item->>'id')::uuid, v_user, item->>'sourceType',
    nullif(item->>'surah','')::int, nullif(item->>'ayahStart','')::int, nullif(item->>'ayahEnd','')::int,
    nullif(item->>'collectionKey',''), nullif(item->>'hadithNumber','')::int,
    left(coalesce(item->>'learned',''),2000), left(coalesce(item->>'meaning',''),2000),
    left(coalesce(item->>'action',''),2000), left(coalesce(item->>'trait',''),500),
    left(coalesce(item->>'intention',''),500), coalesce((item->>'isPrivate')::boolean, true),
    coalesce(nullif(item->>'createdAt','')::timestamptz, now()),
    coalesce(nullif(item->>'updatedAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'reflections','[]'::jsonb)) item
  where nullif(item->>'id','') is not null;

  insert into public.quran_routine_activities(id, user_id, kind, slot, config, days, enabled, linked_task_id, created_at, updated_at)
  select (item->>'id')::uuid, v_user, item->>'kind', item->>'slot',
    coalesce(item->'config','{}'::jsonb),
    case when jsonb_typeof(item->'days') = 'array' and jsonb_array_length(item->'days') > 0
      then array(select jsonb_array_elements_text(item->'days'))::int[]
      else '{0,1,2,3,4,5,6}'::int[] end,
    coalesce((item->>'enabled')::boolean, true), nullif(item->>'linkedTaskId',''),
    coalesce(nullif(item->>'createdAt','')::timestamptz, now()),
    coalesce(nullif(item->>'updatedAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'routine','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'kind','') is not null
    and nullif(item->>'slot','') is not null;

  insert into public.hadith_bookmarks(id, user_id, collection_key, hadith_number, label, created_at)
  select nullif(item->>'id','')::uuid, v_user, item->>'collectionKey', nullif(item->>'hadithNumber','')::int,
    left(coalesce(item->>'label',''),200), coalesce(nullif(item->>'createdAt','')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state->'hadithBookmarks','[]'::jsonb)) item
  where nullif(item->>'id','') is not null
    and nullif(item->>'collectionKey','') is not null
    and nullif(item->>'hadithNumber','') is not null;

  insert into public.quran_user_settings(user_id, font_size, theme, updated_at)
  values (
    v_user,
    coalesce(nullif(p_state->'settings'->>'fontSize','')::int, 30),
    coalesce(nullif(p_state->'settings'->>'theme',''), 'light'),
    now()
  )
  on conflict (user_id) do update set
    font_size = excluded.font_size, theme = excluded.theme, updated_at = now();
end $$;

create or replace function public.load_quran_learning_state()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'تحميل بيانات القرآن والسنة يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'readingPosition', (
      select jsonb_build_object('surah', p.surah_number, 'ayah', p.ayah_number,
        'juz', p.juz, 'page', p.page, 'updatedAt', p.updated_at)
      from public.quran_reading_positions p where p.user_id = v_user
    ),
    'bookmarks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'surah', b.surah_number, 'ayah', b.ayah_number,
        'label', b.label, 'createdAt', b.created_at) order by b.created_at desc)
      from public.quran_bookmarks b where b.user_id = v_user), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'surah', n.surah_number, 'ayahStart', n.ayah_start,
        'ayahEnd', n.ayah_end, 'body', n.body, 'createdAt', n.created_at, 'updatedAt', n.updated_at)
        order by n.created_at desc)
      from public.quran_notes n where n.user_id = v_user), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'surah', h.surah_number, 'ayahStart', h.ayah_start,
        'ayahEnd', h.ayah_end, 'readAt', h.read_at) order by h.read_at desc)
      from public.quran_reading_history h where h.user_id = v_user), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'contentType', m.content_type, 'title', m.title,
        'startSurah', m.start_surah, 'startAyah', m.start_ayah, 'endSurah', m.end_surah, 'endAyah', m.end_ayah,
        'collectionKey', m.collection_key, 'hadithStart', m.hadith_start, 'hadithEnd', m.hadith_end,
        'dailyTarget', m.daily_target, 'targetUnit', m.target_unit, 'schedule', m.schedule,
        'status', m.status, 'createdAt', m.created_at, 'updatedAt', m.updated_at) order by m.created_at desc)
      from public.memorization_plans m where m.user_id = v_user), '[]'::jsonb),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'planId', g.plan_id, 'contentType', g.content_type,
        'surah', g.surah_number, 'ayahStart', g.ayah_start, 'ayahEnd', g.ayah_end,
        'collectionKey', g.collection_key, 'hadithNumber', g.hadith_number, 'state', g.state,
        'ease', g.ease, 'intervalDays', g.interval_days, 'dueDate', g.due_date,
        'lastReviewedAt', g.last_reviewed_at, 'reviewCount', g.review_count, 'lapses', g.lapses,
        'createdAt', g.created_at, 'updatedAt', g.updated_at) order by g.created_at)
      from public.memorization_passages g where g.user_id = v_user), '[]'::jsonb),
    'revisionEvents', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'passageId', e.passage_id, 'reviewedAt', e.reviewed_at,
        'quality', e.quality, 'outcome', e.outcome, 'nextDueDate', e.next_due_date,
        'intervalDays', e.interval_days) order by e.reviewed_at desc)
      from public.revision_events e where e.user_id = v_user), '[]'::jsonb),
    'reflections', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'sourceType', r.source_type, 'surah', r.surah_number,
        'ayahStart', r.ayah_start, 'ayahEnd', r.ayah_end, 'collectionKey', r.collection_key,
        'hadithNumber', r.hadith_number, 'learned', r.learned, 'meaning', r.meaning, 'action', r.action,
        'trait', r.trait, 'intention', r.intention, 'isPrivate', r.is_private,
        'createdAt', r.created_at, 'updatedAt', r.updated_at) order by r.created_at desc)
      from public.quran_reflections r where r.user_id = v_user), '[]'::jsonb),
    'routine', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'slot', a.slot, 'config', a.config,
        'days', to_jsonb(a.days), 'enabled', a.enabled, 'linkedTaskId', a.linked_task_id,
        'createdAt', a.created_at, 'updatedAt', a.updated_at) order by a.created_at)
      from public.quran_routine_activities a where a.user_id = v_user), '[]'::jsonb),
    'hadithBookmarks', coalesce((
      select jsonb_agg(jsonb_build_object('id', hb.id, 'collectionKey', hb.collection_key,
        'hadithNumber', hb.hadith_number, 'label', hb.label, 'createdAt', hb.created_at) order by hb.created_at desc)
      from public.hadith_bookmarks hb where hb.user_id = v_user), '[]'::jsonb),
    'settings', (
      select jsonb_build_object('fontSize', s.font_size, 'theme', s.theme)
      from public.quran_user_settings s where s.user_id = v_user
    ),
    'updatedAt', now()
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.save_quran_learning_state(jsonb) from public, anon, authenticated;
revoke all on function public.load_quran_learning_state() from public, anon, authenticated;
grant execute on function public.save_quran_learning_state(jsonb) to authenticated;
grant execute on function public.load_quran_learning_state() to authenticated;

-- مفاتيح الميزات: المحتوى الأساسي مجاني، وتُدار حالة التفعيل من لوحة الإدارة.
insert into public.platform_features(key, title, description, enabled, requires_premium)
values
  ('quran_sunnah', 'القرآن والسنة', 'المصحف الشريف وحفظ القرآن ومراجعته ومكتبة الصحيحين والورد اليومي', true, false),
  ('quran_reader', 'المصحف الشريف', 'قراءة القرآن بالرسم العثماني والبحث والعلامات', true, false),
  ('quran_memorization', 'حفظ القرآن ومراجعته', 'خطط الحفظ والمراجعة المتباعدة', true, false),
  ('hadith_library', 'مكتبة الصحيحين', 'قراءة البخاري ومسلم وحفظ السنة', true, false),
  ('daily_quran_routine', 'وردي اليومي', 'جدولة أنشطة القرآن والسنة ضمن المهام اليومية', true, false)
on conflict (key) do nothing;

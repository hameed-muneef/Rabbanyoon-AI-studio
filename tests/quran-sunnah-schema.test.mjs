import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  admin: '33333333-3333-4333-8333-333333333333'
};
const uuid = {
  bookmark: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bobBookmark: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  note: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  history: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  plan: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  passage: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  reflection: '11111111-2222-4333-8444-555555555555',
  routine: '66666666-7777-4888-8999-aaaaaaaaaaaa',
  hadithBookmark: '99999999-9999-4999-8999-bbbbbbbbbbbb'
};

const learningState = () => ({
  settings: {fontSize: 32, theme: 'dark'},
  readingPosition: {surah: 2, ayah: 255, juz: 3, page: 42, updatedAt: '2026-11-02T08:00:00.000Z'},
  bookmarks: [{id: uuid.bookmark, surah: 1, ayah: 1, label: 'علامة', createdAt: '2026-11-02T08:00:00.000Z'}],
  notes: [{id: uuid.note, surah: 1, ayahStart: 1, ayahEnd: 1, body: 'ملاحظة خاصة', createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z'}],
  history: [{id: uuid.history, surah: 1, ayahStart: 1, ayahEnd: 7, readAt: '2026-11-02T08:00:00.000Z'}],
  plans: [{
    id: uuid.plan, contentType: 'quran', title: 'خطة حفظ', startSurah: 1, startAyah: 1,
    endSurah: 1, endAyah: 7, dailyTarget: 3, targetUnit: 'verses',
    schedule: {days: [0, 1, 2, 3, 4, 5, 6]}, status: 'active',
    createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z'
  }],
  passages: [{
    id: uuid.passage, planId: uuid.plan, contentType: 'quran', surah: 1, ayahStart: 1, ayahEnd: 3,
    state: 'learning', ease: 2.5, intervalDays: 0, dueDate: '2026-11-02',
    reviewCount: 0, lapses: 0, createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z'
  }],
  revisionEvents: [],
  reflections: [{
    id: uuid.reflection, sourceType: 'quran', surah: 1, ayahStart: 1, ayahEnd: 1,
    learned: 'درس', meaning: '', action: 'عمل', trait: '', intention: '',
    isPrivate: true, createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z'
  }],
  routine: [{
    id: uuid.routine, kind: 'quran_reading', slot: 'fajr', config: {}, days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true, createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z'
  }],
  hadithBookmarks: [{id: uuid.hadithBookmark, collectionKey: 'bukhari', hadithNumber: 1, label: '', createdAt: '2026-11-02T08:00:00.000Z'}]
});

async function setup() {
  const db = new PGlite({extensions: {pgcrypto}});
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key, bucket_id text, name text);
    alter table storage.objects enable row level security; create extension if not exists pgcrypto;`);
  for (const id of Object.values(ids)) await db.query('insert into auth.users(id) values($1)', [id]);
  await db.exec('begin');
  await applyMigrations(client, await readMigrations());
  await db.exec('commit');
  await db.query('insert into public.admin_accounts(user_id) values($1)', [ids.admin]);

  const q = (sql, params) => db.query(sql, params);
  const asRole = async (role, id, fn) => {
    await db.exec(`set role ${role}`);
    if (id) await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    else await db.query("select set_config('request.jwt.claim.sub', '', false)");
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const asUser = (id, fn) => asRole('authenticated', id, fn);
  const asService = fn => asRole('service_role', null, fn);
  const fails = async (promise, code) => {
    await assert.rejects(promise, error => {
      if (code) assert.equal(error.code, code, error.message);
      return true;
    });
  };
  return {db, q, asUser, asService, fails};
}

async function seedSource({q, asService}) {
  return asService(async () => {
    const version = (await q(`insert into public.quran_source_versions(
        version_key, source_name, source_sha256, source_bytes, asset_sha256, asset_text_sha256, verse_count, surah_count, status)
      values('test-hafs-v1', 'مجمع الملك فهد', repeat('a', 64), 1000, repeat('b', 64), repeat('c', 64), 1, 1, 'active')
      returning id`)).rows[0].id;
    await q(`insert into public.quran_surahs(source_version_id, number, name, english_name, revelation_type, revelation_order, ayah_count)
      values($1, 1, 'الفاتحة', 'Al-Fatihah', 'مكية', 5, 1)`, [version]);
    await q(`insert into public.quran_verses(source_version_id, surah_number, ayah_number, text_uthmani, text_search, juz, hizb, page)
      values($1, 1, 1, 'بِسْمِ ٱللَّهِ ۝١', 'بسم الله', 1, 1, 1)`, [version]);
    return version;
  });
}

test('Quran and Hadith source content is immutable and read-only for users', async () => {
  const {q, asUser, asService, fails} = await setup();
  const version = await seedSource({q, asService});

  await asUser(ids.alice, async () => {
    assert.equal((await q('select count(*)::int as n from public.quran_verses')).rows[0].n, 1);
    assert.equal((await q('select count(*)::int as n from public.hadith_collections')).rows[0].n, 2);
    await fails(q(`insert into public.quran_verses(source_version_id, surah_number, ayah_number, text_uthmani, text_search, juz, hizb, page)
      values($1, 1, 2, 'x', 'x', 1, 1, 1)`, [version]), '42501');
    await fails(q(`update public.quran_surahs set name = 'تحريف'`), '42501');
    await fails(q('delete from public.quran_verses'), '42501');
    await fails(q(`insert into public.hadith_narrations(collection_id, number_in_collection, text_arabic)
      select id, 1, 'نص' from public.hadith_collections limit 1`), '42501');
  });

  // Even the table owner cannot rewrite source text: database triggers enforce it.
  await fails(q(`update public.quran_verses set text_uthmani = 'محرف'`), '42501');
  await fails(q('delete from public.quran_verses'), '42501');
  await fails(q(`update public.quran_surahs set ayah_count = 99`), '42501');
  await fails(q(`update public.quran_source_versions set source_sha256 = repeat('d', 64)`), '42501');
  await fails(q('delete from public.quran_source_versions'), '42501');

  await asService(async () => {
    await fails(q(`update public.quran_verses set text_uthmani = 'محرف'`), '42501');
    await fails(q('delete from public.quran_verses'), '42501');
    await fails(q(`update public.quran_source_versions set source_sha256 = repeat('d', 64)`), '42501');
    await q(`update public.quran_source_versions set status = 'superseded' where id = $1`, [version]);
  });

  const status = (await q('select status from public.quran_source_versions where id = $1', [version])).rows[0].status;
  assert.equal(status, 'superseded', 'حالة الإصدار قابلة للتحديث مع بقاء النص مقفلًا');
  const text = (await q('select text_uthmani from public.quran_verses where source_version_id = $1', [version])).rows[0].text_uthmani;
  assert.equal(text, 'بِسْمِ ٱللَّهِ ۝١', 'النص المصدر لم يتغير');
});

test('Hadith collections remain blocked until rights and completeness are verified', async () => {
  const {q} = await setup();
  const rows = (await q(`select collection_key, license_status, import_status, total_narrations, imported_narrations
    from public.hadith_collections order by collection_key`)).rows;
  assert.deepEqual(rows.map(row => row.collection_key), ['bukhari', 'muslim']);
  for (const row of rows) {
    assert.equal(row.license_status, 'pending');
    assert.equal(row.import_status, 'not_imported');
    assert.equal(row.total_narrations, null);
    assert.equal(row.imported_narrations, 0);
  }
});

test('admin overview and integrity checks require admin privileges', async () => {
  const {q, asUser, asService} = await setup();
  await seedSource({q, asService});

  await asUser(ids.alice, async () => {
    await assert.rejects(q('select * from public.content_import_overview()'), error => {
      assert.equal(error.code, '42501');
      return true;
    });
    await assert.rejects(q('select * from public.quran_content_integrity()'), error => {
      assert.equal(error.code, '42501');
      return true;
    });
  });

  await asUser(ids.admin, async () => {
    const overview = (await q('select * from public.content_import_overview()')).rows;
    const hadith = overview.filter(row => row.kind === 'hadith');
    assert.equal(hadith.length, 2);
    assert.ok(hadith.every(row => row.license_status === 'pending' && row.import_status === 'not_imported' && Number(row.imported_count) === 0));
    const quran = overview.find(row => row.kind === 'quran');
    assert.equal(quran.key, 'test-hafs-v1');
    assert.equal(Number(quran.imported_count), 1);

    const integrity = (await q('select * from public.quran_content_integrity()')).rows;
    const byName = Object.fromEntries(integrity.map(row => [row.check_name, row.passed]));
    assert.equal(byName.duplicates, true);
    assert.equal(byName.ordering, true);
    assert.equal(byName.checksum, true);
    assert.equal(byName.verses, false, 'الإصدار الاختباري لا يساوي 6236 آية');
    assert.equal(byName.surahs, false);
  });
});

test('learning state RPC saves and loads only the caller rows', async () => {
  const {q, asUser} = await setup();
  const state = learningState();

  await asUser(ids.alice, async () => {
    await q('select public.save_quran_learning_state($1::jsonb)', [JSON.stringify(state)]);
    const loaded = (await q('select public.load_quran_learning_state() as state')).rows[0].state;
    assert.equal(loaded.settings.fontSize, 32);
    assert.equal(loaded.settings.theme, 'dark');
    assert.equal(loaded.readingPosition.surah, 2);
    assert.equal(loaded.bookmarks.length, 1);
    assert.equal(loaded.notes.length, 1);
    assert.equal(loaded.history.length, 1);
    assert.equal(loaded.plans.length, 1);
    assert.equal(loaded.passages.length, 1);
    assert.equal(loaded.reflections.length, 1);
    assert.equal(loaded.reflections[0].isPrivate, true);
    assert.equal(loaded.routine.length, 1);
    assert.equal(loaded.hadithBookmarks.length, 1);
    assert.deepEqual(loaded.routine[0].days, [0, 1, 2, 3, 4, 5, 6]);

    const owned = (await q('select user_id from public.quran_bookmarks')).rows;
    assert.equal(owned.length, 1);
    assert.equal(owned[0].user_id, ids.alice);
  });

  await asUser(ids.bob, async () => {
    const loaded = (await q('select public.load_quran_learning_state() as state')).rows[0].state;
    assert.deepEqual(loaded.bookmarks, []);
    assert.deepEqual(loaded.notes, []);
    assert.deepEqual(loaded.passages, []);
    assert.deepEqual(loaded.reflections, []);
    assert.equal(loaded.settings, null);
    assert.equal((await q('select count(*)::int as n from public.quran_bookmarks')).rows[0].n, 0);
  });

  // Forging another user's id in a direct insert is rejected by RLS.
  await asUser(ids.alice, async () => {
    await assert.rejects(q(`insert into public.quran_bookmarks(id, user_id, surah_number, ayah_number)
      values($1, $2, 1, 1)`, [uuid.bobBookmark, ids.bob]), error => {
      assert.equal(error.code, '42501');
      return true;
    });
  });

  // Saving again replaces only the caller's rows.
  const trimmed = {...state, bookmarks: [], notes: []};
  await asUser(ids.alice, async () => {
    await q('select public.save_quran_learning_state($1::jsonb)', [JSON.stringify(trimmed)]);
    const loaded = (await q('select public.load_quran_learning_state() as state')).rows[0].state;
    assert.deepEqual(loaded.bookmarks, []);
    assert.deepEqual(loaded.notes, []);
    assert.equal(loaded.plans.length, 1);
  });
});

test('saving learning state requires an authenticated caller', async () => {
  const {q, asUser} = await setup();
  await asUser(null, async () => {
    await assert.rejects(q('select public.save_quran_learning_state($1::jsonb)', [JSON.stringify(learningState())]), error => {
      assert.equal(error.code, '42501');
      return true;
    });
    await assert.rejects(q('select public.load_quran_learning_state()'), error => {
      assert.equal(error.code, '42501');
      return true;
    });
  });
});

test('Quran feature keys are registered without premium lock', async () => {
  const {q} = await setup();
  const keys = (await q(`select key, enabled, requires_premium from public.platform_features
    where key in ('quran_sunnah','quran_reader','quran_memorization','hadith_library','daily_quran_routine')`)).rows;
  assert.equal(keys.length, 5);
  for (const row of keys) {
    assert.equal(row.enabled, true);
    assert.equal(row.requires_premium, false);
  }
});

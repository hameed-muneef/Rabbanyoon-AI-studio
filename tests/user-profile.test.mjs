import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

// الملف الشخصي وإعدادات الحساب: الاسم والبلد والعمر تُحفظ لمالكها وحده،
// ولا يكتبها المتصفح مباشرة، ولا يراها غيره.
test('user profile: identity, age as birth year, settings, ownership', async () => {
  const db = new PGlite({extensions: {pgcrypto}});
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  async function asUser(id, fn) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { await fn(); } finally { await db.exec('reset role'); }
  }
  try {
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
    await db.exec(`insert into auth.users(id) values ('${owner}'),('${other}')`);
    await db.exec('begin');
    await applyMigrations(client, await readMigrations());
    await db.exec('commit');

    // 1) حفظ الملف الشخصي: الاسم والبلد والعمر والجنس.
    await asUser(owner, async () => {
      await db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['محمد', 'أحمد', 'مصر', 28, '']);
      const row = (await db.query('select * from public.user_preferences where user_id=$1', [owner])).rows[0];
      assert.equal(row.first_name, 'محمد');
      assert.equal(row.last_name, 'أحمد');
      assert.equal(row.country, 'مصر');
      assert.equal(row.gender, '');
      // العمر يُحفظ كسنة ميلاد: 2026 - 28 = 1998
      assert.equal(row.birth_year, new Date().getFullYear() - 28);
      assert.ok(row.profile_updated_at);
    });

    // 2) غير المالك لا يرى صف صاحب الحساب ولا يستطيع الكتابة عليه.
    await asUser(other, async () => {
      await db.query("update public.user_preferences set first_name='مزيف' where user_id=$1", [owner]);
      assert.equal((await db.query('select count(*)::int as n from public.user_preferences where user_id=$1', [owner])).rows[0].n, 0);
      await assert.rejects(db.query("insert into public.user_preferences(user_id,first_name,last_name,country) values($1,'أ','ب','مصر')", [owner]), e => e.code === '42501');
    });

    // 3) غير المالك لا يرى ملف صاحب الحساب، لكن يستطيع أن يحفظ ملفه هو فقط.
    await asUser(other, async () => {
      assert.equal((await db.query('select count(*)::int as n from public.user_preferences')).rows[0].n, 0);
      await db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['س', 'ص', 'اليمن', 30, '']);
      const rows = (await db.query('select user_id from public.user_preferences')).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].user_id, other);
    });

    // 4) قيم غير صالحة → 22023 (اسم فارغ، بلد فارغ، عمر خارج النطاق، جنس غير معروف).
    await asUser(owner, async () => {
      await assert.rejects(db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['', 'أحمد', 'مصر', 28, '']), e => e.code === '22023');
      await assert.rejects(db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['محمد', 'أحمد', '', 28, '']), e => e.code === '22023');
      await assert.rejects(db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['محمد', 'أحمد', 'مصر', 5, '']), e => e.code === '22023');
      await assert.rejects(db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['محمد', 'أحمد', 'مصر', 200, '']), e => e.code === '22023');
      await assert.rejects(db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['محمد', 'أحمد', 'مصر', 28, 'other']), e => e.code === '22023');
    });

    // 5) إعدادات الحساب: المنطقة الزمنية واللغة والمدينة والمواعيد والتفضيلات.
    await asUser(owner, async () => {
      await db.query('select public.update_user_settings($1,$2,$3,$4,$5,$6,$7)',
        ['Asia/Riyadh', 'ar', 'الرياض', '06:00', '23:30',
          JSON.stringify({fajr: '05:10'}),
          JSON.stringify({enabled: true, sounds: false, email_digest: true})]);
      const row = (await db.query('select * from public.user_preferences where user_id=$1', [owner])).rows[0];
      assert.equal(row.timezone, 'Asia/Riyadh');
      assert.equal(row.city, 'الرياض');
      assert.equal(row.locale, 'ar');
      assert.equal(row.notification_preferences.enabled, true);
      assert.equal(row.notification_preferences.sounds, false);
      assert.ok(row.work_start);
    });

    // 6) منطقة زمنية أو لغة غير صالحة → 22023.
    await asUser(owner, async () => {
      await assert.rejects(db.query('select public.update_user_settings($1)', ['Not/AZone']), e => e.code === '22023');
      await assert.rejects(db.query('select public.update_user_settings($1,$2)', ['Africa/Cairo', 'fr']), e => e.code === '22023');
    });

    // 7) تحديث الإعدادات لا يمس الملف الشخصي.
    await asUser(owner, async () => {
      await db.query('select public.update_user_settings($1)', ['Africa/Cairo']);
      const row = (await db.query('select first_name, country from public.user_preferences where user_id=$1', [owner])).rows[0];
      assert.equal(row.first_name, 'محمد');
      assert.equal(row.country, 'مصر');
    });

    // 8) حذف الحساب: يزيل صف التفضيلات مع المستخدم.
    await asUser(owner, async () => {
      await db.query('select public.delete_user_account()');
      assert.equal((await db.query('select count(*)::int as n from public.user_preferences where user_id=$1', [owner])).rows[0].n, 0);
    });

    // 9) بلا جلسة: الحفظ والحذف مرفوضان.
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.save_user_profile($1,$2,$3,$4,$5)', ['أ', 'ب', 'مصر', 20, '']), e => e.code === '42501');
    await db.exec('reset role');
  } finally { await db.close(); }
});

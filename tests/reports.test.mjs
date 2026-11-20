import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

test('reports: submit, dedup, rate limit, admin review, privacy', async () => {
  const db = new PGlite({extensions: {pgcrypto}});
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  const reporter = '11111111-1111-4111-8111-111111111111';
  const admin = '33333333-3333-4333-8333-333333333333';
  const other = '22222222-2222-4222-8222-222222222222';
  const target = '44444444-4444-4444-8444-444444444444';
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
    await db.exec(`insert into auth.users(id) values ('${reporter}'),('${admin}'),('${other}')`);
    await db.exec('begin');
    await applyMigrations(client, await readMigrations());
    await db.exec('commit');
    await db.query('insert into public.admin_accounts(user_id) values($1)', [admin]);

    // 1) إرسال: مُبلِّغ غير مشرف يُنشئ إبلاغًا مفتوحًا.
    let reportId = '';
    await asUser(reporter, async () => {
      reportId = (await db.query('select public.submit_report($1,$2,$3,$4)', ['course', target, 'spam', 'تفاصيل'])).rows[0].submit_report;
      assert.match(reportId, /^[0-9a-f-]{36}$/i);
    });

    // 2) تكرار على نفس الهدف: P0001.
    await asUser(reporter, async () => {
      await assert.rejects(db.query('select public.submit_report($1,$2,$3)', ['course', target, 'spam']), e => e.code === 'P0001');
    });

    // 3) خصوصية: مُبلِّغ يرى إبلاغه فقط؛ غير المشرف (other) لا يرى.
    await asUser(reporter, async () => {
      assert.equal((await db.query('select count(*)::int as n from public.reports')).rows[0].n, 1);
    });
    await asUser(other, async () => {
      assert.equal((await db.query('select count(*)::int as n from public.reports')).rows[0].n, 0);
    });

    // 4) المشرف يرى الإبلاغ ويراجعه.
    await asUser(admin, async () => {
      const list = (await db.query('select * from public.list_reports($1)', ['open'])).rows;
      assert.equal(list.length, 1);
      assert.equal(list[0].report_id, reportId);
      await db.query('select public.review_report($1,$2,$3)', [reportId, 'actioned', 'تم الإجراء']);
    });
    await asUser(reporter, async () => {
      const rows = (await db.query('select status, admin_note from public.reports where id=$1', [reportId])).rows[0];
      assert.equal(rows.status, 'actioned');
      assert.equal(rows.admin_note, 'تم الإجراء');
    });

    // 5) غير المشرف لا يراجع.
    await asUser(reporter, async () => {
      await assert.rejects(db.query('select public.review_report($1,$2)', [reportId, 'dismissed']), e => e.code === '42501');
    });

    // 6) قيم غير صالحة: target_type/reason/status → 22023.
    await asUser(reporter, async () => {
      await assert.rejects(db.query('select public.submit_report($1,$2,$3)', ['invalid', target, 'spam']), e => e.code === '22023');
      await assert.rejects(db.query('select public.submit_report($1,$2,$3)', ['course', target, 'nope']), e => e.code === '22023');
    });
    await asUser(admin, async () => {
      await assert.rejects(db.query('select public.review_report($1,$2)', [reportId, 'bogus']), e => e.code === '22023');
    });

    // 7) كتابة مباشرة ممنوعة.
    await asUser(reporter, async () => {
      await assert.rejects(db.query("insert into public.reports(reporter_id,target_type,target_id,reason) values($1,'course',$2,'spam')", [reporter, target]), e => e.code === '42501');
    });

    // 8) حد الإبلاغات المفتوحة (10).
    await asUser(reporter, async () => {
      for (let i = 0; i < 10; i++) {
        await db.query('select public.submit_report($1,$2,$3)', ['course', `00000000-0000-0000-0000-00000000000${i}`.slice(0,36).padEnd(36,'0'), 'other']);
      }
      await assert.rejects(db.query('select public.submit_report($1,$2,$3)', ['course', '99999999-9999-4999-8999-999999999999', 'other']), e => e.code === 'P0001');
    });
  } finally { await db.close(); }
});

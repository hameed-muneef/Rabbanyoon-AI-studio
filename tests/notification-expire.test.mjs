import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
};

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
  await db.query('insert into auth.users(id) values($1)', [ids.a]);
  await db.exec('begin');
  await applyMigrations(client, await readMigrations());
  await db.exec('commit');
  const asUser = async (id, fn) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const q = (sql, params) => db.query(sql, params);
  return {db, q, asUser};
}

test('expire_my_notifications: unread older than 30 minutes become read', async () => {
  const {db, q, asUser} = await setup();
  try {
    const now = new Date();
    const seed = async (mins, read = false) =>
      (await q(`insert into public.notifications(recipient_id,kind,title,created_at,read_at)
                values($1,'system','t',now()-make_interval(mins=>$2),$3) returning id`,
        [ids.a, mins, read ? new Date() : null])).rows[0].id;

    // 10 min ago (fresh) & 40 min ago (stale) & already-read stale
    const fresh = await seed(10);
    const stale = await seed(40);
    const alreadyRead = await seed(40, true);

    await asUser(ids.a, async () => {
      // No expiry yet: unread count includes both fresh + stale
      const before = Number((await q('select public.unread_notification_count() as n')).rows[0].n);
      assert.equal(before, 2);

      // Expire at 30 minutes
      const expired = Number((await q('select public.expire_my_notifications(30) as n')).rows[0].n);
      assert.equal(expired, 1);

      // Only fresh remains unread; stale is now read
      const after = Number((await q('select public.unread_notification_count() as n')).rows[0].n);
      assert.equal(after, 1);

      const staleRow = (await q('select read_at from public.notifications where id=$1', [stale])).rows[0];
      assert.notEqual(staleRow.read_at, null);
      const freshRow = (await q('select read_at from public.notifications where id=$1', [fresh])).rows[0];
      assert.equal(freshRow.read_at, null);
      const alreadyRow = (await q('select read_at from public.notifications where id=$1', [alreadyRead])).rows[0];
      assert.notEqual(alreadyRow.read_at, null);

      // Second call is idempotent
      const again = Number((await q('select public.expire_my_notifications(30) as n')).rows[0].n);
      assert.equal(again, 0);
    });
  } finally {
    await db.close();
  }
});

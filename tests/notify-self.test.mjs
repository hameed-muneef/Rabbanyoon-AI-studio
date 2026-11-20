import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222'
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
  for (const id of Object.values(ids)) await db.query('insert into auth.users(id) values($1)', [id]);
  await db.exec('begin');
  await applyMigrations(client, await readMigrations());
  await db.exec('commit');
  const asUser = async (id, fn) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  return {db, asUser};
}

test('notify_self: self-only reminder records, validation and category', async () => {
  const {db, asUser} = await setup();
  try {
    await asUser(ids.a, async () => {
      await db.query("select public.notify_self('prayer','حان وقت الظهر','','settings')");
      await db.query("select public.notify_self('reminder','تذكير','نص','')");
      await db.query("select public.notify_self('reminder','تذكير','نص آخر','')");
    });
    const rows = (await db.query('select recipient_id, kind, category from public.notifications order by kind')).rows;
    assert.deepEqual(rows.map(r => [r.recipient_id, r.kind, r.category]),
      [[ids.a, 'prayer', 'reminder'], [ids.a, 'reminder', 'reminder']]);

    await assert.rejects(asUser(ids.a, () => db.query("select public.notify_self('announcement','x','','')")));
    await assert.rejects(asUser(ids.a, () => db.query("select public.notify_self('prayer','','','')")));

    const listed = await asUser(ids.b, async () =>
      (await db.query("select * from public.list_notifications(20, 0, 'reminder')")).rows);
    assert.equal(listed.length, 0, 'other users never see these rows');
    const mine = await asUser(ids.a, async () =>
      (await db.query("select * from public.list_notifications(20, 0, 'reminder')")).rows);
    assert.equal(mine.length, 2, 'identical recent self-notifications are deduplicated');
  } finally { await db.close(); }
});

test('purge_my_old_notifications: only own read rows older than retention', async () => {
  const {db, asUser} = await setup();
  try {
    const seed = (user, days, read) => db.query(
      `insert into public.notifications(recipient_id,kind,title,created_at,read_at)
       values($1,'system','x',now()-make_interval(days=>$2),$3)`, [user, days, read ? new Date() : null]);
    await seed(ids.a, 120, true);   // purged
    await seed(ids.a, 120, false);  // unread: kept
    await seed(ids.a, 10, true);    // recent: kept
    await seed(ids.b, 120, true);   // someone else's: kept
    const removed = await asUser(ids.a, async () => (await db.query('select public.purge_my_old_notifications(90) as n')).rows[0].n);
    assert.equal(removed, 1);
    assert.equal((await db.query('select count(*)::int as n from public.notifications')).rows[0].n, 3);
    await assert.rejects(asUser(ids.a, () => db.query('select public.purge_my_old_notifications(5)')));
  } finally { await db.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
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

  const q = (sql, params) => db.query(sql, params);
  const asRole = async (role, id, fn) => {
    await db.exec(`set role ${role}`);
    if (id) await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    else await db.query("select set_config('request.jwt.claim.sub', '', false)");
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const asUser = (id, fn) => asRole('authenticated', id, fn);
  const asService = fn => asRole('service_role', null, fn);
  return {db, q, asUser, asService};
}

test('Notification engine: reminders CRUD with RLS ownership', async () => {
  const {q, asUser, asService} = await setup();

  // insert a seed reminder via service_role
  await asService(async () => {
    await q(`insert into public.reminders(user_id, title, description, scheduled_at, recurrence, enabled)
      values($1, 'تذكير تجريبي', 'وصف تجريبي', $2, 'none', true)`, [ids.alice, '2026-12-01T10:00:00Z']);
  });

  await asUser(ids.alice, async () => {
    // alice sees own reminder
    const rows = (await q('select id, title, enabled from public.reminders order by id')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'تذكير تجريبي');

    // alice creates new reminder via RPC - then verify via table query
    await q(`select public.create_reminder($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
      'تذكير جديد', '2026-12-02T09:00:00Z', 'وصف', 'daily', '{}', null, 'custom', null, null, true
    ]);
    const allRows = (await q('select title from public.reminders order by id')).rows;
    assert.ok(allRows.some(r => r.title === 'تذكير جديد'));

    // alice updates reminder
    const newTitle = 'تذكير معدل';
    const createdId = (await q('select id from public.reminders where title = $1', ['تذكير جديد'])).rows[0].id;
    await q(`select public.update_reminder($1, $2)`, [createdId, newTitle]);
    const updated = (await q('select title from public.reminders where id = $1', [createdId])).rows[0];
    assert.equal(updated.title, newTitle);

    // alice toggles reminder
    await q(`select public.toggle_reminder($1, $2)`, [createdId, false]);
    const toggled = (await q('select enabled from public.reminders where id = $1', [createdId])).rows[0];
    assert.equal(toggled.enabled, false);

    // alice snoozes reminder
    await q(`select public.snooze_reminder($1, $2)`, [createdId, 10]);
    const snoozed = (await q('select snooze_until from public.reminders where id = $1', [createdId])).rows[0];
    assert.ok(snoozed.snooze_until !== null);

    // alice deletes reminder
    await q(`select public.delete_reminder($1)`, [createdId]);
    const remaining = (await q('select count(*)::int as n from public.reminders where id = $1', [createdId])).rows[0];
    assert.equal(remaining.n, 0);
  });

  // bob cannot see alice's reminders (RLS filters them out → 0 rows)
  await asUser(ids.bob, async () => {
    const rows = (await q('select count(*)::int as n from public.reminders')).rows[0];
    assert.equal(rows.n, 0);
  });
});

test('Notification engine: notification_settings upsert and select', async () => {
  const {q, asUser} = await setup();

  await asUser(ids.alice, async () => {
    // save preferences - should not throw
    await q(`select public.save_notification_preferences($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
      true,
      '{"prayer": true, "reminder": true}',
      '{"الفجر": {"enabled": true, "adhan_type": "full", "channel": "both"}}',
      '{"default_channel": "both", "snooze_minutes": 10}',
      '{"enabled": false, "start": "22:00", "end": "06:00"}',
      false,
      null,
      'both',
      10
    ]);
    // get preferences - should return an object
    let prefs = (await q('select public.get_notification_preferences()')).rows[0].get_notification_preferences;
    if (typeof prefs === 'string') prefs = JSON.parse(prefs);
    assert.ok(prefs, 'prefs should be an object');
    assert.ok(typeof prefs === 'object', 'prefs should be an object');
  });

  // bob sees empty/default (no row → empty object)
  await asUser(ids.bob, async () => {
    let prefs = (await q('select public.get_notification_preferences()')).rows[0].get_notification_preferences;
    if (typeof prefs === 'string') prefs = JSON.parse(prefs);
    assert.equal(Object.keys(prefs).length, 0);
  });
});

test('Notification engine: audio_resources RLS', async () => {
  const {q, asUser, asService} = await setup();

  await asService(async () => {
    await q(`insert into public.audio_resources(title, kind, url, is_default, is_uploaded)
      values($1, $2, $3, $4, $5)`, ['نغمة تجريبية', 'tone', 'https://example.com/tone.mp3', false, false]);
  });

  await asUser(ids.alice, async () => {
    const rows = (await q('select title, kind from public.audio_resources order by title')).rows;
    assert.ok(rows.some(r => r.title === 'نغمة تجريبية'));
  });

  // bob can select (public grant) but sees default rows too
  await asUser(ids.bob, async () => {
    const rows = (await q('select count(*)::int as n from public.audio_resources')).rows[0];
    assert.equal(rows.n, 1); // placeholder rows were removed; only the real tone remains
  });
});

test('Notification engine: device_tokens RLS', async () => {
  const {q, asUser} = await setup();

  await asUser(ids.alice, async () => {
    await q(`select public.register_device_token($1, $2)`, ['token-abc-123', 'web']);
    // alice can see her own token
    const tokens = (await q("select token from public.device_tokens where token = $1", ['token-abc-123'])).rows;
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].token, 'token-abc-123');
  });

  // bob cannot see alice's token (RLS)
  await asUser(ids.bob, async () => {
    const rows = (await q("select count(*)::int as n from public.device_tokens where token = $1", ['token-abc-123'])).rows[0];
    assert.equal(rows.n, 0);
  });
});

test('Notification engine: notification_events RLS', async () => {
  const {q, asUser, asService} = await setup();

  await asService(async () => {
    const notif = (await q(`insert into public.notifications(recipient_id, kind, title, body)
      values($1, 'reminder', $2, $3) returning id`, [ids.alice, 'تذكير', 'نص'])).rows[0];
    await q(`insert into public.notification_events(notification_id, user_id, channel, status)
      values($1, $2, $3, $4)`, [notif.id, ids.alice, 'in_app', 'delivered']);
  });

  // alice sees her own events
  await asUser(ids.alice, async () => {
    const rows = (await q('select count(*)::int as n from public.notification_events')).rows[0];
    assert.equal(rows.n, 1);
  });

  // bob sees no events (RLS)
  await asUser(ids.bob, async () => {
    const rows = (await q('select count(*)::int as n from public.notification_events')).rows[0];
    assert.equal(rows.n, 0);
  });
});

test('Notification engine: unauthenticated create_reminder fails', async () => {
  const {q} = await setup();
  // auth.uid() returns NULL → NOT NULL violation on user_id
  await assert.rejects(q(`select public.create_reminder($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
    'x', '2026-12-01T10:00:00Z', '', 'none', '{}', null, 'custom', null, null, true
  ]));
});

test('Adhan library: only admins manage adhan; users see active rows only; custom sounds stay private', async () => {
  const {db, q, asUser} = await setup();
  await db.query('insert into public.admin_accounts(user_id) values($1)', [ids.alice]);
  const row = (title, extra = '') => q(`insert into public.audio_resources(title, kind, url, license_note, is_uploaded, uploader_id)
    values($1, 'adhan', 'https://cdn.example/adhan.mp3', $2, true, $3)`, [title, 'CC0', ids.alice]);

  await asUser(ids.alice, async () => { await row('أذان معتمد'); });
  await asUser(ids.bob, async () => {
    await assert.rejects(() => row('أذان غير مصرح'));
    const rows = (await q("select title from public.audio_resources where kind = 'adhan'")).rows;
    assert.deepEqual(rows.map(r => r.title), ['أذان معتمد']);
    await q('delete from public.audio_resources where title = $1', ['أذان معتمد']);
    assert.equal((await q("select count(*)::int n from public.audio_resources where kind = 'adhan'")).rows[0].n, 1);
  });

  await asUser(ids.alice, async () => {
    await q("update public.audio_resources set is_active = false where title = 'أذان معتمد'");
    await assert.rejects(() => q(`insert into public.audio_resources(title, kind, url, is_uploaded, uploader_id)
      values('بلا ترخيص', 'adhan', 'https://cdn.example/x.mp3', true, $1)`, [ids.alice]));
    await assert.rejects(() => q(`insert into public.audio_resources(title, kind, url, license_note, uploader_id)
      values('رابط غير آمن', 'tone', 'http://cdn.example/x.mp3', 'CC0', $1)`, [ids.alice]));
  });
  await asUser(ids.bob, async () => {
    assert.equal((await q("select count(*)::int n from public.audio_resources where kind = 'adhan'")).rows[0].n, 0);
    await q(`insert into public.audio_resources(title, kind, url, is_uploaded, uploader_id)
      values('صوتي', 'custom', 'https://cdn.example/mine.mp3', true, $1)`, [ids.bob]);
  });
  await asUser(ids.alice, async () => {
    const custom = (await q("select count(*)::int n from public.audio_resources where kind = 'custom'")).rows[0].n;
    assert.equal(custom, 0);
  });
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

// NTF-003 acceptance: one notification feed with derived categories, server-side
// filters, pagination, recipient isolation, and read state that never changes
// the lifecycle of the invitation it points to.

const ids = {
  a: '11111111-1111-4111-8111-111111111111',
  b: '22222222-2222-4222-8222-222222222222',
  admin: '44444444-4444-4444-8444-444444444444'
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
  await db.query('insert into public.admin_accounts(user_id) values($1)', [ids.admin]);
  const asUser = async (id, fn) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const q = (sql, params) => db.query(sql, params);
  const fails = async (promise, code) => {
    await assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });
  };
  return {db, q, asUser, fails};
}

test('notification center: categories, filters, pagination, isolation, read/invitation independence', async () => {
  const {db, q, asUser, fails} = await setup();
  try {
    const seed = async (recipient, kind, title, minutes, read = false) =>
      (await q(`insert into public.notifications(recipient_id,kind,title,created_at,read_at)
                values($1,$2,$3,now()-make_interval(mins=>$4),$5) returning id`,
        [recipient, kind, title, minutes, read ? new Date() : null])).rows[0].id;

    await seed(ids.a, 'invitation', 'دعوة مدارسة', 1);
    await seed(ids.a, 'course', 'مجلس جديد', 2);
    await seed(ids.a, 'share', 'مشاركة مصدر', 3);
    await seed(ids.a, 'system', 'تنبيه نظام', 4);
    await seed(ids.a, 'report', 'نتيجة بلاغ', 5);
    await seed(ids.a, 'announcement', 'إعلان عام', 6, true);
    const foreign = await seed(ids.b, 'invitation', 'دعوة خاصة بغيري', 1);

    // The generated category column classifies old and new rows alike.
    const categories = Object.fromEntries((await q(
      "select kind, category from public.notifications where recipient_id=$1", [ids.a]
    )).rows.map(row => [row.kind, row.category]));
    assert.deepEqual(categories, {
      invitation: 'invitation', course: 'activity', share: 'resource',
      system: 'system', report: 'system', announcement: 'activity'
    });

    await asUser(ids.a, async () => {
      // Recipient isolation: only my rows are returned.
      const all = (await q('select * from public.list_notifications()')).rows;
      assert.equal(all.length, 6);
      assert.equal(all.some(row => row.notification_id === foreign), false);
      assert.deepEqual(Object.keys(all[0]).sort(), [
        'created_at', 'notification_body', 'notification_category', 'notification_id',
        'notification_kind', 'notification_link', 'notification_title', 'read_at'
      ]);

      assert.equal((await q("select * from public.list_notifications(null,null,'invitation',null)")).rows.length, 1);
      assert.equal((await q("select * from public.list_notifications(null,null,'activity',null)")).rows.length, 2);
      assert.equal((await q("select * from public.list_notifications(null,null,'resource',null)")).rows.length, 1);
      assert.equal((await q("select * from public.list_notifications(null,null,'system',null)")).rows.length, 2);
      assert.equal((await q("select * from public.list_notifications(null,null,null,true)")).rows.length, 5);

      // Offset pagination is stable and does not repeat rows.
      const first = (await q('select * from public.list_notifications(2,0,null,false)')).rows;
      const second = (await q('select * from public.list_notifications(2,2,null,false)')).rows;
      assert.equal(first.length, 2);
      assert.equal(second.length, 2);
      assert.equal(first[0].notification_kind, 'invitation');
      assert.equal(first[1].notification_kind, 'course');
      assert.equal(first.some(a => second.some(b => a.notification_id === b.notification_id)), false);

      await fails(q("select * from public.list_notifications(null,null,'unknown',null)"), '22023');
      // RLS still limits the table; no direct writes are granted.
      assert.equal((await q('select id from public.notifications')).rows.length, 6);
      await fails(q("insert into public.notifications(recipient_id,kind,title) values($1,'system','x')", [ids.a]), '42501');
    });

    // Unauthenticated callers cannot read any feed.
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await fails(q('select * from public.list_notifications()'), '42501');
    await db.exec('reset role');

    // Read state is mine only; another member's notification is untouched.
    await asUser(ids.a, async () => {
      const mine = (await q("select notification_id from public.list_notifications(null,null,'invitation',null)")).rows[0].notification_id;
      const before = Number((await q('select public.unread_notification_count() as n')).rows[0].n);
      assert.equal(before, 5);
      await q('select public.mark_notification_read($1)', [mine]);
      assert.equal(Number((await q('select public.unread_notification_count() as n')).rows[0].n), 4);
      await q('select public.mark_notification_read($1)', [foreign]);
      await q('select public.mark_all_notifications_read()');
      assert.equal(Number((await q('select public.unread_notification_count() as n')).rows[0].n), 0);
    });
    assert.equal((await q('select read_at from public.notifications where id=$1', [foreign])).rows[0].read_at, null);

    // Reading an invitation notification must not accept the invitation.
    await asUser(ids.b, async () => { await q('select public.save_my_share_profile($1,$2,$3)', ['bob_center', 'Bob', true]); });
    let inviteId;
    await asUser(ids.a, async () => {
      const circle = (await q("select public.create_study_circle('Fiqh','book','fiqh','async','','','approval',null,null,null,'','') as id")).rows[0].id;
      await q('select public.invite_study_member($1,$2)', [circle, 'bob_center']);
    });
    inviteId = (await q('select id from public.study_member_invites where invitee_id=$1', [ids.b])).rows[0].id;
    await asUser(ids.b, async () => {
      const inviteNotification = (await q("select notification_id from public.list_notifications(null,null,'invitation',null) where notification_title like 'دعوة إلى مدارسة%'")).rows[0].notification_id;
      await q('select public.mark_notification_read($1)', [inviteNotification]);
    });
    assert.equal((await q('select status from public.study_member_invites where id=$1', [inviteId])).rows[0].status, 'pending');

    await asUser(ids.b, async () => {
      await q('select public.respond_study_invite($1,true)', [inviteId]);
    });
    assert.equal((await q('select status from public.study_member_invites where id=$1', [inviteId])).rows[0].status, 'accepted');
    assert.equal((await q("select count(*)::int n from public.notifications where recipient_id=$1 and kind='invitation' and title like 'قبل دعوتك%'", [ids.a])).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

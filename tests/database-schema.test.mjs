import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

test('database migrations: isolation, constraints, privileges and repeat deployment', async () => {
  const db = new PGlite();
  const client = {query:async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  const alice = '11111111-1111-4111-8111-111111111111';
  const bob = '22222222-2222-4222-8222-222222222222';
  const admin = '33333333-3333-4333-8333-333333333333';
  async function asUser(id, fn) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { await fn(); } finally { await db.exec('reset role'); }
  }
  async function rejectsCode(sql, code) {
    await assert.rejects(db.query(sql), error => error.code === code);
  }
  try {
    // Only Supabase-owned infrastructure is mocked; migrations run as PostgreSQL SQL.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth, public to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key, bucket_id text, name text);
      alter table storage.objects enable row level security;`);
    const migrations = await readMigrations();
    await db.exec('begin');
    await applyMigrations(client, migrations);
    await db.exec('commit');
    assert.equal((await db.query('select count(*)::int as n from private.schema_migrations')).rows[0].n, migrations.length);
    const tableNames = ['user_preferences','goals','goal_actions','goal_progress_entries','planner_items',
      'day_records','activity_logs','reflections','adhkar_catalog','user_wirds','wird_period_totals',
      'learning_paths','learning_units','learning_stations','learning_resources','station_resources',
      'user_learning_progress','reading_progress'];
    const tables = (await db.query("select tablename, rowsecurity from pg_tables where schemaname='public'")).rows;
    for (const name of tableNames) assert.equal(tables.find(t => t.tablename === name)?.rowsecurity, true, name);

    // Approval works in either order, but never grants unconfirmed users.
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
      ('44444444-4444-4444-8444-444444444444','approved@example.com',now()),
      ('55555555-5555-4555-8555-555555555555','pending@example.com',null);
      insert into private.admin_allowlist(email) values (' Approved@Example.com '),('pending@example.com');`);
    assert.equal((await db.query("select count(*)::int as n from public.admin_accounts")).rows[0].n,1);
    await db.exec("update auth.users set email_confirmed_at=now() where email='pending@example.com'");
    assert.equal((await db.query("select count(*)::int as n from public.admin_accounts")).rows[0].n,2);

    await db.exec(`insert into auth.users(id) values ('${alice}'), ('${bob}'), ('${admin}');
      insert into public.admin_accounts(user_id) values ('${admin}');
      insert into public.learning_paths(id,title) values ('path','مسيرة');
      insert into public.learning_units(id,path_id,position,title,summary) values ('unit','path',0,'عنوان','ملخص');
      insert into public.adhkar_catalog(id,title,body,source_reference,status) values
        ('draft','ذكر','نص','مرجع','draft'), ('published','ذكر','نص','مرجع','published');
      insert into public.goals(user_id,id,title) values ('${bob}','b','هدف خاص');`);
    await asUser(alice, async () => {
      await db.exec(`insert into public.goals(user_id,id,title) values ('${alice}','a','هدف');
        insert into public.goal_actions(user_id,id,goal_id,title,period) values ('${alice}','step','a','عمل','daily');
        insert into public.reflections(user_id,id,date,body) values ('${alice}','r','2026-10-24','خاص');
        insert into public.user_wirds(user_id,id,title,target,period) values ('${alice}','w','ورد',100,'daily');`);
      assert.equal((await db.query('select * from public.goals')).rows.length, 1);
      await rejectsCode(`insert into public.goals(user_id,id,title) values ('${bob}','forged','bad')`, '42501');
      await rejectsCode(`update public.goals set user_id='${bob}' where id='a'`, '42501');
      await rejectsCode(`insert into public.goal_actions(user_id,id,goal_id,title,period) values ('${alice}','bad','b','bad','daily')`, '23503');
      await rejectsCode(`insert into public.wird_period_totals(user_id,wird_id,period_key,count) values ('${alice}','w','2026-10-24',-1)`, '23514');
      await rejectsCode(`insert into public.reading_progress(user_id,book_id,page) values ('${alice}','book',0)`, '23514');
      await db.exec(`insert into public.planner_items(user_id,id,title,period,week_start,scheduled_date) values ('${alice}','week','زيارة','weekly','2026-10-19','2026-10-24')`);
      await rejectsCode(`update public.planner_items set scheduled_date='2026-10-26' where id='week'`, '23514');
      await rejectsCode(`update public.planner_items set week_start='2026-10-20' where id='week'`, '23514');
      await rejectsCode(`update public.planner_items set week_start=null where id='week'`, '23514');
      await db.exec(`insert into public.planner_items(user_id,id,title,period,month_start,scheduled_date) values ('${alice}','month','زيارة شهرية','monthly','2028-02-01','2028-02-29')`);
      await rejectsCode(`update public.planner_items set scheduled_date='2028-03-01' where id='month'`, '23514');
      await rejectsCode(`update public.planner_items set month_start='2028-02-02' where id='month'`, '23514');
      await rejectsCode(`update public.planner_items set month_start=null where id='month'`, '23514');
      await rejectsCode(`update public.planner_items set week_start='2028-02-07' where id='month'`, '23514');
      assert.equal((await db.query('select * from public.learning_units')).rows.length, 0);
      assert.deepEqual((await db.query('select id from public.adhkar_catalog')).rows.map(x => x.id), ['published']);
      await rejectsCode(`insert into public.user_learning_progress(user_id,unit_id,revision,completed_stations) values ('${alice}','unit',1,7)`, '42501');
      await rejectsCode(`insert into public.admin_accounts(user_id) values ('${alice}')`, '42501');
      await rejectsCode(`insert into private.admin_allowlist(email) values ('self@example.com')`, '42501');
      await db.exec(`update public.goals set updated_at='2000-01-01' where id='a'`);
      assert.ok(new Date((await db.query("select updated_at from public.goals where id='a'")).rows[0].updated_at).getUTCFullYear() > 2000);
    });
    await asUser(bob, async () => {
      assert.equal((await db.query('select * from public.reflections')).rows.length, 0);
      assert.equal((await db.query("delete from public.reflections where id='r' returning id")).rows.length, 0);
    });
    await asUser(admin, async () => {
      assert.equal((await db.query('select * from public.reflections')).rows.length, 0);
      assert.equal((await db.query('select * from public.learning_units')).rows.length, 1);
      await db.exec("update public.learning_units set title='مراجعة' where id='unit'");
    });
    // A shared file is retained until the final active/archive reference is gone.
    const filePath='66666666-6666-4666-8666-666666666666.pdf';
    const fileUrl=`https://project.supabase.co/storage/v1/object/public/journey-books/${filePath}#page=2`;
    await db.exec(`grant usage on schema storage to authenticated;
      grant select, delete on storage.objects to authenticated;
      insert into storage.objects(id,bucket_id,name) values ('66666666-6666-4666-8666-666666666666','journey-books','${filePath}')`);
    await db.query("insert into public.platform_curriculum(id,payload) values ('main',$1)", [JSON.stringify({units:[{resources:[{url:fileUrl}]}],archivedUnits:[{resources:[{url:fileUrl}]}]})]);
    await db.query("update public.platform_curriculum set payload=$1 where id='main'", [JSON.stringify({units:[],archivedUnits:[{resources:[{url:fileUrl}]}]})]);
    assert.equal((await db.query('select * from public.resource_cleanup')).rows.length,0);
    await asUser(admin,async()=>{
      assert.equal((await db.query('select public.can_delete_journey_book($1) as allowed',[filePath])).rows[0].allowed,false);
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
    });
    await db.exec("update public.platform_curriculum set payload='{\"units\":[]}' where id='main'");
    assert.equal((await db.query('select storage_path from public.resource_cleanup')).rows[0].storage_path,filePath);
    await asUser(alice,async()=>{
      assert.equal((await db.query('select * from public.resource_cleanup')).rows.length,0);
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
      await rejectsCode(`insert into public.resource_cleanup(storage_path) values ('${filePath}')`,'42501');
    });
    // A source restored before the cleaner runs is protected by the delete policy.
    await db.query("update public.platform_curriculum set payload=$1 where id='main'",[JSON.stringify({units:[{resources:[{url:fileUrl}]}]})]);
    await asUser(admin,async()=>{
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
    });
    await db.exec("update public.platform_curriculum set payload='{\"units\":[]}' where id='main'");
    await asUser(admin,async()=>{
      assert.equal((await db.query('select public.can_delete_journey_book($1) as allowed',[filePath])).rows[0].allowed,true);
      // SQL deletion here tests RLS only; application deletion uses Storage API.
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length,1);
      await db.exec('delete from public.resource_cleanup');
    });
    await db.exec('set role anon');
    for (const name of tableNames) await rejectsCode(`select * from public.${name}`, '42501');
    await db.exec('reset role');

    // Deploy again without replaying CREATE TABLE or losing existing records.
    await db.exec('begin');
    await applyMigrations(client, migrations);
    await db.exec('commit');
    assert.equal((await db.query('select count(*)::int as n from public.goals')).rows[0].n, 2);
    await db.exec('begin');
    await assert.rejects(applyMigrations(client, [{...migrations[0], checksum:'changed'}]), /Applied migration changed/);
    await db.exec('rollback');
    await db.exec(`delete from auth.users where id='${alice}'`);
    for (const name of ['goals','goal_actions','reflections','user_wirds'])
      assert.equal((await db.query(`select * from public.${name} where user_id=$1`, [alice])).rows.length, 0);
  } finally { await db.close(); }
});

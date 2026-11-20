import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations,readMigrations} from '../scripts/database-migrations.mjs';

test('admin user directory is privileged, searchable, paginated, and excludes private settings',async()=>{
  const db=new PGlite({extensions:{pgcrypto}});
  const client={query:async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)};
  const admin='11111111-1111-4111-8111-111111111111';
  const member='22222222-2222-4222-8222-222222222222';
  const teacher='33333333-3333-4333-8333-333333333333';
  const pending='44444444-4444-4444-8444-444444444444';
  async function asUser(id,fn){
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    try{return await fn()}finally{await db.exec('reset role')}
  }
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,
        created_at timestamptz not null default now(),last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth,public to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;create extension if not exists pgcrypto;`);
    await db.exec(`insert into auth.users(id,email,email_confirmed_at,created_at,last_sign_in_at) values
      ('${admin}','admin@example.com',now(),'2026-01-01',now()),
      ('${member}','member@example.com',now(),'2026-02-01','2026-10-30'),
      ('${teacher}','teacher@example.com',now(),'2026-03-01','2026-10-29'),
      ('${pending}','pending@example.com',null,'2026-04-01',null)`);
    await db.exec('begin');await applyMigrations(client,await readMigrations());await db.exec('commit');
    await db.query('insert into public.admin_accounts(user_id) values($1)',[admin]);
    await db.query(`insert into public.user_preferences(user_id,first_name,last_name,country,birth_year,gender,notification_preferences)
      values($1,'ليلى','أمين','مصر',1990,'female','{"enabled":false}')`,[member]);
    await db.query(`insert into public.teacher_applications(user_id,display_name,qualifications,endorsement,
      identity_status,qualification_status,endorsement_status,status)
      values($1,'معلم معتمد','مؤهل','تزكية','approved','approved','approved','approved'),
            ($2,'طلب معلم','مؤهل','تزكية','pending','pending','pending','submitted')`,[teacher,pending]);

    await db.exec('set role anon');
    await assert.rejects(db.query("select * from public.admin_list_users()"),error=>error.code==='42501');
    await db.exec('reset role');
    await asUser(member,async()=>{
      await assert.rejects(db.query('select * from public.admin_list_users($1,$2,$3,$4)', ['', 'all', 25, 0]),error=>error.code==='42501');
      await assert.rejects(db.query('select email from auth.users'),error=>error.code==='42501');
    });
    await asUser(admin,async()=>{
      const page=(await db.query('select * from public.admin_list_users($1,$2,$3,$4)',['','all',2,0])).rows;
      assert.equal(page.length,2);
      assert.equal(Number(page[0].total_count),4);
      assert.equal(Number(page[0].confirmed_count),3);
      assert.equal(Number(page[0].admin_count),1);
      assert.equal(Number(page[0].approved_teacher_count),1);
      const teacherRow=(await db.query('select * from public.admin_list_users($1,$2,$3,$4)',['teacher@example.com','approved_teacher',25,0])).rows[0];
      assert.equal(teacherRow.is_approved_teacher,true);
      const pendingRow=(await db.query('select * from public.admin_list_users($1,$2,$3,$4)',['','pending_teacher',25,0])).rows[0];
      assert.equal(pendingRow.user_id,pending);
      const memberRows=(await db.query('select * from public.admin_list_users($1,$2,$3,$4)',['ليلى','member',25,0])).rows;
      assert.equal(memberRows.length,1);
      assert.equal(memberRows[0].country,'مصر');
      const fields=Object.keys(memberRows[0]);
      assert.ok(!fields.includes('birth_year'));
      assert.ok(!fields.includes('gender'));
      assert.ok(!fields.includes('notification_preferences'));
      await assert.rejects(db.query('select * from public.admin_list_users($1,$2,$3,$4)',['','all',101,0]),error=>error.code==='22023');
      await assert.rejects(db.query('select * from public.admin_list_users($1,$2,$3,$4)',['','unknown',25,0]),error=>error.code==='22023');
      await assert.rejects(db.query('select public.admin_set_admin($1,false)',[admin]),error=>error.code==='22023');
      await assert.rejects(db.query('select public.admin_set_admin($1,true)',[pending]),error=>error.code==='22023');
      await db.query('select public.admin_set_admin($1,true)',[member]);
    });
    await asUser(member,async()=>{
      assert.equal((await db.query('select public.is_admin() as ok')).rows[0].ok,true);
      await db.query('select public.admin_set_admin($1,false)',[teacher]);
    });
    await asUser(admin,async()=>{
      await db.query('select public.admin_set_admin($1,false)',[member]);
    });
    await asUser(member,async()=>{
      assert.equal((await db.query('select public.is_admin() as ok')).rows[0].ok,false);
      await assert.rejects(db.query('select public.admin_set_admin($1,true)',[member]),error=>error.code==='42501');
    });
    assert.equal((await db.query("select count(*)::int as n from private.admin_allowlist where email='member@example.com'")).rows[0].n,0);
  }finally{await db.close()}
});
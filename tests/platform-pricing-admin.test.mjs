import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations,readMigrations} from '../scripts/database-migrations.mjs';

test('admins configure per-feature prices and audit grants; feature entitlements stay scoped',async()=>{
  const db=new PGlite({extensions:{pgcrypto}});
  const client={query:async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)};
  const admin='11111111-1111-4111-8111-111111111111';
  const member='22222222-2222-4222-8222-222222222222';
  const other='33333333-3333-4333-8333-333333333333';
  async function asUser(id,fn){
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    try{return await fn()}finally{await db.exec('reset role')}
  }
  async function recordFeature(featureKey,eventId,subscriptionId,userId=member){
    await db.exec('set role service_role');
    try{return (await db.query('select public.record_verified_subscription_event_scoped($1,$2,$3,$4,$5,$6,$7,$8) as applied',
      ['test',eventId,subscriptionId,userId,'active',new Date(Date.now()+86400000).toISOString(),new Date().toISOString(),featureKey])).rows[0].applied}
    finally{await db.exec('reset role')}
  }
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth,public to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;create extension if not exists pgcrypto;`);
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
      ('${admin}','admin@example.test',now()),('${member}','member@example.test',now()),('${other}','other@example.test',now())`);
    await db.exec('begin');await applyMigrations(client,await readMigrations());await db.exec('commit');
    const catalog=(await db.query('select key,requires_premium,price_amount from public.platform_features order by key')).rows;
    // 13 feature keys pre-dated the Quran & Sunnah module; that module adds 5.
    assert.equal(catalog.length,18);
    assert.ok(catalog.every(feature=>!feature.requires_premium&&feature.price_amount===null));
    await db.query('insert into public.admin_accounts(user_id) values($1)',[admin]);

    await asUser(admin,async()=>{
      await db.query('select public.save_platform_feature_pricing($1,$2,$3,$4,$5,$6,$7,$8)',
        ['study_circles','المدارسة','مدارسات الأعضاء',true,true,4.5,'usd','monthly']);
      await db.query('select public.save_platform_feature_pricing($1,$2,$3,$4,$5,$6,$7,$8)',
        ['learning_journey','السير إلى الله','',true,true,12,'SAR','yearly']);
      await db.query('select public.save_platform_feature_pricing($1,$2,$3,$4,$5,$6,$7,$8)',
        ['private_circles','مجالس التواصي','',true,true,30,'USD','yearly']);
      const feature=(await db.query("select requires_premium,price_amount,currency_code,billing_interval from public.platform_features where key='study_circles'")).rows[0];
      assert.deepEqual(Object.values(feature),[true,'4.500','USD','monthly']);
      const featureEvents=(await db.query('select * from public.list_admin_platform_feature_events($1)',[10])).rows;
      assert.equal(featureEvents.length,3);
      assert.equal(featureEvents.find(event=>event.feature_key==='learning_journey').after_state.currency_code,'SAR');
      await db.query('select public.set_member_feature($1,$2,$3)',['member@example.test','study_circles',true]);
      const permissionEvents=(await db.query('select * from public.list_admin_member_feature_events($1,$2)',['member@example.test',20])).rows;
      assert.equal(permissionEvents.length,1);
      assert.equal(permissionEvents[0].allowed,true);
      assert.equal(permissionEvents[0].changed_by_email,'admin@example.test');
      const currentStatus=(await db.query('select * from public.list_admin_member_feature_status($1)',['member@example.test'])).rows;
      const studyStatus=currentStatus.find(item=>item.feature_key==='study_circles');
      assert.equal(studyStatus.override_allowed,true);
      assert.equal(studyStatus.effective_allowed,true);
      assert.equal(studyStatus.access_source,'admin_grant');
      assert.equal(studyStatus.latest_allowed,true);
      assert.equal(studyStatus.latest_changed_by_email,'admin@example.test');
      await db.query('select public.set_member_feature($1,$2,$3)',['member@example.test','study_circles',false]);
      const revokedStatus=(await db.query('select * from public.list_admin_member_feature_status($1)',['member@example.test'])).rows
        .find(item=>item.feature_key==='study_circles');
      assert.equal(revokedStatus.override_allowed,false);
      assert.equal(revokedStatus.effective_allowed,false);
      assert.equal(revokedStatus.access_source,'admin_revoke');
      assert.equal(revokedStatus.latest_allowed,false);
      await db.query('select public.set_member_feature($1,$2,$3)',['member@example.test','study_circles',null]);
      const resetStatus=(await db.query('select * from public.list_admin_member_feature_status($1)',['member@example.test'])).rows
        .find(item=>item.feature_key==='study_circles');
      assert.equal(resetStatus.override_allowed,null);
      assert.equal(resetStatus.effective_allowed,false);
      assert.equal(resetStatus.access_source,'premium_required');
      assert.equal(resetStatus.latest_allowed,null);
      assert.equal(resetStatus.latest_changed_by_email,'admin@example.test');
      await assert.rejects(db.query('select public.save_platform_feature_pricing($1,$2,$3,$4,$5,$6,$7,$8)',
        ['study_circles','ميزة مكسورة','',true,true,10,null,'monthly']),error=>error.code==='22023');
      await assert.rejects(db.query('select public.save_platform_feature_pricing($1,$2,$3,$4,$5,$6,$7,$8)',
        ['study_circles','ميزة مكسورة','',false,false,10,'USD','monthly']),error=>error.code==='22023');
    });

    await asUser(member,async()=>{
      await assert.rejects(db.query('select public.list_admin_platform_feature_events($1)',[10]),error=>error.code==='42501');
      await assert.rejects(db.query('select public.list_admin_member_feature_events($1,$2)',['member@example.test',10]),error=>error.code==='42501');
      await assert.rejects(db.query('select * from public.list_admin_member_feature_status($1)',['member@example.test']),error=>error.code==='42501');
      await assert.rejects(db.query('select public.save_platform_feature_pricing($1,$2,$3,$4,$5,$6,$7,$8)',
        ['study_circles','المدارسة','',true,true,4.5,'USD','monthly']),error=>error.code==='42501');
      await assert.rejects(db.query('select public.record_verified_subscription_event_scoped($1,$2,$3,$4,$5,$6,$7,$8)',
        ['test','forged','sub',member,'active',new Date(Date.now()+86400000).toISOString(),new Date().toISOString(),'study_circles']),error=>error.code==='42501');
      assert.equal((await db.query("select public.has_feature_access('study_circles') as ok")).rows[0].ok,false);
      assert.equal((await db.query("select public.has_feature_access('learning_journey') as ok")).rows[0].ok,false);
    });

    assert.equal(await recordFeature('learning_journey','event-1','sub-learning'),true);
    assert.equal(await recordFeature('learning_journey','event-1','sub-learning'),false);
    await asUser(member,async()=>{
      assert.equal((await db.query("select public.has_feature_access('learning_journey') as ok")).rows[0].ok,true);
      assert.equal((await db.query("select public.has_feature_access('private_circles') as ok")).rows[0].ok,false);
    });
    await asUser(admin,async()=>{
      const subscriptionStatus=(await db.query('select * from public.list_admin_member_feature_status($1)',['member@example.test'])).rows
        .find(item=>item.feature_key==='learning_journey');
      assert.equal(subscriptionStatus.override_allowed,null);
      assert.equal(subscriptionStatus.effective_allowed,true);
      assert.equal(subscriptionStatus.access_source,'subscription');
    });
    await db.exec('set role service_role');
    try{await db.query(`select public.record_verified_subscription_event($1,$2,$3,$4,$5,$6,$7)`,
      ['test','global-event','global-sub',member,'active',new Date(Date.now()+86400000).toISOString(),new Date().toISOString()])}
    finally{await db.exec('reset role')}
    await asUser(member,async()=>{
      assert.equal((await db.query("select public.has_feature_access('private_circles') as ok")).rows[0].ok,true);
    });
    await asUser(other,async()=>{
      await assert.rejects(db.query('select * from public.platform_feature_events'),error=>error.code==='42501');
      await assert.rejects(db.query('select * from public.member_feature_events'),error=>error.code==='42501');
    });
  }finally{await db.close()}
});
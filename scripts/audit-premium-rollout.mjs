import {Client} from 'pg';
import {readFile} from 'node:fs/promises';

const {SUPABASE_PROJECT_REF:ref,SUPABASE_POOLER_HOST:host,SUPABASE_DB_PASSWORD:password}=process.env;
if(!ref||!host||!password)throw new Error('Missing database connection settings.');
const caPath=process.env.SUPABASE_DB_CA_FILE?.replace(/^\/mnt\/([a-z])\//,(_,drive)=>`${drive.toUpperCase()}:/`);
const ca=caPath?await readFile(caPath,'utf8'):undefined;
const client=new Client({host,port:5432,user:`postgres.${ref}`,database:'postgres',password,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:12000});
try{
  await client.connect();
  await client.query('begin read only');
  const {rows}=await client.query(`select
    (select count(*)::int from public.study_groups where status='active') active_groups,
    (select count(*)::int from public.group_members) memberships,
    (select count(*)::int from public.circle_live_sessions where status='scheduled' and meeting_url<>'') linked_sessions,
    (select count(*)::int from public.circle_live_sessions where status='scheduled' and meeting_url<>'' and ends_at>now()) future_linked_sessions,
    (select count(*)::int from public.paid_subscriptions) paid_subscriptions,
    (select count(*)::int from public.member_feature_overrides) member_feature_overrides,
    (select count(*)::int from public.member_feature_events) member_feature_events`);
  console.log(JSON.stringify(rows[0]));
  await client.query('rollback');
}catch(error){await client.query('rollback').catch(()=>{});throw error}
finally{await client.end().catch(()=>{})}

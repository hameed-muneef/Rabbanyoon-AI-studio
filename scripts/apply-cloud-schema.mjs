import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {createServer} from 'vite';
import {applyMigrations,readMigrations} from './database-migrations.mjs';

if(process.argv.includes('--dry-run')){
  for(const migration of await readMigrations())console.log(`${migration.name} ${migration.checksum}`);
  process.exit(0);
}

const host=process.env.SUPABASE_POOLER_HOST;
const password=process.env.SUPABASE_DB_PASSWORD;
const initialAdminEmail=process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const projectRef=process.env.SUPABASE_PROJECT_REF;
if(!host||!password||!projectRef){
  console.error('Set SUPABASE_POOLER_HOST, SUPABASE_DB_PASSWORD and SUPABASE_PROJECT_REF in the process environment.');
  process.exit(1);
}
const caPath=process.env.SUPABASE_DB_CA_FILE?.replace(/^\/mnt\/([a-z])\//,(_,drive)=>`${drive.toUpperCase()}:/`);
const ca=caPath?await readFile(caPath,'utf8'):undefined;
const client=new Client({host,port:5432,user:`postgres.${projectRef}`,database:'postgres',password,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:12000});
try{
  await client.connect();
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true},appType:'custom'});
  let initialCurriculum;
  try{({initialCurriculum}=await vite.ssrLoadModule('/src/curriculum.ts'))}finally{await vite.close()}
  await client.query('begin');
  try{
    await applyMigrations(client);
    await client.query("insert into public.platform_curriculum(id,payload) values ('main',$1::jsonb) on conflict (id) do nothing",[JSON.stringify({...initialCurriculum(),progress:{}})]);
    if(initialAdminEmail){
      await client.query('insert into private.admin_allowlist(email) values ($1) on conflict do nothing',[initialAdminEmail]);
      await client.query('insert into public.admin_accounts(user_id) select id from auth.users where lower(email) = $1 and email_confirmed_at is not null on conflict do nothing',[initialAdminEmail]);
    }
    const domainCheck=await client.query(`select count(*)::int as count from pg_tables
      where schemaname='public' and rowsecurity and tablename in (
      'user_preferences','goals','goal_actions','goal_progress_entries','planner_items',
      'day_records','activity_logs','reflections','adhkar_catalog','user_wirds',
      'wird_period_totals','learning_paths','learning_units','learning_stations',
      'learning_resources','station_resources','user_learning_progress','reading_progress')`);
    if(domainCheck.rows[0]?.count!==18)throw new Error('Domain schema RLS verification failed.');
    await client.query('commit');
    console.log('18 relational domain tables verified with RLS.');
  }catch(error){await client.query('rollback');throw error}
  const result=await client.query(`select c.relrowsecurity as rls_enabled,
    (select count(*)::int from pg_policies where schemaname='public' and tablename='user_data') as policy_count
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='user_data'`);
  if(result.rows[0]?.rls_enabled!==true||result.rows[0]?.policy_count!==3)throw new Error('Table or access policies verification failed.');
  const adminCheck=await client.query(`select (select relrowsecurity from pg_class where oid='public.admin_accounts'::regclass) as admin_rls,
    (select relrowsecurity from pg_class where oid='public.platform_curriculum'::regclass) as curriculum_rls,
    (select count(*)::int from pg_policies where schemaname='public' and tablename='platform_curriculum') as curriculum_policies,
    (select count(*)::int from private.admin_allowlist) as allowed_emails`);
  if(!adminCheck.rows[0]?.admin_rls||!adminCheck.rows[0]?.curriculum_rls||adminCheck.rows[0]?.curriculum_policies!==3)throw new Error('Admin schema verification failed.');
  console.log('User data, admin membership, and curriculum tables have RLS policies.');
  console.log(`Pre-approved admin emails: ${adminCheck.rows[0].allowed_emails}.`);
  const shared=await client.query("select jsonb_array_length(payload->'units') as unit_count from public.platform_curriculum where id='main'");
  console.log(`Shared curriculum units: ${shared.rows[0]?.unit_count??0}.`);
  const bucket=await client.query("select public, file_size_limit from storage.buckets where id='journey-books'");
  const uploadPolicy=await client.query("select count(*)::int as count from pg_policies where schemaname='storage' and tablename='objects' and policyname='Admins upload journey books'");
  if(bucket.rows[0]?.public!==true||Number(bucket.rows[0]?.file_size_limit)!==52428800||uploadPolicy.rows[0]?.count!==1)throw new Error('Book storage setup verification failed.');
  console.log('Journey books bucket and admin upload policy are ready.');
  if(initialAdminEmail){
    const account=await client.query(`select u.email_confirmed_at is not null as confirmed,
      a.user_id is not null as granted from auth.users u
      left join public.admin_accounts a on a.user_id=u.id
      where lower(u.email)=$1 limit 1`,[initialAdminEmail]);
    console.log(account.rows.length?`Admin account: registered, confirmed=${account.rows[0].confirmed}, granted=${account.rows[0].granted}.`:'Admin account: not registered yet.');
  }
}catch(error){console.error('Schema migration failed:',error instanceof Error?error.message:String(error));process.exitCode=1}
finally{await client.end().catch(()=>{})}

import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {readMigrations} from './database-migrations.mjs';

const {SUPABASE_PROJECT_REF:projectRef,SUPABASE_POOLER_HOST:host,SUPABASE_DB_PASSWORD:password}=process.env;
if(!projectRef||!host||!password)throw new Error('Missing database connection settings.');
if(!/^[a-z0-9]{20}$/.test(projectRef)||!/^[-a-z0-9.]+\.pooler\.supabase\.com$/.test(host))throw new Error('Unexpected project reference or session pooler host.');
const caPath=process.env.SUPABASE_DB_CA_FILE?.replace(/^\/mnt\/([a-z])\//,(_,drive)=>`${drive.toUpperCase()}:/`);
const ca=caPath?await readFile(caPath,'utf8'):undefined;
const client=new Client({host,port:5432,user:`postgres.${projectRef}`,database:'postgres',password,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:12000});
try{
  await client.connect();
  await client.query('begin read only');
  const identity=await client.query("select current_database() as database, current_user as db_user");
  const ledger=await client.query("select to_regclass('private.schema_migrations') is not null as exists");
  const applied=ledger.rows[0].exists
    ?(await client.query('select name,checksum from private.schema_migrations order by name')).rows:[];
  const local=await readMigrations();
  const recorded=new Map(applied.map(row=>[row.name,row.checksum]));
  console.log(`Connected to ${identity.rows[0].database} as ${identity.rows[0].db_user}.`);
  console.log(`Migration ledger: ${ledger.rows[0].exists?'present':'absent'}.`);
  for(const migration of local){
    const checksum=recorded.get(migration.name);
    console.log(`${migration.name}: ${checksum===undefined?'pending':checksum===migration.checksum?'applied':'CHECKSUM MISMATCH'}`);
  }
  for(const name of recorded.keys())if(!local.some(migration=>migration.name===name))console.log(`${name}: remote only`);
  const groups=await client.query("select to_regclass('public.study_groups') is not null as groups, to_regclass('public.group_members') is not null as members");
  console.log(`Group tables: study_groups=${groups.rows[0].groups}, group_members=${groups.rows[0].members}.`);
  const existing=await client.query("select to_regclass('public.user_data') is not null as user_data, to_regclass('public.platform_curriculum') is not null as curriculum, to_regclass('public.planner_items') is not null as planner_items, to_regclass('storage.buckets') is not null as storage_buckets");
  console.log(`Existing tables: user_data=${existing.rows[0].user_data}, platform_curriculum=${existing.rows[0].curriculum}, planner_items=${existing.rows[0].planner_items}, storage.buckets=${existing.rows[0].storage_buckets}.`);
  await client.query('rollback');
}catch(error){
  console.error('Read-only audit failed:',error instanceof Error?error.message:String(error));
  process.exitCode=1;
}finally{await client.end().catch(()=>{})}

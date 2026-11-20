const url=process.env.VITE_SUPABASE_URL;
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email=process.env.CHECK_EMAIL;
const password=process.env.CHECK_PASSWORD;
if(!url||!key)throw new Error('Missing public Supabase settings.');
if(!email||!password)throw new Error('Missing CHECK_EMAIL / CHECK_PASSWORD.');

const auth=await fetch(new URL('/auth/v1/token?grant_type=password',url),{
  method:'POST',
  headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({email,password}),
});
const session=await auth.json();
if(!session.access_token){
  console.error('Sign-in failed:',JSON.stringify(session).slice(0,300));
  process.exit(1);
}
console.log('Signed in:',session.user.email,'| confirmed:',session.user.email_confirmed_at??'no');
const token=session.access_token;
const headers={apikey:key,Authorization:`Bearer ${token}`};

async function rest(path,extra={}){
  const response=await fetch(new URL(path,url),{headers:{...headers,...extra.headers},...extra});
  const text=await response.text();
  let body=null;
  try{body=text?JSON.parse(text):null}catch{body=text}
  return {status:response.status,body};
}

const tables=['study_groups','group_members','group_invites','group_join_requests','courses','course_lessons','course_registrations','course_materials','course_assignments','course_submissions','course_sessions','course_attendance','study_tracks','study_parts','study_progress','circle_live_sessions','circle_announcements','notifications','reports','teacher_applications','group_programs','group_program_revisions','group_program_tasks','platform_features','member_subscriptions','member_feature_grants'];
console.log('\n--- table visibility for this account ---');
for(const table of tables){
  const {status,body}=await rest(`/rest/v1/${table}?select=*&limit=5`);
  const count=Array.isArray(body)?body.length:(body&&typeof body==='object'?Object.keys(body).length:0);
  console.log(`${table}: HTTP ${status} rows=${count}`);
}

const {body:profile}=await rest('/rest/v1/admin_accounts?select=*&limit=1');
console.log('\nis_admin rows visible:',Array.isArray(profile)?profile.length:'n/a');

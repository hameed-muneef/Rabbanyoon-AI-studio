import {loadEnv} from 'vite';

const env=loadEnv('production',process.cwd(),'VITE_');
const url=env.VITE_SUPABASE_URL?.trim();
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const failures=[];

if(!url)failures.push('VITE_SUPABASE_URL is missing.');
else{
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)failures.push('VITE_SUPABASE_URL must be the HTTPS project origin.');
  }catch{failures.push('VITE_SUPABASE_URL is not a valid URL.');}
}
if(!key)failures.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing.');
else if(key.startsWith('sb_secret_'))failures.push('Use a publishable key, never a Supabase secret key.');

if(failures.length){
  for(const failure of failures)console.error(`Deployment configuration: ${failure}`);
  process.exitCode=1;
}else console.log('Deployment Supabase settings are present and safe for the browser.');

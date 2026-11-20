import {spawnSync} from 'node:child_process';

function run(command,args,env=process.env){
  const result=spawnSync(command,args,{stdio:'inherit',env,shell:process.platform==='win32'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}

run('npm',['run','deploy:check']);
run('npm',['run','build'],{...process.env,VITE_BOOKS_FROM_SUPABASE:'true'});
run(process.execPath,['scripts/prepare-cloudflare-pages.mjs']);
run(process.execPath,['scripts/verify-cloudflare-output.mjs']);

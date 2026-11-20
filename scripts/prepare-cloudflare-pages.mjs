import {readdir,stat,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadEnv} from 'vite';

const distDir=join(process.cwd(),'dist');
const booksDir=join(distDir,'books');
const maxBytes=25*1024*1024;
const unavailableBook='qawaid-al-suluk.pdf';
const env=loadEnv('production',process.cwd(),'VITE_');
const baseUrl=new URL('/storage/v1/object/public/journey-books/',env.VITE_SUPABASE_URL);
const redirects=[];
let omitted=0;

for(const file of await readdir(booksDir)){
  if(!file.toLowerCase().endsWith('.pdf'))continue;
  const path=join(booksDir,file);
  if(file===unavailableBook)omitted++;
  else redirects.push(`/books/${file} ${new URL(encodeURIComponent(file),baseUrl)} 302`);
  await rm(path);
}

await writeFile(join(distDir,'_redirects'),`${redirects.join('\n')}\n`,'utf8');

async function checkSize(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())await checkSize(path);
    else if(entry.isFile()&&(await stat(path)).size>maxBytes)throw new Error(`Cloudflare Pages file exceeds 25 MiB: ${path}`);
  }
}
await checkSize(distDir);
console.log(`Cloudflare Pages build ready: ${redirects.length} PDF redirects to Supabase; ${omitted} temporarily unavailable PDF omitted.`);

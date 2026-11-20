import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cloudflareHeaders=await readFile(new URL('../public/_headers',import.meta.url),'utf8');
const netlifyConfig=await readFile(new URL('../netlify.toml',import.meta.url),'utf8');
const headers={
  'Content-Security-Policy':"frame-ancestors 'none'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(self)',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
};

test('Netlify and Cloudflare static responses set baseline browser security headers',()=>{
  for(const [name,value] of Object.entries(headers)){
    assert.match(cloudflareHeaders,new RegExp(`^  ${name}: ${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'m'));
    assert.match(netlifyConfig,new RegExp(`^    ${name} = "${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"$`,'m'));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/admin-access.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {checkAdminAccess}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('admin access requires an explicit positive server result',async()=>{
  assert.equal(await checkAdminAccess(async()=>({data:true,error:null})),'allowed');
  assert.equal(await checkAdminAccess(async()=>({data:false,error:null})),'denied');
  for(const data of [null,undefined,'true',1])assert.equal(await checkAdminAccess(async()=>({data,error:null})),'error');
});
test('network, RPC and timeout failures never masquerade as missing membership',async()=>{
  assert.equal(await checkAdminAccess(async()=>({data:false,error:{message:'missing function'}})),'error');
  assert.equal(await checkAdminAccess(()=>{throw new Error('offline')}),'error');
  assert.equal(await checkAdminAccess(()=>new Promise(()=>{}),5),'error');
});

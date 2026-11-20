import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/reading-progress.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {savedBookPage,saveBookPage}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('saved reading pages remain separate for each book and reject invalid positions',()=>{
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  assert.equal(savedBookPage('general-islam-book',180),null);
  assert.equal(saveBookPage('general-islam-book',43,180),true);
  assert.equal(saveBookPage('life-journey-book',91,154),true);
  assert.equal(savedBookPage('general-islam-book',180),43);
  assert.equal(savedBookPage('life-journey-book',154),91);
  assert.equal(saveBookPage('life-journey-book',155,154),false);
  assert.equal(savedBookPage('life-journey-book',154),91);
  delete globalThis.localStorage;
});

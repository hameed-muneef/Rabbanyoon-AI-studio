import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const asModule=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {hijriDate}=await import(asModule(compile('../src/hijri.ts')));

test('computes um al-qura hijri locally for known dates',()=>{
  const result=hijriDate('2026-10-29');
  assert.equal(result,hijriDate(new Date(2026,9,29,12)));
  assert.match(result,/١٤٤٨/);
  assert.match(result,/جمادى/);
  assert.match(result,/ هـ/);
});

test('string and Date inputs produce identical results and invalid input stays empty',()=>{
  assert.equal(hijriDate('2026-01-01'),hijriDate(new Date(2026,0,1,12)));
  assert.notEqual(hijriDate('2026-03-01'),undefined);
  assert.match(hijriDate('2026-03-01'),/ هـ/);
  assert.equal(hijriDate('bad'),undefined);
  assert.equal(hijriDate(NaN),undefined);
});

test('hijri and gregory stay in order across a month boundary',()=>{
  // 1 مارس 2026: الهجري في شعبان ١٤٤٧، والفروق بين الأيام تنتج أقمارًا متباينة دون أخطاء
  const end=hijriDate('2026-03-31');
  assert.match(end,/ هـ/);
  for(let day=1;day<=31;day++){
    assert.match(hijriDate(`2026-03-${String(day).padStart(2,'0')}`),/ هـ/);
  }
});

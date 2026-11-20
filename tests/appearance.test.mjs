import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// ترجم `src/appearance.ts` لأن الكود لا يستطيع الاستيراد من خارج الحزمة مباشرةً.
const source = readFileSync(new URL('../src/appearance.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const appearance = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('appearance: readAppearance يقبل القيم الصحيحة ويعود system افتراضيًا', () => {
  const storage = value => ({getItem: () => value});
  assert.equal(appearance.readAppearance(storage('dark')), 'dark');
  assert.equal(appearance.readAppearance(storage('light')), 'light');
  assert.equal(appearance.readAppearance(storage('system')), 'system');
  assert.equal(appearance.readAppearance(storage(null)), 'system');
  assert.equal(appearance.readAppearance(storage('purple')), 'system');
  assert.equal(appearance.readAppearance(storage('{"x":1}')), 'system');
});

test('appearance: resolvedTheme يحسم الفاتح/الداكن من التفضيل والمزج مع النظام', () => {
  assert.equal(appearance.resolvedTheme('dark', false), 'dark');
  assert.equal(appearance.resolvedTheme('light', true), 'light');
  assert.equal(appearance.resolvedTheme('system', true), 'dark');
  assert.equal(appearance.resolvedTheme('system', false), 'light');
});

test('appearance: saveAppearance يكتب المفتاح ويتكلم بصدق مع الأخطاء', () => {
  let saved = null;
  const store = {getItem: () => null, setItem: (k, v) => {saved = [k, v]}, removeItem: () => {}};
  appearance.saveAppearance(store, 'dark');
  assert.deepEqual(saved, ['rabbani-theme-v1', 'dark']);
  const throwing = {getItem: () => null, setItem: () => {throw new Error('denied')}, removeItem: () => {}};
  assert.doesNotThrow(() => appearance.saveAppearance(throwing, 'dark'));
  assert.doesNotThrow(() => appearance.saveAppearance(null, 'dark'));
});

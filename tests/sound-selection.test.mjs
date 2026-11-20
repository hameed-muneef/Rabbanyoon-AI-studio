import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile = code => ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const dataUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const {planSound, soundPlanForPrayer, soundPlanForReminder} = await import(dataUrl(compile(readFileSync(new URL('../src/notifications/sound-selection.ts', import.meta.url), 'utf8'))));

const library = [{id: 'cloud-1', url: 'https://x.supabase.co/storage/v1/object/public/adhan-audio/a.mp3'}, {id: 'bad', url: 'http://insecure/a.mp3'}];
const prefs = (adhan_type, sound_id) => ({prayer_settings: {'الفجر': {adhan_type, sound_id}}, reminder_settings: {default_sound_id: 'builtin:asc'}});

test('library adhan plays as a file; builtin plays as a tone; silent plays nothing', () => {
  assert.deepEqual(planSound('cloud-1', library, 'builtin:chime'), {mode: 'file', id: 'cloud-1', url: library[0].url});
  assert.deepEqual(planSound('builtin:asc', library, 'builtin:chime'), {mode: 'tone', id: 'builtin:asc'});
  assert.deepEqual(planSound('builtin:silent', library, 'builtin:chime'), {mode: 'none'});
});

test('missing, unknown or non-https sounds fall back to a tone instead of silence', () => {
  assert.deepEqual(planSound(undefined, library, 'builtin:chime'), {mode: 'tone', id: 'builtin:chime'});
  assert.deepEqual(planSound('gone', library, 'builtin:chime'), {mode: 'tone', id: 'builtin:chime'});
  assert.deepEqual(planSound('bad', library, 'builtin:chime'), {mode: 'tone', id: 'builtin:chime'});
});

test('prayer events honour the silent adhan type and the chosen sound', () => {
  const event = {prayer: 'الفجر', kind: 'at'};
  assert.deepEqual(soundPlanForPrayer(event, prefs('silent', 'cloud-1'), library), {mode: 'none'});
  assert.equal(soundPlanForPrayer(event, prefs('full', 'cloud-1'), library).mode, 'file');
  assert.deepEqual(soundPlanForPrayer({prayer: 'الفجر', kind: 'before'}, prefs('full'), library), {mode: 'tone', id: 'builtin:soft'});
});

test('reminders use their own sound, then the default sound', () => {
  assert.equal(soundPlanForReminder('cloud-1', prefs('full'), library).mode, 'file');
  assert.deepEqual(soundPlanForReminder(undefined, prefs('full'), library), {mode: 'tone', id: 'builtin:asc'});
});

test('bundled local Adhan IDs resolve offline to packaged /sounds/adhan/*.mp3 files', () => {
  assert.deepEqual(planSound('adhan:almulla', [], 'builtin:chime'), {
    mode: 'file',
    id: 'adhan:almulla',
    url: '/sounds/adhan/adhan_almulla.mp3',
  });
  assert.deepEqual(soundPlanForPrayer({prayer: 'الفجر', kind: 'at'}, prefs('full', 'adhan:madinah'), []), {
    mode: 'file',
    id: 'adhan:madinah',
    url: '/sounds/adhan/adhan_madinah.mp3',
  });
});

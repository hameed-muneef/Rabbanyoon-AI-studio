import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile = code => ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const dataUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const typesUrl = dataUrl(compile(readFileSync(new URL('../src/notifications/types.ts', import.meta.url), 'utf8')));
const rulesSource = readFileSync(new URL('../src/notifications/rules.ts', import.meta.url), 'utf8').replace("from './types'", `from '${typesUrl}'`);
const {isReminderAllowed} = await import(dataUrl(compile(rulesSource)));
const {DEFAULT_NOTIFICATION_PREFERENCE} = await import(typesUrl);

const prefs = patch => ({...DEFAULT_NOTIFICATION_PREFERENCE, ...patch});
const at = (h, m) => new Date(2026, 5, 1, h, m);
const reminder = {category: 'reminder'};

test('reminders are allowed by default', () => assert.equal(isReminderAllowed(reminder, prefs({}), at(12, 0)), true));

test('global switch and do-not-disturb mute reminders', () => {
  assert.equal(isReminderAllowed(reminder, prefs({global_enabled: false}), at(12, 0)), false);
  assert.equal(isReminderAllowed(reminder, prefs({dnd_enabled: true}), at(12, 0)), false);
});

test('a disabled category mutes only its own reminders; unknown categories stay allowed', () => {
  const p = prefs({categories: {...DEFAULT_NOTIFICATION_PREFERENCE.categories, goal: false}});
  assert.equal(isReminderAllowed({category: 'goal'}, p, at(12, 0)), false);
  assert.equal(isReminderAllowed({category: 'task'}, p, at(12, 0)), true);
  assert.equal(isReminderAllowed({category: 'custom'}, p, at(12, 0)), true);
});

test('quiet hours mute reminders, including windows that cross midnight', () => {
  const p = prefs({quiet_hours: {enabled: true, start: '22:00', end: '06:00'}});
  assert.equal(isReminderAllowed(reminder, p, at(23, 30)), false);
  assert.equal(isReminderAllowed(reminder, p, at(5, 0)), false);
  assert.equal(isReminderAllowed(reminder, p, at(12, 0)), true);
  assert.equal(isReminderAllowed(reminder, prefs({quiet_hours: {enabled: false, start: '22:00', end: '06:00'}}), at(23, 30)), true);
});

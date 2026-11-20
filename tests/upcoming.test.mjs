import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile = code => ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const dataUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const src = name => readFileSync(new URL(`../src/notifications/${name}.ts`, import.meta.url), 'utf8');
const typesUrl = dataUrl(compile(src('types')));
const load = name => dataUrl(compile(src(name).replaceAll("from './types'", `from '${typesUrl}'`)));
const schedulerUrl = load('scheduler');
const plannerUrl = load('prayer-planner');
const upcomingSource = src('upcoming').replace("from './scheduler'", `from '${schedulerUrl}'`).replace("from './prayer-planner'", `from '${plannerUrl}'`).replace("from './types'", `from '${typesUrl}'`);
const {nextPrayer, upcomingReminders, formatRemaining} = await import(dataUrl(compile(upcomingSource)));

const prayers = {الفجر: '04:30', الظهر: '12:00', العصر: '15:30', المغرب: '18:00', العشاء: '19:30'};
const at = (h, m, d = 1) => new Date(2026, 5, d, h, m);

test('nextPrayer picks the first prayer after now', () => {
  const next = nextPrayer(prayers, at(13, 0));
  assert.equal(next.prayer, 'العصر');
  assert.equal(next.tomorrow, false);
});

test('nextPrayer rolls over to tomorrow Fajr after Isha', () => {
  const next = nextPrayer(prayers, at(21, 0));
  assert.equal(next.prayer, 'الفجر');
  assert.equal(next.tomorrow, true);
  assert.equal(next.at.getDate(), 2);
});

test('nextPrayer ignores missing or invalid times', () => {
  assert.equal(nextPrayer(undefined, at(13, 0)), null);
  assert.equal(nextPrayer({الظهر: 'bad'}, at(13, 0)), null);
  assert.equal(nextPrayer({العصر: '15:30'}, at(13, 0)).prayer, 'العصر');
});

test('upcomingReminders returns enabled future reminders, soonest first, capped', () => {
  const mk = (id, h, enabled = true) => ({id, title: id, scheduled_at: at(h, 0).toISOString(), recurrence: 'none', enabled, category: 'reminder'});
  const list = upcomingReminders([mk('c', 18), mk('a', 14), mk('off', 13, false), mk('past', 9), mk('b', 16)], at(12, 0), 2);
  assert.deepEqual(list.map(item => item.reminder.id), ['a', 'b']);
});

test('formatRemaining is readable Arabic', () => {
  assert.equal(formatRemaining(25 * 60000), 'بعد 25 د');
  assert.equal(formatRemaining(125 * 60000), 'بعد 2 س و5 د');
  assert.equal(formatRemaining(120 * 60000), 'بعد 2 س');
  assert.equal(formatRemaining(10000), 'الآن');
});

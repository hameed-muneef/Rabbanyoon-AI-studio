import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile = code => ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const dataUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const src = name => readFileSync(new URL(`../src/notifications/${name}.ts`, import.meta.url), 'utf8');
const typesUrl = dataUrl(compile(src('types')));
const schedulerSource = src('scheduler').replace("from './types'", `from '${typesUrl}'`);
const {nextDueDate, addDays, prayerNotificationTimes} = await import(dataUrl(compile(schedulerSource)));

const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min);

test('scheduler: daily recurrence returns today if time not passed', () => {
  const reminder = {id: 'r1', title: 'daily test', scheduled_at: at(2026, 11, 3, 8, 0).toISOString(), recurrence: 'daily', enabled: true};
  const now = at(2026, 11, 3, 7, 30);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getHours(), 8);
  assert.equal(next.getMinutes(), 0);
  assert.equal(next.getDate(), 3);
});

test('scheduler: daily recurrence returns tomorrow if time passed', () => {
  const reminder = {id: 'r1', title: 'daily test', scheduled_at: at(2026, 11, 3, 8, 0).toISOString(), recurrence: 'daily', enabled: true};
  const now = at(2026, 11, 3, 9, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getHours(), 8);
  assert.equal(next.getMinutes(), 0);
  assert.equal(next.getDate(), 4);
});

test('scheduler: daily recurrence at exact time moves to next day', () => {
  const reminder = {id: 'r1', title: 'daily test', scheduled_at: at(2026, 11, 3, 8, 0).toISOString(), recurrence: 'daily', enabled: true};
  const now = at(2026, 11, 3, 8, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getDate(), 4);
});

test('scheduler: weekly recurrence includes today if time not passed', () => {
  const reminder = {id: 'r2', title: 'weekly test', scheduled_at: at(2026, 11, 3, 10, 0).toISOString(), recurrence: 'weekly', enabled: true};
  const now = at(2026, 11, 3, 9, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getDay(), 2);
  assert.equal(next.getDate(), 3);
});

test('scheduler: weekly recurrence moves to next week if time passed', () => {
  const reminder = {id: 'r2', title: 'weekly test', scheduled_at: at(2026, 11, 3, 10, 0).toISOString(), recurrence: 'weekly', enabled: true};
  const now = at(2026, 11, 3, 11, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getDay(), 2);
  assert.equal(next.getDate(), 10);
});

test('scheduler: monthly recurrence handles day overflow', () => {
  const reminder = {id: 'r3', title: 'monthly test', scheduled_at: at(2026, 1, 31, 9, 0).toISOString(), recurrence: 'monthly', enabled: true};
  const now = at(2026, 1, 15, 10, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getDate(), 31);
  assert.equal(next.getMonth(), 0);
});

test('scheduler: monthly recurrence handles Feb 31 to Feb 28', () => {
  const reminder = {id: 'r3', title: 'monthly test', scheduled_at: at(2026, 1, 31, 9, 0).toISOString(), recurrence: 'monthly', enabled: true};
  const now = at(2026, 1, 31, 10, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return a date');
  assert.equal(next.getMonth(), 1);
  assert.equal(next.getDate(), 28);
});

test('scheduler: none recurrence returns base if future', () => {
  const reminder = {id: 'r4', title: 'once', scheduled_at: at(2026, 12, 1, 10, 0).toISOString(), recurrence: 'none', enabled: true};
  const now = at(2026, 11, 3, 9, 0);
  const next = nextDueDate(reminder, now);
  assert.ok(next, 'should return base');
  assert.equal(next.getDate(), 1);
  assert.equal(next.getMonth(), 11);
});

test('scheduler: none recurrence returns null if past', () => {
  const reminder = {id: 'r4', title: 'once', scheduled_at: at(2026, 10, 1, 10, 0).toISOString(), recurrence: 'none', enabled: true};
  const now = at(2026, 11, 3, 9, 0);
  assert.equal(nextDueDate(reminder, now), null);
});

test('scheduler: disabled reminder returns null', () => {
  const reminder = {id: 'r5', title: 'disabled', scheduled_at: at(2026, 12, 1, 10, 0).toISOString(), recurrence: 'none', enabled: false};
  const now = at(2026, 11, 3, 9, 0);
  assert.equal(nextDueDate(reminder, now), null);
});

test('scheduler: prayerNotificationTimes computes before/after', () => {
  const result = prayerNotificationTimes('12:00', 10, 15);
  assert.equal(result.at.getHours(), 12);
  assert.equal(result.at.getMinutes(), 0);
  assert.ok(result.before, 'before should exist');
  assert.equal(result.before.getHours(), 11);
  assert.equal(result.before.getMinutes(), 50);
  assert.ok(result.after, 'after should exist');
  assert.equal(result.after.getHours(), 12);
  assert.equal(result.after.getMinutes(), 15);
});

test('scheduler: prayerNotificationTimes without before/after', () => {
  const result = prayerNotificationTimes('08:30');
  assert.equal(result.at.getHours(), 8);
  assert.equal(result.at.getMinutes(), 30);
  assert.equal(result.before, undefined);
  assert.equal(result.after, undefined);
});

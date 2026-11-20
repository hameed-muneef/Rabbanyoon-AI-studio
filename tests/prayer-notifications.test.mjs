import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile = code => ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const dataUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const typesUrl = dataUrl(compile(readFileSync(new URL('../src/notifications/types.ts', import.meta.url), 'utf8')));
const plannerSource = readFileSync(new URL('../src/notifications/prayer-planner.ts', import.meta.url), 'utf8').replace("from './types'", `from '${typesUrl}'`);
const {dailyPrayerEvents, clampAdjustment} = await import(dataUrl(compile(plannerSource)));
const {DEFAULT_NOTIFICATION_PREFERENCE, PRAYER_NAMES} = await import(typesUrl);

const times = {'الفجر': '04:45', 'الظهر': '12:00', 'العصر': '15:25', 'المغرب': '17:50', 'العشاء': '19:10'};
const base = new Date(2026, 5, 1, 0, 0);
const hm = date => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const withSettings = patch => ({prayer_settings: Object.fromEntries(PRAYER_NAMES.map(name => [name, {...DEFAULT_NOTIFICATION_PREFERENCE.prayer_settings[name], enabled: true, remind_before_minutes: 0, remind_after_minutes: 0, ...patch[name]}]))});

test('clampAdjustment bounds manual adjustments and ignores invalid values', () => {
  assert.equal(clampAdjustment(5), 5);
  assert.equal(clampAdjustment(-99), -30);
  assert.equal(clampAdjustment(99), 30);
  assert.equal(clampAdjustment(2.6), 3);
  for (const bad of [undefined, null, NaN, Infinity, '4']) assert.equal(clampAdjustment(bad), 0);
});

test('manual adjustment shifts the adhan and its before/after reminders', () => {
  const events = dailyPrayerEvents(times, withSettings({'الفجر': {adjust_minutes: 3, remind_before_minutes: 10, remind_after_minutes: 15}}), base);
  const fajr = events.filter(event => event.prayer === 'الفجر');
  assert.deepEqual(fajr.map(event => [event.kind, hm(event.at)]), [['before', '04:38'], ['at', '04:48'], ['after', '05:03']]);
});

test('prayers are configured independently and disabled prayers produce no events', () => {
  const events = dailyPrayerEvents(times, withSettings({'العصر': {enabled: false}, 'المغرب': {adjust_minutes: -2}}), base);
  assert.equal(events.some(event => event.prayer === 'العصر'), false);
  assert.equal(hm(events.find(event => event.prayer === 'المغرب' && event.kind === 'at').at), '17:48');
  assert.equal(hm(events.find(event => event.prayer === 'الظهر' && event.kind === 'at').at), '12:00');
});

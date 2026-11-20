import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile = code => ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const dataUrl = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const src = name => readFileSync(new URL(`../src/quran/${name}.ts`, import.meta.url), 'utf8');
const learningUrl = dataUrl(compile(src('learning')));
const {journeySummary, spreadBacklog, BACKLOG_THRESHOLD} = await import(dataUrl(compile(src('journey').replace("from './learning'", `from '${learningUrl}'`))));
const {createQuranState} = await import(learningUrl);

const TODAY = '2026-11-03';
const passage = (id, overrides = {}) => ({
  id, planId: 'plan', contentType: 'quran', surah: 2, ayahStart: 1, ayahEnd: 5, state: 'learning',
  ease: 2.5, intervalDays: 1, dueDate: '2026-11-10', reviewCount: 1, lapses: 0,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...overrides,
});
const plan = {id: 'plan', contentType: 'quran', title: 'خطة', dailyTarget: 5, targetUnit: 'verses', schedule: {days: [0, 1, 2, 3, 4, 5, 6]}, status: 'active', createdAt: '', updatedAt: ''};
const withState = patch => ({...createQuranState(), ...patch});

test('no plan and nothing started: invite to start the hifz journey', () => {
  const s = journeySummary(withState({}), undefined, TODAY);
  assert.equal(s.step.action, 'create_plan');
  assert.equal(s.hasPlan, false);
});

test('plan exists but nothing memorised yet: first session', () => {
  const s = journeySummary(withState({plans: [plan], passages: [passage('p1', {state: 'new', reviewCount: 0, dueDate: undefined})]}), undefined, TODAY);
  assert.equal(s.step.action, 'first_session');
});

test('memorised with nothing due: continue hifz', () => {
  const s = journeySummary(withState({plans: [plan], passages: [passage('p1')]}), undefined, TODAY);
  assert.equal(s.step.action, 'continue_hifz');
  assert.equal(s.memorizedVerses, 5);
});

test('due reviews make review the primary action and count overdue separately', () => {
  const s = journeySummary(withState({plans: [plan], passages: [passage('a', {dueDate: TODAY}), passage('b', {dueDate: '2026-11-01'}), passage('c')]}), undefined, TODAY);
  assert.equal(s.step.action, 'review_today');
  assert.equal(s.step.section, 'revision');
  assert.equal(s.dueCount, 2);
  assert.equal(s.overdueCount, 1);
  assert.deepEqual(s.backlogPlan, []);
});

test('a large backlog suggests a gentle spread over several days', () => {
  const many = Array.from({length: BACKLOG_THRESHOLD + 4}, (_, i) => passage(`p${i}`, {dueDate: '2026-10-20'}));
  const s = journeySummary(withState({plans: [plan], passages: many}), undefined, TODAY);
  assert.equal(s.step.action, 'spread_backlog');
  assert.equal(s.backlogPlan.reduce((a, b) => a + b, 0), many.length);
  assert.ok(Math.max(...s.backlogPlan) <= 5);
});

test('weak passages are counted and hadith passages are ignored', () => {
  const s = journeySummary(withState({plans: [plan], passages: [passage('w', {state: 'needs_revision', dueDate: TODAY}), passage('h', {contentType: 'hadith', dueDate: TODAY})]}), undefined, TODAY);
  assert.equal(s.weakCount, 1);
  assert.equal(s.dueCount, 1);
});

test('spreadBacklog respects the daily cap and bad input', () => {
  assert.deepEqual(spreadBacklog(12, 5), [5, 5, 2]);
  assert.deepEqual(spreadBacklog(0), []);
  assert.deepEqual(spreadBacklog(3, 0), [1, 1, 1]);
});

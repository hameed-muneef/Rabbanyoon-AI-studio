import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/quran/learning.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const learning = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const {
  scheduleReview, applyReview, markMemorized, isDue, duePassages, chunkVerses,
  buildPlanPassages, memorizationStats, readingStats, consistency, routineAppliesOn,
  routineTasksForDate, routineTaskId, syncRoutineTasks, logRoutineCompletion,
  mergeQuranState, createQuranState, dateKey, addDays, PASSAGE_STATES
} = learning;

const basePassage = (overrides = {}) => ({
  id: 'p1', planId: 'plan1', contentType: 'quran', surah: 2, ayahStart: 1, ayahEnd: 5,
  state: 'new', ease: 2.5, intervalDays: 0, reviewCount: 0, lapses: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides
});

test('successful reviews climb 1, 3, 7, 14, 30 days then extend by ease', () => {
  const now = new Date('2026-11-02T10:00:00Z');
  let passage = basePassage();
  const intervals = [];
  for (let index = 0; index < 6; index += 1) {
    const result = scheduleReview(passage, 5, now);
    intervals.push(result.intervalDays);
    passage = {...passage, ...result, ...(result.outcome === 'passed' ? {} : {})};
  }
  assert.deepEqual(intervals.slice(0, 5), [1, 3, 7, 14, 30]);
  assert.ok(intervals[5] > 30, 'المراجعة بعد المستوى الخامس تُمدد وفق السهولة');
});

test('a failed review returns the passage to today and increments lapses', () => {
  const now = new Date('2026-11-02T10:00:00Z');
  const result = scheduleReview(basePassage({reviewCount: 4, intervalDays: 14}), 1, now);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.state, 'needs_revision');
  assert.equal(result.intervalDays, 0);
  assert.equal(result.dueDate, '2026-11-02');
  assert.equal(result.lapses, 1);
  assert.equal(result.reviewCount, 4, 'الفشل لا يزيد عدد المراجعات الناجحة');
});

test('mastery requires repeated success and is never granted by reading', () => {
  const passage = markMemorized(basePassage(), new Date('2026-11-02T10:00:00Z'));
  assert.equal(passage.state, 'learning');
  assert.equal(passage.dueDate, '2026-11-02');
  assert.equal(passage.intervalDays, 0);

  assert.ok(!PASSAGE_STATES.some(item => item.label.includes('قراءة')), 'لا توجد حالة إتقان من القراءة');
  const stats = memorizationStats([passage], []);
  assert.equal(stats.masteredVerses, 0);
  assert.equal(stats.memorizedVerses, 5);
  assert.equal(readingStats([{surah: 1, ayahStart: 1, ayahEnd: 7}]).verses, 7);
  assert.equal(stats.masteredVerses, 0, 'قراءة السورة لا تمنح إتقانًا');
});

test('duePassages excludes mastered passages and sorts by due date', () => {
  const date = '2026-11-02';
  const passages = [
    basePassage({id: 'a', dueDate: '2026-11-03', state: 'learning'}),
    basePassage({id: 'b', dueDate: '2026-11-01', state: 'learning'}),
    basePassage({id: 'c', dueDate: '2026-10-01', state: 'mastered'}),
    basePassage({id: 'd', dueDate: date, state: 'needs_revision'})
  ];
  assert.deepEqual(duePassages(passages, date).map(item => item.id), ['b', 'd']);
  assert.equal(isDue(passages[0], date), false);
  assert.equal(isDue(passages[1], date), true);
  assert.equal(isDue(passages[3], date), true);
});

test('applyReview builds the passage update and its audit event together', () => {
  const now = new Date('2026-11-02T10:00:00Z');
  const {passage, event} = applyReview(basePassage({id: 'p9'}), 4, now);
  assert.equal(passage.id, 'p9');
  assert.equal(passage.reviewCount, 1);
  assert.equal(event.passageId, 'p9');
  assert.equal(event.quality, 4);
  assert.equal(event.outcome, 'passed');
  assert.equal(event.nextDueDate, passage.dueDate);
});

test('plan chunking respects verse targets and page/half-page units', () => {
  const verses = Array.from({length: 10}, (_, index) => ({s: 1, a: index + 1, p: Math.ceil((index + 1) / 3)}));
  const byVerse = chunkVerses(verses, 3, 'verses');
  assert.deepEqual(byVerse.map(chunk => chunk.length), [3, 3, 3, 1]);
  const byPage = chunkVerses(verses, 1, 'pages');
  assert.deepEqual(byPage.map(chunk => chunk.length), [3, 3, 3, 1]);
  assert.deepEqual(chunkVerses(verses, 2, 'pages').map(chunk => chunk.length), [6, 4]);
  const half = chunkVerses(verses, 1, 'half_pages');
  assert.deepEqual(half.map(chunk => chunk.length), [2, 1, 2, 1, 2, 1, 1]);
  assert.equal(half.flat().length, 10, 'تقسيم الصفحات لا يفقد آية');

  const plan = {
    id: 'plan1', contentType: 'quran', title: 'خطة', dailyTarget: 3, targetUnit: 'verses',
    schedule: {days: [0, 1, 2, 3, 4, 5, 6]}, status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  let counter = 0;
  const passages = buildPlanPassages(plan, verses, () => `id-${counter += 1}`);
  assert.equal(passages.length, 4);
  assert.equal(passages[0].ayahStart, 1);
  assert.equal(passages[0].ayahEnd, 3);
  assert.equal(passages.at(-1).ayahEnd, 10);
  assert.ok(passages.every(item => item.state === 'new'));
});

test('routine activities become ordinary daily tasks with a quran: prefix', () => {
  const date = '2026-11-02';
  const activity = {
    id: 'routine-1', kind: 'quran_reading', slot: 'fajr', days: [1], enabled: true,
    config: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  assert.equal(dateKey(new Date(`${date}T12:00:00`)), date);
  assert.equal(routineAppliesOn(activity, date), true);
  assert.equal(routineAppliesOn(activity, '2026-11-03'), false);
  assert.equal(routineAppliesOn({...activity, enabled: false}, date), false);
  assert.equal(routineTaskId(activity), 'quran:routine-1');

  const tasks = routineTasksForDate([activity], date);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'quran:routine-1');
  assert.equal(tasks[0].period, 'daily');
  assert.ok(tasks[0].sourceLabel.includes('القرآن والسنة'));

  const existing = [{id: 'other', title: 'مهمة', period: 'daily', done: false, optional: false}];
  const synced = syncRoutineTasks(existing, [activity], date);
  assert.equal(synced.length, 2);
  assert.equal(synced[0].id, 'other', 'المهام الأخرى لا تُمس');
  const twice = syncRoutineTasks(synced, [activity], date);
  assert.equal(twice.length, 2, 'المزامنة لا تكرر مهمة الورد');

  const completed = synced.map(task => task.id === 'quran:routine-1' ? {...task, done: true, doneKey: date} : task);
  const afterResync = syncRoutineTasks(completed, [activity], date);
  const kept = afterResync.find(task => task.id === 'quran:routine-1');
  assert.equal(kept.done, true, 'إعادة المزامنة تحفظ حالة الإنجاز');
  assert.equal(kept.doneKey, date);

  const removed = syncRoutineTasks(afterResync, [], date);
  assert.equal(removed.some(task => task.id.startsWith('quran:')), false, 'إيقاف النشاط يزيل مهمته');
  assert.equal(removed.length, 1);
});

test('completing a memorization routine queues the next passage without mastery', () => {
  const date = '2026-11-02';
  const activity = {
    id: 'routine-m', kind: 'quran_memorization', slot: 'asr', days: [0, 1, 2, 3, 4, 5, 6], enabled: true,
    config: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const plan = {
    id: 'plan1', contentType: 'quran', title: 'خطة', dailyTarget: 3, targetUnit: 'verses',
    schedule: {days: [0, 1, 2, 3, 4, 5, 6]}, status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const state = createQuranState(new Date(`${date}T08:00:00Z`));
  const withPlan = {
    ...state, plans: [plan],
    passages: [basePassage({id: 'm1', state: 'new'}), basePassage({id: 'm2', state: 'new', ayahStart: 6, ayahEnd: 10})],
    routine: [activity]
  };
  const once = logRoutineCompletion(withPlan, activity, date, new Date(`${date}T09:00:00Z`));
  const first = once.passages.find(item => item.id === 'm1');
  assert.equal(first.state, 'learning');
  assert.equal(first.dueDate, date);
  assert.equal(once.passages.filter(item => item.state === 'mastered').length, 0);
  assert.equal(once.activityLog.length, 1);

  const twice = logRoutineCompletion(once, activity, date, new Date(`${date}T10:00:00Z`));
  assert.equal(twice.activityLog.length, 1, 'إنجاز الورد اليومي لا يُكرر');
  const second = twice.passages.find(item => item.id === 'm2');
  assert.equal(second.state, 'learning');
  assert.equal(twice.passages.filter(item => item.state === 'mastered').length, 0);
});

test('merging local and server state never loses progress or duplicates history', () => {
  const local = {
    ...createQuranState(new Date('2026-11-02T09:00:00Z')),
    bookmarks: [{id: 'b1', surah: 1, ayah: 1, label: 'محلي', createdAt: '2026-11-02T08:00:00.000Z'}],
    history: [
      {id: 'h1', surah: 1, ayahStart: 1, ayahEnd: 7, readAt: '2026-11-02T08:00:00.000Z'},
      {id: 'h2', surah: 2, ayahStart: 1, ayahEnd: 5, readAt: '2026-11-01T08:00:00.000Z'}
    ],
    passages: [basePassage({id: 'p1', reviewCount: 1, state: 'learning'})],
    activityLog: [{activityId: 'routine-1', date: '2026-11-02', kind: 'quran_reading'}]
  };
  const remote = {
    ...createQuranState(new Date('2026-11-02T10:00:00Z')),
    bookmarks: [{id: 'b2', surah: 2, ayah: 255, label: 'خادم', createdAt: '2026-11-02T07:00:00.000Z'}],
    history: [
      {id: 'h2', surah: 2, ayahStart: 1, ayahEnd: 5, readAt: '2026-11-01T08:00:00.000Z'},
      {id: 'h3', surah: 3, ayahStart: 1, ayahEnd: 3, readAt: '2026-11-02T09:30:00.000Z'}
    ],
    passages: [basePassage({id: 'p1', reviewCount: 3, state: 'good'})],
    activityLog: [{activityId: 'routine-1', date: '2026-11-01', kind: 'quran_reading'}]
  };
  const merged = mergeQuranState(local, remote, new Date('2026-11-02T11:00:00Z'));
  assert.equal(merged.bookmarks.length, 2);
  assert.equal(merged.history.length, 3, 'السجل يُدمج بلا تكرار');
  assert.equal(merged.history[0].id, 'h3', 'الأحدث أولًا');
  assert.equal(merged.passages[0].reviewCount, 3, 'أعلى تقدم يُحفظ');
  assert.equal(merged.activityLog.length, 2, 'سجلات الورد لا تُفقد');
});

test('reading a surah is tracked separately from memorization statistics', () => {
  const reading = readingStats([
    {surah: 1, ayahStart: 1, ayahEnd: 7},
    {surah: 1, ayahStart: 1, ayahEnd: 7},
    {surah: 2, ayahStart: 1, ayahEnd: 5}
  ]);
  assert.equal(reading.sessions, 3);
  assert.equal(reading.verses, 12);
  assert.equal(reading.surahs, 2);

  const log = [
    {activityId: 'a', date: '2026-11-02'},
    {activityId: 'a', date: '2026-11-01'}
  ];
  const streak = consistency(log, '2026-11-02');
  assert.equal(streak.today, true);
  assert.equal(streak.last7, 2);
  assert.equal(streak.last30, 2);
  assert.equal(addDays('2026-11-02', -1), '2026-11-01');
});

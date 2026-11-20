import type {Task} from '../app-state';
import type {
  MemorizationPassage, MemorizationPlan, PassageState, QuranAsset, QuranLearningState,
  QuranReflection, RevisionEvent, RoutineActivity, RoutineKind, RoutineSlot
} from './types';

export const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30];

/**
 * مظهر القراءة الأولي للقارئ: يتبع مظهر التطبيق الحالي (نفس مفتاح appearance.ts)
 * ويعود نهاريًا في node/SSR. مضمَّن هنا بدل الاستيراد لأن الاختبارات تُرجم هذا
 * الملف وحده عبر data:URL (أي استيراد وسيط يُسقط الوحدة في الاختبار).
 */
function initialReadingTheme(): 'light' | 'dark' {
  try {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem('rabbani-theme-v1');
    const mode = stored === 'dark' || stored === 'light' ? stored : 'system';
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
    return mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light';
  } catch {return 'light'}
}
export const PASSAGE_STATES: {value: PassageState; label: string}[] = [
  {value: 'new', label: 'لم يبدأ'},
  {value: 'learning', label: 'يتعلم'},
  {value: 'needs_revision', label: 'يحتاج مراجعة'},
  {value: 'good', label: 'جيد'},
  {value: 'mastered', label: 'راسخ'}
];
export const ROUTINE_KINDS: {value: RoutineKind; label: string; icon: string}[] = [
  {value: 'quran_reading', label: 'قراءة القرآن', icon: 'قراءة'},
  {value: 'quran_memorization', label: 'حفظ القرآن', icon: 'حفظ'},
  {value: 'quran_revision', label: 'مراجعة القرآن', icon: 'مراجعة'},
  {value: 'hadith_reading', label: 'قراءة الحديث', icon: 'حديث'},
  {value: 'hadith_memorization', label: 'حفظ الحديث', icon: 'سنة'},
  {value: 'reflection', label: 'تأمل وتطبيق', icon: 'تأمل'}
];
export const ROUTINE_SLOTS: {value: RoutineSlot; label: string}[] = [
  {value: 'fajr', label: 'بعد الفجر'},
  {value: 'duha', label: 'الضحى'},
  {value: 'dhuhr', label: 'بعد الظهر'},
  {value: 'asr', label: 'بعد العصر'},
  {value: 'maghrib', label: 'بعد المغرب'},
  {value: 'isha', label: 'بعد العشاء'},
  {value: 'any', label: 'أي وقت'}
];
export const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function dateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA').format(date);
}

export const utcStamp = (now = new Date()) => now.toISOString();

export function addDays(key: string, days: number): string {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createQuranState(now = new Date()): QuranLearningState {
  const stamp = now.toISOString();
  return {
    settings: {fontSize: 30, theme: initialReadingTheme()},
    bookmarks: [], notes: [], history: [], plans: [], passages: [],
    revisionEvents: [], reflections: [], routine: [], hadithBookmarks: [],
    activityLog: [], updatedAt: stamp
  };
}

// The user opts in explicitly: no Quran tasks are injected into an existing
// task list until a routine activity is added.
export function defaultRoutine(now = new Date()): RoutineActivity[] {
  const stamp = now.toISOString();
  const make = (kind: RoutineKind, slot: RoutineSlot): RoutineActivity => ({
    id: `routine-${kind}`, kind, slot, days: [0, 1, 2, 3, 4, 5, 6], enabled: true,
    config: {}, createdAt: stamp, updatedAt: stamp
  });
  return [
    make('quran_reading', 'fajr'),
    make('quran_memorization', 'asr'),
    make('quran_revision', 'maghrib'),
    make('hadith_reading', 'isha')
  ];
}

export function isEmptyQuranState(state: QuranLearningState): boolean {
  return state.bookmarks.length === 0 && state.notes.length === 0 && state.history.length === 0
    && state.plans.length === 0 && state.passages.length === 0 && state.reflections.length === 0
    && state.activityLog.length === 0;
}

// ============ المراجعة المتباعدة ============

export type ReviewResult = {
  state: PassageState;
  ease: number;
  intervalDays: number;
  dueDate: string;
  lastReviewedAt: string;
  reviewCount: number;
  lapses: number;
  outcome: 'failed' | 'passed';
};

export function scheduleReview(passage: MemorizationPassage, quality: number, now = new Date()): ReviewResult {
  const score = clamp(Math.round(quality), 0, 5);
  const today = dateKey(now);
  const previousEase = Number(passage.ease) || 2.5;
  const failed = score < 3;
  const ease = clamp(previousEase + (failed ? -0.2 : score === 3 ? 0 : score === 4 ? 0.05 : 0.1), 1.3, 3.5);
  if (failed) {
    return {
      state: 'needs_revision', ease, intervalDays: 0, dueDate: today,
      lastReviewedAt: now.toISOString(), reviewCount: passage.reviewCount, lapses: passage.lapses + 1,
      outcome: 'failed'
    };
  }
  // Successful reviews climb the canonical ladder: 1, 3, 7, 14, 30, then ease.
  const successes = passage.reviewCount + 1;
  let intervalDays: number;
  if (successes <= 1) intervalDays = 1;
  else if (successes === 2) intervalDays = 3;
  else if (successes === 3) intervalDays = 7;
  else if (successes === 4) intervalDays = 14;
  else if (successes === 5) intervalDays = 30;
  else intervalDays = Math.round(Math.min(3650, Math.max(30, passage.intervalDays || 30) * ease));
  const mastered = intervalDays >= 30 && successes >= 5 && score >= 4;
  return {
    state: mastered ? 'mastered' : score === 3 ? 'good' : 'good',
    ease, intervalDays, dueDate: addDays(today, intervalDays), lastReviewedAt: now.toISOString(),
    reviewCount: successes, lapses: passage.lapses, outcome: 'passed'
  };
}

export function applyReview(passage: MemorizationPassage, quality: number, now = new Date()):
  {passage: MemorizationPassage; event: Omit<RevisionEvent, 'id'>} {
  const result = scheduleReview(passage, quality, now);
  const updated: MemorizationPassage = {
    ...passage, state: result.state, ease: result.ease, intervalDays: result.intervalDays,
    dueDate: result.dueDate, lastReviewedAt: result.lastReviewedAt, reviewCount: result.reviewCount,
    lapses: result.lapses, updatedAt: now.toISOString()
  };
  return {
    passage: updated,
    event: {
      passageId: passage.id, reviewedAt: now.toISOString(), quality: clamp(Math.round(quality), 0, 5),
      outcome: result.outcome, nextDueDate: result.dueDate, intervalDays: result.intervalDays
    }
  };
}

// Memorizing starts the immediate review; it never grants mastery.
export function markMemorized(passage: MemorizationPassage, now = new Date()): MemorizationPassage {
  return {
    ...passage, state: 'learning', intervalDays: 0, dueDate: dateKey(now), updatedAt: now.toISOString()
  };
}

export function isDue(passage: MemorizationPassage, date = dateKey()): boolean {
  if (!passage.dueDate) return passage.state === 'new';
  return passage.dueDate <= date;
}

export function duePassages(passages: MemorizationPassage[], date = dateKey()): MemorizationPassage[] {
  return passages.filter(passage => passage.state !== 'mastered' && isDue(passage, date))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}

// ============ خطط الحفظ ============

export type PlanVerse = {s: number; a: number; p: number};

export function chunkVerses(verses: PlanVerse[], dailyTarget: number, unit: MemorizationPlan['targetUnit']): PlanVerse[][] {
  if (!verses.length) return [];
  const target = Math.max(1, Math.round(dailyTarget));
  if (unit === 'pages' || unit === 'half_pages') {
    const pageGroups: PlanVerse[][] = [];
    for (const verse of verses) {
      const last = pageGroups[pageGroups.length - 1];
      if (last && last[0].p === verse.p) last.push(verse);
      else pageGroups.push([verse]);
    }
    const units: PlanVerse[][] = [];
    for (const group of pageGroups) {
      if (unit === 'pages') units.push(group);
      else {
        const middle = Math.ceil(group.length / 2);
        units.push(group.slice(0, middle));
        if (middle < group.length) units.push(group.slice(middle));
      }
    }
    const chunks: PlanVerse[][] = [];
    for (let index = 0; index < units.length; index += target) {
      chunks.push(units.slice(index, index + target).flat());
    }
    return chunks;
  }
  const chunks: PlanVerse[][] = [];
  for (let index = 0; index < verses.length; index += target) chunks.push(verses.slice(index, index + target));
  return chunks;
}

export function buildPlanPassages(
  plan: MemorizationPlan,
  verses: PlanVerse[],
  newId: () => string,
  now = new Date()
): MemorizationPassage[] {
  const stamp = now.toISOString();
  return chunkVerses(verses, plan.dailyTarget, plan.targetUnit).map(chunk => ({
    id: newId(), planId: plan.id, contentType: 'quran' as const,
    surah: chunk[0].s, ayahStart: chunk[0].a, ayahEnd: chunk[chunk.length - 1].a,
    state: 'new' as const, ease: 2.5, intervalDays: 0, reviewCount: 0, lapses: 0,
    createdAt: stamp, updatedAt: stamp
  }));
}

export function planProgress(plan: MemorizationPlan, passages: MemorizationPassage[]) {
  const own = passages.filter(passage => passage.planId === plan.id);
  const mastered = own.filter(passage => passage.state === 'mastered').length;
  const total = own.length;
  return {total, mastered, ratio: total ? mastered / total : 0};
}

// ============ الإحصاء ============

function verseKeys(passages: MemorizationPassage[], states: PassageState[]): Set<string> {
  const keys = new Set<string>();
  for (const passage of passages) {
    if (!states.includes(passage.state) || passage.surah == null || passage.ayahStart == null || passage.ayahEnd == null) continue;
    for (let ayah = passage.ayahStart; ayah <= passage.ayahEnd; ayah += 1) keys.add(`${passage.surah}:${ayah}`);
  }
  return keys;
}

export function memorizationStats(passages: MemorizationPassage[], events: RevisionEvent[], surahAyahCounts?: Map<number, number>) {
  const memorizedVerses = verseKeys(passages, ['learning', 'needs_revision', 'good', 'mastered']).size;
  const masteredVerses = verseKeys(passages, ['mastered']).size;
  const failed = events.filter(event => event.outcome === 'failed').length;
  const passed = events.filter(event => event.outcome === 'passed').length;
  const successRate = events.length ? Math.round((passed / events.length) * 100) : 0;
  let masteredSurahs = 0;
  if (surahAyahCounts) {
    const mastered = verseKeys(passages, ['mastered']);
    for (const [surah, ayahs] of surahAyahCounts) {
      let complete = true;
      for (let ayah = 1; ayah <= ayahs; ayah += 1) if (!mastered.has(`${surah}:${ayah}`)) { complete = false; break; }
      if (complete) masteredSurahs += 1;
    }
  }
  return {
    memorizedVerses, masteredVerses, masteredSurahs,
    awaitingRevision: duePassages(passages).length,
    successRate, failed, passed, totalEvents: events.length
  };
}

export function masteredJuzCount(asset: QuranAsset, passages: MemorizationPassage[]): number {
  const mastered = verseKeys(passages, ['mastered']);
  let count = 0;
  for (let juz = 1; juz <= 30; juz += 1) {
    const verses = asset.verses.filter(verse => verse.j === juz);
    if (verses.length && verses.every(verse => mastered.has(`${verse.s}:${verse.a}`))) count += 1;
  }
  return count;
}

export function readingStats(history: {surah: number; ayahStart: number; ayahEnd: number}[]) {
  const keys = new Set<string>();
  const surahs = new Set<number>();
  for (const entry of history) {
    surahs.add(entry.surah);
    for (let ayah = entry.ayahStart; ayah <= entry.ayahEnd; ayah += 1) keys.add(`${entry.surah}:${ayah}`);
  }
  return {sessions: history.length, verses: keys.size, surahs: surahs.size};
}

export function consistency(log: {date: string; activityId: string}[], date = dateKey()) {
  const days = new Set<string>();
  for (let index = 0; index < 30; index += 1) {
    const day = addDays(date, -index);
    if (log.some(entry => entry.date === day)) days.add(day);
  }
  const week = Array.from({length: 7}, (_, index) => addDays(date, -index));
  return {
    last30: days.size,
    last7: week.filter(day => days.has(day)).length,
    today: log.some(entry => entry.date === date)
  };
}

// ============ الورد اليومي والمهام ============

export function routineAppliesOn(activity: RoutineActivity, date = dateKey()): boolean {
  if (!activity.enabled) return false;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return activity.days.includes(weekday);
}

export function routineTaskId(activity: RoutineActivity): string { return `quran:${activity.id}`; }

export function routineSlotLabel(slot: RoutineSlot): string {
  return ROUTINE_SLOTS.find(item => item.value === slot)?.label ?? 'أي وقت';
}

export function routineKindLabel(kind: RoutineKind): string {
  return ROUTINE_KINDS.find(item => item.value === kind)?.label ?? kind;
}

export function routineTaskTitle(activity: RoutineActivity, planTitle?: string): string {
  if (activity.kind === 'quran_memorization' && planTitle) return `حفظ القرآن · ${planTitle}`;
  if (activity.kind === 'quran_revision') return 'مراجعة القرآن (ورد اليوم)';
  if (activity.kind === 'quran_reading') return 'قراءة القرآن (ورد اليوم)';
  if (activity.kind === 'hadith_reading') return 'قراءة الحديث (ورد اليوم)';
  if (activity.kind === 'hadith_memorization') return 'حفظ السنة (ورد اليوم)';
  return 'تأمل وتطبيق (ورد اليوم)';
}

export function routineTasksForDate(
  activities: RoutineActivity[], date: string, plans: MemorizationPlan[] = []
): Task[] {
  return activities.filter(activity => routineAppliesOn(activity, date)).map(activity => {
    const plan = activity.config.planId ? plans.find(item => item.id === activity.config.planId) : undefined;
    return {
      id: routineTaskId(activity),
      title: routineTaskTitle(activity, plan?.title),
      period: 'daily' as const,
      done: false,
      optional: false,
      sourceLabel: `القرآن والسنة · ${routineSlotLabel(activity.slot)}`
    };
  });
}

// Adds/updates today's routine tasks inside the existing task engine without
// duplicating it, preserving done/doneKey for tasks already completed today.
export function syncRoutineTasks(
  tasks: Task[], activities: RoutineActivity[], date: string, plans: MemorizationPlan[] = []
): Task[] {
  const desired = routineTasksForDate(activities, date, plans);
  const desiredIds = new Set(desired.map(task => task.id));
  const kept = tasks.filter(task => !task.id.startsWith('quran:') || desiredIds.has(task.id))
    .map(task => {
      const next = desired.find(item => item.id === task.id);
      return next ? {...task, title: next.title, sourceLabel: next.sourceLabel, period: 'daily' as const} : task;
    });
  const existingIds = new Set(kept.map(task => task.id));
  return [...kept, ...desired.filter(task => !existingIds.has(task.id))];
}

export function logRoutineCompletion(
  state: QuranLearningState, activity: RoutineActivity, date = dateKey(), now = new Date()
): QuranLearningState {
  const exists = state.activityLog.some(entry => entry.activityId === activity.id && entry.date === date);
  const activityLog = exists ? state.activityLog : [...state.activityLog, {activityId: activity.id, date, kind: activity.kind}];
  let passages = state.passages;
  let history = state.history;
  if (activity.kind === 'quran_memorization') {
    const plan = activity.config.planId
      ? state.plans.find(item => item.id === activity.config.planId)
      : state.plans.find(item => item.contentType === 'quran' && item.status === 'active');
    if (plan) {
      const target = state.passages.find(passage => passage.planId === plan.id && passage.state === 'new');
      if (target) passages = passages.map(passage => passage.id === target.id ? markMemorized(passage, now) : passage);
    }
  }
  if (activity.kind === 'quran_reading' && activity.config.surah && activity.config.ayahFrom) {
    const ayahStart = activity.config.ayahFrom;
    const ayahEnd = Math.max(ayahStart, activity.config.ayahTo ?? ayahStart);
    const recorded = state.history.some(entry => entry.surah === activity.config.surah && entry.ayahStart === ayahStart && entry.readAt.slice(0, 10) === date);
    if (!recorded) {
      history = [{id: `routine-${activity.id}-${date}`, surah: activity.config.surah, ayahStart, ayahEnd, readAt: now.toISOString()}, ...history].slice(0, 500);
    }
  }
  return {...state, activityLog, passages, history, updatedAt: now.toISOString()};
}

// ============ الدمج الآمن مع الخادم ============

type Stamped = {createdAt?: string; updatedAt?: string; reviewedAt?: string; readAt?: string};
const stampOf = (item: Stamped) => item.updatedAt ?? item.createdAt ?? item.reviewedAt ?? item.readAt ?? '';

function mergeById<T extends {id: string} & Stamped>(local: T[], remote: T[], prefer?: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing) { map.set(item.id, item); continue; }
    map.set(item.id, prefer ? prefer(item, existing) : (stampOf(item) >= stampOf(existing) ? item : existing));
  }
  return [...map.values()];
}

export function mergeQuranState(local: QuranLearningState, remote: QuranLearningState, now = new Date()): QuranLearningState {
  const newer = stampOf(remote) > stampOf(local) ? remote : local;
  const position = ([local.readingPosition, remote.readingPosition].filter(Boolean) as NonNullable<QuranLearningState['readingPosition']>[])
    .sort((a, b) => stampOf(b).localeCompare(stampOf(a)))[0];
  const logs = new Map<string, {activityId: string; date: string; kind: RoutineKind}>();
  for (const entry of [...remote.activityLog, ...local.activityLog]) logs.set(`${entry.activityId}:${entry.date}`, entry);
  const reflectionPrefer = (a: QuranReflection, b: QuranReflection) => stampOf(a) >= stampOf(b) ? a : b;
  return {
    settings: newer.settings ?? local.settings,
    readingPosition: position,
    bookmarks: mergeById(local.bookmarks, remote.bookmarks),
    notes: mergeById(local.notes, remote.notes),
    history: mergeById(local.history, remote.history).sort((a, b) => b.readAt.localeCompare(a.readAt)).slice(0, 500),
    plans: mergeById(local.plans, remote.plans),
    passages: mergeById(local.passages, remote.passages, (a, b) => a.reviewCount !== b.reviewCount ? (a.reviewCount > b.reviewCount ? a : b) : (stampOf(a) >= stampOf(b) ? a : b)),
    revisionEvents: mergeById(local.revisionEvents, remote.revisionEvents),
    reflections: mergeById(local.reflections, remote.reflections, reflectionPrefer),
    routine: mergeById(local.routine, remote.routine),
    hadithBookmarks: mergeById(local.hadithBookmarks, remote.hadithBookmarks),
    activityLog: [...logs.values()],
    updatedAt: now.toISOString()
  };
}

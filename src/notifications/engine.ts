// محرك التسليم الحي — يستدعي أحداث المنبهات وأذان الصلاة عند استحقاقها.
// صريح بشأن قيود المتصفح: التسليم يعمل فقط أثناء فتح التطبيق، ولا يوازي أذان
// الجهاز الأصلي. هذا موثق في صفحة الإعدادات ويُوحَّد مع المستقبل عبر PlatformAdapter.

import {useEffect, useRef} from 'react';
import {nextDueDate} from './scheduler';
import {dailyPrayerEvents, isPrayerEventAllowed, type PrayerEvent} from './prayer-planner';
import {isReminderAllowed} from './rules';
import type {NotificationPreference, Reminder} from './types';
import type {MemorizationPassage} from '../quran/types';

export type DueItem =
  | {kind: 'reminder'; key: string; reminder: Reminder; at: Date}
  | {kind: 'prayer'; key: string; event: PrayerEvent; at: Date; silent: boolean}
  | {kind: 'review'; key: string; passage: MemorizationPassage; at: Date};

/**
 * نطاق عمل خالص: يجمع المستحقات الآن (يسمح بالأحداث المتأخرة حتى 60 دقيقة للمنبهات
 * و10 دقائق للصلاة كي لا يفلت حدث جاء التطبيق بعده بقليل) ويستثني ما سُلِّم سابقًا.
 */
export function pickDueItems(
  reminders: Reminder[],
  prayers: Record<string, string> | null,
  prefs: NotificationPreference,
  fired: ReadonlySet<string>,
  now = new Date(),
  passages?: MemorizationPassage[],
): DueItem[] {
  const due: DueItem[] = [];
  if (prefs.global_enabled) {
    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      const next = nextDueDate(reminder, now);
      if (!next) continue;
      const snooze = reminder.snooze_until ? new Date(reminder.snooze_until) : null;
      const effective = snooze && snooze > next ? snooze : next;
      const late = now.getTime() - effective.getTime();
      if (late > 60 * 60 * 1000) continue; // ضاع موعده منذ أكثر من ساعة
      if (!isReminderAllowed(reminder, prefs, now)) continue;
      const key = `rem:${reminder.id}:${effective.toISOString()}`;
      if (fired.has(key)) continue;
      // أطلق فقط إذا كان مستحقًا (≤2 دqiqات متأخر) أو خلال 30 ثانية في المستقبل (فاصل tick)
      if (late >= -30000 && late <= 120000) due.push({kind: 'reminder', key, reminder, at: effective});
    }
  }
  if (prayers) {
    for (const event of dailyPrayerEvents(prayers, prefs, now)) {
      const late = now.getTime() - event.at.getTime();
      if (late > 10 * 60 * 1000) continue;
      if (late < -30000 || late > 120000) continue;
      if (fired.has(event.key) || fired.has(`${event.key}:done`)) continue;
      if (!isPrayerEventAllowed(event, prefs, now)) continue;
      const silent = prefs.prayer_settings?.[event.prayer]?.adhan_type === 'silent';
      due.push({kind: 'prayer', key: event.key, event, at: event.at, silent});
    }
  }
  // Memorization review notifications
  if (passages && passages.length > 0) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const passage of passages) {
      if (passage.state === 'mastered') continue;
      if (!passage.dueDate || passage.dueDate > today) continue;
      const key = `review:${passage.id}:${passage.dueDate}`;
      if (fired.has(key) || fired.has(`${key}:done`)) continue;
      if (!prefs.global_enabled) continue;
      if (prefs.categories?.['reminder'] === false) continue;
      if (prefs.dnd_enabled) continue;
      const quiet = prefs.quiet_hours;
      if (quiet?.enabled) {
        const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const active = quiet.start <= quiet.end ? current >= quiet.start && current <= quiet.end : current >= quiet.start || current <= quiet.end;
        if (active) continue;
      }
      const at = new Date(now);
      at.setHours(9, 0, 0, 0);
      if (at < now) {
        // If 9 AM already passed, fire now
        // (the notification is overdue, deliver immediately)
      }
      due.push({kind: 'review', key, passage, at: at < now ? now : at});
    }
  }
  return due.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const FIRED_KEY = 'rabbani-notif-fired-v1';

export function dayKeyOf(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export type FiredStore = Record<string, string[]>;

/** مفاتيح الأحداث المُسلَّمة محليًا — تمنع التكرار حتى بعد إعادة فتح التطبيق */
export function loadFiredKeys(storage: Pick<Storage, 'getItem'> | null): Set<string> {
  try {
    if (!storage) return new Set();
    const raw = storage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as FiredStore;
    const merged = new Set<string>();
    for (const list of Object.values(parsed)) for (const key of list ?? []) merged.add(key);
    return merged;
  } catch {
    return new Set();
  }
}

/** يحفظ المفاتيح مقدمة اليوم الحالي، ويحتفظ بيوم أمس ومفاتيح المنبهات الأخيرة فقط */
export function saveFiredKeys(storage: Pick<Storage, 'getItem'|'setItem'> | null, keys: ReadonlySet<string>): void {
  try {
    if (!storage || !keys.size) return;
    const today = dayKeyOf();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = dayKeyOf(yesterdayDate);
    const store: FiredStore = {
      [today]: [],
      [yesterday]: [],
    };
    const reminderKeys: string[] = [];
    for (const key of keys) {
      if (key.startsWith('prayer:')) {
        const match = /^prayer:(\d{4}-\d{2}-\d{2}):/.exec(key);
        if (!match) continue;
        const bucket = match[1] === today ? today : match[1] === yesterday ? yesterday : null;
        if (bucket && store[bucket].length < 100) store[bucket].push(key);
      } else {
        reminderKeys.push(key);
      }
    }
    store[today].push(...reminderKeys.slice(-300));
    storage.setItem(FIRED_KEY, JSON.stringify(store));
  } catch {
    // التخزين قد يكون غير متاح؛ التكرار محتمل لكن لا عطل وظيفي
  }
}

type WatcherInput = {reminders: Reminder[]; prayers: Record<string, string> | null; prefs: NotificationPreference; passages?: MemorizationPassage[]};

/**
 * يراقب المستحقات كل 30 ثانية ويستدعي رد التسليم لكل حدث مستحق مرة واحدة فقط.
 * المُغلّفات القيمة تُمرر عبر refs فتبقى دائمًا آخر قيمة.
 */
export function useDueWatcher(
  getInput: () => WatcherInput | null,
  deliver: (item: DueItem) => void,
  storage: Pick<Storage, 'getItem'|'setItem'> | null = typeof window !== 'undefined' ? window.localStorage : null,
): void {
  const inputRef = useRef<() => WatcherInput | null>(getInput);
  const deliverRef = useRef<(item: DueItem) => void>(deliver);
  inputRef.current = getInput;
  deliverRef.current = deliver;

  useEffect(() => {
    const fired = loadFiredKeys(storage);
    const tick = () => {
      const input = inputRef.current();
      if (!input) return;
      const now = new Date();
      const due = pickDueItems(input.reminders, input.prayers, input.prefs, fired, now, input.passages);
      if (!due.length) return;
      for (const item of due) {
        fired.add(item.kind === 'reminder' ? item.key : `${item.key}:done`);
        try {deliverRef.current(item)} catch {/* فشل توصيل واحد لا يعطل بقية المستحقات */}
      }
      saveFiredKeys(storage, fired);
    };
    tick();
    const timer = window.setInterval(tick, 30000);
    const onVisible = () => {if (document.visibilityState === 'visible') tick()};
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [storage]);
}

export type {PrayerEvent};

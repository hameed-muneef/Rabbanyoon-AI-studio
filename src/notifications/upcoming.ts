// ملخص «القادم» للصفحة الرئيسية: أقرب صلاة وأقرب التذكيرات (نطاق عمل خالص).

import {nextDueDate} from './scheduler';
import {hhmmToDate} from './prayer-planner';
import {PRAYER_NAMES, type PrayerName, type Reminder} from './types';

export type NextPrayer = {prayer: PrayerName; at: Date; time: string; tomorrow: boolean};

/** أقرب صلاة بعد الآن؛ إن انتهت صلوات اليوم فهي فجر الغد */
export function nextPrayer(prayers: Record<string, string> | undefined, now = new Date()): NextPrayer | null {
  if (!prayers) return null;
  let first: NextPrayer | null = null;
  for (const prayer of PRAYER_NAMES) {
    const time = prayers[prayer];
    const at = hhmmToDate(time, now);
    if (!at) continue;
    if (at.getTime() > now.getTime()) return {prayer, at, time, tomorrow: false};
    if (!first) {
      const tomorrow = hhmmToDate(time, now, 1);
      if (tomorrow) first = {prayer, at: tomorrow, time, tomorrow: true};
    }
  }
  return first;
}

export type UpcomingReminder = {reminder: Reminder; at: Date};

/** التذكيرات المفعّلة القادمة مرتبة بالأقرب */
export function upcomingReminders(reminders: Reminder[], now = new Date(), limit = 3): UpcomingReminder[] {
  const items: UpcomingReminder[] = [];
  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const at = nextDueDate(reminder, now);
    if (at && at.getTime() > now.getTime()) items.push({reminder, at});
  }
  return items.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, Math.max(0, limit));
}

/** «بعد 25 د» / «بعد ساعتين و5 د» */
export function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `بعد ${minutes} د`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `بعد ${h} س و${m} د` : `بعد ${h} س`;
}

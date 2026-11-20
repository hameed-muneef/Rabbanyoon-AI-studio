// خدمة الجدولة والمنبهات
// تحسب الوقت التالي للتنبيه، وتتعامل مع التكرار والمناطق الزمنية وتوقيت الصيفي.
// لا تعتمد على منصة التوصيل؛ تُستدعى من خدمة التوصيل عند الحاجة.

import type {Reminder} from './types';

const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatTimeHM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDateYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * يحسب الموعد التالي للتنبيه بناءً على التكرار والوقت الحالي.
 * يعرض null إذا لم يكن هناك موعد قادم (انتهى التكرار أو غير مفعّل).
 */
export function nextDueDate(reminder: Reminder, now: Date = new Date()): Date | null {
  if (!reminder.enabled) return null;
  const base = new Date(reminder.scheduled_at);
  if (isNaN(base.getTime())) return null;

  const recurrence = reminder.recurrence;
  const config = reminder.recurrence_config ?? {};

  // مرة واحدة
  if (recurrence === 'none') {
    return base > now ? base : null;
  }

  //毎日
  if (recurrence === 'daily') {
    const candidate = new Date(now);
    candidate.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
    if (candidate <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  // أيام الأسبوع المختارة
  if (recurrence === 'weekdays' || recurrence === 'weekday') {
    const days = config.days_of_week ?? (recurrence === 'weekday' ? [0] : [1, 2, 3, 4, 5]);
    let candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setMilliseconds(0);
    // ابحث عن اليوم التالي المطابق بعد الوقت الحالي
    for (let offset = 0; offset < 8; offset += 1) {
      const testDay = addDays(now, offset);
      if (!days.includes(testDay.getDay())) continue;
      const candidateTime = new Date(testDay);
      candidateTime.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
      if (candidateTime > now) return candidateTime;
    }
    return null;
  }

  // أسبوعيًا
  if (recurrence === 'weekly') {
    const dayOfWeek = base.getDay();
    for (let offset = 0; offset <= 8; offset += 1) {
      const testDay = addDays(now, offset);
      if (testDay.getDay() !== dayOfWeek) continue;
      const candidateTime = new Date(testDay);
      candidateTime.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
      if (candidateTime > now) return candidateTime;
    }
    return null;
  }

  // شهريًا
  if (recurrence === 'monthly') {
    const dayOfMonth = base.getDate();
    const hours = base.getHours();
    const minutes = base.getMinutes();
    const seconds = base.getSeconds();

    // جرب هذا الشهر
    const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let candidate = new Date(now.getFullYear(), now.getMonth(), Math.min(dayOfMonth, lastDayThisMonth), hours, minutes, seconds);
    if (candidate <= now) {
      // جرب الشهر التالي
      const nextMonth = now.getMonth() + 1;
      const nextYear = nextMonth > 11 ? now.getFullYear() + 1 : now.getFullYear();
      const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
      const lastDayNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
      candidate = new Date(nextYear, normalizedMonth, Math.min(dayOfMonth, lastDayNextMonth), hours, minutes, seconds);
    }
    return candidate > now ? candidate : null;
  }

  // مخصص (فاصل أيام)
  if (recurrence === 'custom') {
    const interval = Math.max(1, config.interval_days ?? 1);
    let candidate = new Date(base);
    while (candidate <= now) {
      candidate = addDays(candidate, interval);
    }
    return candidate;
  }

  // تواريخ محددة
  if (recurrence === 'specific_dates') {
    const dates = (config.specific_dates ?? []).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    const future = dates.filter(d => d > now);
    if (future.length === 0) return null;
    return future.reduce((earliest, d) => (d < earliest ? d : earliest), future[0]);
  }

  return null;
}

/**
 * يحسب قائمة المواعيد القادمة للتنبيه خلال فترة محددة.
 */
export function upcomingOccurrences(reminder: Reminder, from: Date, limit = 10): Date[] {
  const results: Date[] = [];
  let current = new Date(from);
  for (let i = 0; i < limit * 2; i += 1) {
    const next = nextDueDate(reminder, current);
    if (!next) break;
    results.push(next);
    current = new Date(next.getTime() + 1000); //move one second forward to avoid infinite loop
    if (results.length >= limit) break;
  }
  return results;
}

/**
 * يتحقق مما إذا كان التذكير مستحقًا الآن ( within a small window ).
 */
export function isDue(reminder: Reminder, now: Date = new Date(), windowSeconds = 60): boolean {
  const next = nextDueDate(reminder, now);
  if (!next) return false;
  return Math.abs(next.getTime() - now.getTime()) <= windowSeconds * 1000;
}

/**
 * يحسب وقت الأذان مع مراعاة التذكير قبل/بعد الصلاة.
 */
export function prayerNotificationTimes(prayerTime: string, beforeMinutes?: number, afterMinutes?: number): {before?: Date; after?: Date; at: Date} {
  const [hours, minutes] = prayerTime.split(':').map(Number);
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  const result: {before?: Date; after?: Date; at: Date} = {at};
  if (beforeMinutes && beforeMinutes > 0) {
    result.before = addMinutes(at, -beforeMinutes);
  }
  if (afterMinutes && afterMinutes > 0) {
    result.after = addMinutes(at, afterMinutes);
  }
  return result;
}

export {WEEK_DAYS};
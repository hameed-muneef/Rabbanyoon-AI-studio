// src/lib/prayer-schedule.ts
// منطق خالص (pure) لحساب مواقيت الصلاة لعدة أيام باستخدام adhan.
// لا يعتمد على React أو Capacitor. قابل للاختبار (Vitest).
import { PrayerTimes, CalculationMethod, Madhab, Coordinates, type CalculationParameters } from 'adhan';

export type PrayerMethod =
  | 'MuslimWorldLeague' | 'Egyptian' | 'Karachi' | 'UmmAlQura' | 'Dubai'
  | 'MoonsightingCommittee' | 'NorthAmerica' | 'Kuwait' | 'Qatar' | 'Singapore'
  | 'Tehran' | 'Turkey';

export type PrayerMadhab = 'Shafi' | 'Hanafi';

export interface PrayerLocation { latitude: number; longitude: number; }

export interface PrayerAdjustments {
  fajr?: number; dhuhr?: number; asr?: number; maghrib?: number; isha?: number;
}

export interface ScheduledPrayer {
  /** YYYY-MM-DD */
  date: string;
  /** اسم الصلاة */
  prayer: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
  /** وقت الصلاة (Date) */
  at: Date;
  /** وقت الصلاة HH:MM */
  hhmm: string;
}

const PRAYER_KEYS: ScheduledPrayer['prayer'][] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const ADHAN_KEY: Record<ScheduledPrayer['prayer'], string> = {
  Fajr: 'fajr', Dhuhr: 'dhuhr', Asr: 'asr', Maghrib: 'maghrib', Isha: 'isha',
};
const PRAYER_NAMES_AR: Record<ScheduledPrayer['prayer'], string> = {
  Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء',
};

const ALADHAN_METHOD_MAP: Record<number, PrayerMethod> = {
  1: 'Karachi',
  2: 'NorthAmerica',
  3: 'MuslimWorldLeague',
  4: 'UmmAlQura',
  5: 'Egyptian',
  7: 'Tehran',
  8: 'Dubai',
  9: 'Kuwait',
  10: 'Qatar',
  11: 'Singapore',
  13: 'Turkey',
  15: 'MoonsightingCommittee',
};

export function mapAlAdhanMethod(method?: number): PrayerMethod {
  if (typeof method === 'number' && method in ALADHAN_METHOD_MAP) {
    return ALADHAN_METHOD_MAP[method];
  }
  return 'MuslimWorldLeague';
}

export function mapAlAdhanMadhab(school?: 0 | 1): PrayerMadhab {
  return school === 1 ? 'Hanafi' : 'Shafi';
}

export function prayerNameAr(p: ScheduledPrayer['prayer']): string {
  return PRAYER_NAMES_AR[p];
}

function paramsFor(method: PrayerMethod, madhab: PrayerMadhab): CalculationParameters {
  const factory = (CalculationMethod as Record<string, () => CalculationParameters>)[method];
  const p = factory ? factory() : CalculationMethod.MuslimWorldLeague();
  p.madhab = Madhab[madhab];
  return p;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function formatHHMM(date: Date, timeZone?: string): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const hh = parts.find((p) => p.type === 'hour')?.value;
      const mm = parts.find((p) => p.type === 'minute')?.value;
      if (hh && mm) return `${hh}:${mm}`;
    } catch { /* fallback to device local time */ }
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function computeDayPrayerStrings(
  location: PrayerLocation,
  date: Date,
  method: PrayerMethod = 'MuslimWorldLeague',
  madhab: PrayerMadhab = 'Shafi',
  timeZone?: string,
): Record<string, string> {
  const coords = new Coordinates(location.latitude, location.longitude);
  const params = paramsFor(method, madhab);
  const pt = new PrayerTimes(coords, date, params);
  const result: Record<string, string> = {};
  const entries: Array<[string, Date]> = [
    ['الفجر', pt.fajr],
    ['الشروق', pt.sunrise],
    ['الظهر', pt.dhuhr],
    ['العصر', pt.asr],
    ['المغرب', pt.maghrib],
    ['العشاء', pt.isha],
  ];
  for (const [label, d] of entries) {
    if (d instanceof Date && !isNaN(d.getTime())) {
      result[label] = formatHHMM(d, timeZone);
    }
  }
  return result;
}

export function computePrayerTimes(
  location: PrayerLocation,
  date: Date,
  method: PrayerMethod = 'MuslimWorldLeague',
  madhab: PrayerMadhab = 'Shafi',
  adjustments: PrayerAdjustments = {},
): ScheduledPrayer[] {
  const coords = new Coordinates(location.latitude, location.longitude);
  const params = paramsFor(method, madhab);
  const pt = new PrayerTimes(coords, date, params);
  const adj: Record<string, number> = {
    Fajr: adjustments.fajr ?? 0,
    Dhuhr: adjustments.dhuhr ?? 0,
    Asr: adjustments.asr ?? 0,
    Maghrib: adjustments.maghrib ?? 0,
    Isha: adjustments.isha ?? 0,
  };
  const out: ScheduledPrayer[] = [];
  for (const key of PRAYER_KEYS) {
    const d = pt[ADHAN_KEY[key] as keyof PrayerTimes] as Date;
    if (!(d instanceof Date) || isNaN(d.getTime())) continue;
    const adjusted = new Date(d.getTime() + (adj[key] ?? 0) * 60000);
    const ymd = `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}`;
    out.push({
      date: ymd,
      prayer: key,
      at: adjusted,
      hhmm: `${pad(adjusted.getHours())}:${pad(adjusted.getMinutes())}`,
    });
  }
  return out;
}

export function computePrayerSchedule(
  location: PrayerLocation,
  startDate: Date,
  days: number,
  method: PrayerMethod = 'MuslimWorldLeague',
  madhab: PrayerMadhab = 'Shafi',
  adjustments: PrayerAdjustments = {},
): ScheduledPrayer[] {
  const safeDays = Math.max(1, Math.min(30, Math.round(days)));
  const result: ScheduledPrayer[] = [];
  const base = new Date(startDate);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < safeDays; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    result.push(...computePrayerTimes(location, d, method, madhab, adjustments));
  }
  return result;
}

export function prayerId(date: string, prayer: string): number {
  // stable positive non-zero numeric id for LocalNotifications (32-bit int)
  let hash = 2166136261;
  const s = `${date}|${prayer}`;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash | 0) % 2147483646) + 1;
}

// مخطط إشعارات الصلاة (نطاق عمل خالص قابل للاختبار بلا واجهة أو منصة توصيل)
// يحسب أحداث الصلاة القادمة لليوم من مواقيت المستخدم وتفضيلاته لكل صلاة على حدة.

import {PRAYER_NAMES, type NotificationPreference, type PrayerAdhanType, type PrayerName} from './types';

export type PrayerEventKind = 'at' | 'before' | 'after';

export type PrayerEvent = {
  /** مفتاح فريد ثابت يمنع التسليم المزدوج لنفس الحدث */
  key: string;
  prayer: PrayerName;
  kind: PrayerEventKind;
  /** عدد الدقائق عن وقت الأذان (سالب قبل وقت الصلاة) */
  offsetMinutes: number;
  at: Date;
  title: string;
  body: string;
};

export function isPrayerName(value: string): value is PrayerName {
  return (PRAYER_NAMES as string[]).includes(value);
}

export function defaultAdhanType(prayer: PrayerName): PrayerAdhanType {
  return prayer === 'الظهر' || prayer === 'العصر' ? 'short' : 'full';
}

/** يحوّل «HH:MM» إلى موعد من يوم اليوم (أو يوم مزاح بعدة أيام)؛ بلا قيمة أو قيمة تالفة → null */
export function hhmmToDate(hhmm: string | undefined, base = new Date(), offsetDays = 0): Date | null {
  if (typeof hhmm !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const at = new Date(base);
  at.setDate(at.getDate() + offsetDays);
  const [hours, minutes] = hhmm.split(':').map(Number);
  at.setHours(hours, minutes, 0, 0);
  return at;
}

export const MAX_PRAYER_ADJUSTMENT = 30;

/** تعديل يدوي بالدقائق لوقت الصلاة؛ القيم غير الصحيحة تُهمل والحد ±30 دقيقة */
export function clampAdjustment(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-MAX_PRAYER_ADJUSTMENT, Math.min(MAX_PRAYER_ADJUSTMENT, Math.round(value)));
}

function eventTitle(prayer: PrayerName, kind: PrayerEventKind, minutes: number): string {
  if (kind === 'at') return `حان وقت صلاة ${prayer}`;
  const diff = Math.abs(minutes);
  const unit = diff >= 60 ? `${Math.floor(diff / 60)} ساعة${diff % 60 ? ` و${diff % 60} دقيقة` : ''}` : `${diff} دقيقة`;
  const direction = kind === 'before' ? 'قبل أذان' : 'بعد أذان';
  return `${direction} صلاة ${prayer} · ${unit}`;
}

/**
 * يبني كل أحداث الصلاة لليوم: أذان كل صلاة + تذكير قبلها + تذكير بعدها،
 * حسب تفعيل كل صلاة وتخصيصها في التفضيلات. لا يقرر هنا ما يُسلَّم فعليًا؛
 * المحرك (engine) يقرر ذلك حسب الوقت الحالي وقواعد ساعات الهدوء.
 */
export function dailyPrayerEvents(
  prayers: Record<string, string>,
  prefs: Pick<NotificationPreference, 'prayer_settings'>,
  base = new Date(),
): PrayerEvent[] {
  const events: PrayerEvent[] = [];
  const dayKey = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
  for (const prayer of PRAYER_NAMES) {
    const settings = prefs.prayer_settings?.[prayer];
    if (!settings?.enabled) continue;
    const raw = hhmmToDate(prayers[prayer], base);
    if (!raw) continue;
    const at = new Date(raw.getTime() + clampAdjustment(settings.adjust_minutes) * 60000);
    const push = (kind: PrayerEventKind, at: Date, offsetMinutes: number) => {
      events.push({
        key: `prayer:${dayKey}:${prayer}:${kind}:${offsetMinutes}`,
        prayer,
        kind,
        offsetMinutes,
        at,
        title: eventTitle(prayer, kind, offsetMinutes),
        body: kind === 'at'
          ? 'بنوته للصلاة. ﴿وَأَقِمِ الصَّلَاةَ إِنَّ الصَّلَاةَ تَنْهَىٰ عَنِ الْفَحْشَاءِ وَالْمُنْكَرِ﴾'
          : kind === 'before' ? 'استعد للصلاة، وبادرها قبل أذانها بمقتضى سنتنا.' : 'اتبع الصلاة بالذكر والاستغفار.',
      });
    };
    push('at', at, 0);
    const beforeMinutes = settings.remind_before_minutes ?? 0;
    if (beforeMinutes > 0) push('before', new Date(at.getTime() - beforeMinutes * 60000), -beforeMinutes);
    const afterMinutes = settings.remind_after_minutes ?? 0;
    if (afterMinutes > 0) push('after', new Date(at.getTime() + afterMinutes * 60000), afterMinutes);
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * قاعدة السماح بالتسليم (نطاق عمل خالص، صريحة بلا منطق مخفي):
 * - المحرك مغلق عالميًا → لا شيء.
 * - فئة «الصلاة» معطلة → لا إشعارات صلاة.
 * - عدم الإزعاج أو ساعات الهدوء المفعلة → يُكتم كل شيء خلال نافذتها.
 */
export function isPrayerEventAllowed(
  _event: PrayerEvent,
  prefs: Pick<NotificationPreference, 'global_enabled' | 'categories' | 'quiet_hours' | 'dnd_enabled'>,
  now = new Date(),
): boolean {
  if (!prefs.global_enabled) return false;
  if (prefs.categories && prefs.categories.prayer === false) return false;
  if (prefs.dnd_enabled) return false;
  const quiet = prefs.quiet_hours;
  if (quiet?.enabled) {
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const start = quiet.start;
    const end = quiet.end;
    const active = start <= end ? current >= start && current <= end : current >= start || current <= end;
    if (active) return false;
  }
  return true;
}

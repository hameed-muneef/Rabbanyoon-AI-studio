// src/notifications/native-prayer-scheduler.ts
// جدولة أذان الصلاة (AlarmManager + AdhanPlaybackService) والمنبهات عبر @capacitor/local-notifications (Android/iOS).
// تعمل فقط في بيئة Capacitor (native). في الويب تُتجاهل (no-op).
import {
  computePrayerSchedule,
  mapAlAdhanMadhab,
  mapAlAdhanMethod,
  prayerId,
  prayerNameAr,
  type PrayerMadhab,
  type PrayerMethod,
} from '../lib/prayer-schedule';
import {
  cancelNativeAdhanAlarms,
  ensureNativeAdhanChannel,
  getAndroidEnvironmentStatus,
  scheduleNativeAdhanAlarms,
  type NativeAdhanAlarmInput,
} from '../lib/settings-opener';
import type { PrayerLocation } from '../prayer-location';
import {
  getSelectedDefaultAdhanId,
  resolvePrayerAdhan,
} from '../sounds/adhan-catalog';
import { isReminderAllowed } from './rules';
import { upcomingOccurrences } from './scheduler';
import {
  isQuietHoursActive,
  type NotificationPreference,
  type PrayerName,
  type Reminder,
} from './types';

export const ADHAN_CHANNEL_ID = 'al-rabbani-adhan-adhan_almulla-v1';
export const GENERAL_CHANNEL_ID = 'al-rabbani-general';

export const NOTIFICATIONS_CHANGED_EVENT = 'rabbani:notifications-changed';
export const NATIVE_SCHEDULE_UPDATED_EVENT = 'rabbani:native-schedule-updated';

const PRAYER_IDS_STORAGE_KEY = 'rabbani-native-prayer-ids-v1';
const REMINDER_IDS_STORAGE_KEY = 'rabbani-native-reminder-ids-v1';
const MAX_PRAYER_ALARMS = 350;
const MAX_REMINDER_ALARMS = 80;

export interface NativeScheduleOptions {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number; // 7..14
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
}

export interface NativeScheduleResult {
  scheduled: number;
  cancelled: number;
  warning?: string;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  exactAlarm: 'granted' | 'denied' | 'unsupported';
  channelId?: string;
  soundMode?: 'adhan' | 'default';
}

export interface ActiveChannelInfo {
  adhanChannelId: string;
  soundFile: string;
  soundTitle: string;
  soundMode: 'adhan' | 'default';
}

export interface NativeNotificationPayload {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle: boolean };
  channelId: string;
  foreground?: boolean;
  isExactNotification?: boolean;
  extra?: Record<string, unknown>;
}

export function channelIdForRawSound(rawName: string): string {
  return `al-rabbani-adhan-${rawName}-v1`;
}

let cachedChannelInfo: ActiveChannelInfo = {
  adhanChannelId: ADHAN_CHANNEL_ID,
  soundFile: 'adhan_almulla.mp3',
  soundTitle: 'الملا',
  soundMode: 'adhan',
};

let syncQueue: Promise<unknown> = Promise.resolve();

function enqueueSync<T>(task: () => Promise<T>): Promise<T> {
  const next = syncQueue.catch(() => undefined).then(task);
  syncQueue = next.catch(() => undefined);
  return next;
}

export function notifyNativePrefsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
  }
}

export function getActiveAdhanChannelInfo(): ActiveChannelInfo {
  return cachedChannelInfo;
}

function isNative(): boolean {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
    && !!(window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
}

async function loadPlugin() {
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

function loadTrackedIds(storageKey: string): number[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

function saveTrackedIds(storageKey: string, ids: number[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch { /* ignore */ }
}

function prayerNameFromKey(key: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'): PrayerName {
  switch (key) {
    case 'Fajr': return 'الفجر';
    case 'Dhuhr': return 'الظهر';
    case 'Asr': return 'العصر';
    case 'Maghrib': return 'المغرب';
    case 'Isha': return 'العشاء';
  }
}

/**
 * Pure builder for main prayer Adhan alarms dispatched via native AlarmManager -> AdhanPlaybackService.
 * Only ordinary Adhan MP3 voices are resolved (Eid Takbeerat is strictly excluded).
 */
export function buildNativeAdhanAlarmInputs(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
  defaultAdhanId?: string;
}): NativeAdhanAlarmInput[] {
  const { prefs, location } = opts;
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.prayer === false) {
    return [];
  }

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const days = Math.max(7, Math.min(14, opts.days ?? 10));
  const method = opts.method ?? mapAlAdhanMethod(location.method);
  const madhab = opts.madhab ?? mapAlAdhanMadhab(location.school);
  const fallbackAdhanId = opts.defaultAdhanId ?? getSelectedDefaultAdhanId();

  const schedule = computePrayerSchedule(
    { latitude: location.latitude, longitude: location.longitude },
    now,
    days,
    method,
    madhab,
    {
      fajr: prefs.prayer_settings?.['الفجر']?.adjust_minutes,
      dhuhr: prefs.prayer_settings?.['الظهر']?.adjust_minutes,
      asr: prefs.prayer_settings?.['العصر']?.adjust_minutes,
      maghrib: prefs.prayer_settings?.['المغرب']?.adjust_minutes,
      isha: prefs.prayer_settings?.['العشاء']?.adjust_minutes,
    },
  );

  const alarms: NativeAdhanAlarmInput[] = [];
  for (const item of schedule) {
    const prayerName = prayerNameFromKey(item.prayer);
    const setting = prefs.prayer_settings?.[prayerName];
    if (!setting?.enabled) continue;
    if (setting.channel === 'in_app') continue;
    const adhanType = setting.adhan_type ?? 'full';
    if (adhanType === 'silent') continue;

    if (item.at.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, item.at)) {
      const adhan = resolvePrayerAdhan(setting.sound_id, fallbackAdhanId);
      alarms.push({
        id: prayerId(item.date, item.prayer),
        triggerAtMs: item.at.getTime(),
        title: `حان وقت صلاة ${prayerNameAr(item.prayer)}`,
        body: `وقت ${prayerNameAr(item.prayer)}: ${item.hhmm} · ${adhan.name}`,
        rawSound: adhan.rawName,
        soundTitle: adhan.name,
        adhanType: adhanType === 'short' ? 'short' : 'full',
        prayerKey: `${item.date}:${item.prayer}`,
      });
    }
  }

  alarms.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
  return alarms.slice(0, MAX_PRAYER_ALARMS);
}

/**
 * Pure builder for before/after prayer reminder notifications scheduled through @capacitor/local-notifications.
 */
export function buildNativeBeforeAfterPayloads(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
  generalChannelId?: string;
  exactAlarm?: boolean;
}): NativeNotificationPayload[] {
  const { prefs, location } = opts;
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.prayer === false) {
    return [];
  }

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const days = Math.max(7, Math.min(14, opts.days ?? 10));
  const method = opts.method ?? mapAlAdhanMethod(location.method);
  const madhab = opts.madhab ?? mapAlAdhanMadhab(location.school);
  const generalChannelId = opts.generalChannelId ?? GENERAL_CHANNEL_ID;
  const isExact = opts.exactAlarm !== false;

  const schedule = computePrayerSchedule(
    { latitude: location.latitude, longitude: location.longitude },
    now,
    days,
    method,
    madhab,
    {
      fajr: prefs.prayer_settings?.['الفجر']?.adjust_minutes,
      dhuhr: prefs.prayer_settings?.['الظهر']?.adjust_minutes,
      asr: prefs.prayer_settings?.['العصر']?.adjust_minutes,
      maghrib: prefs.prayer_settings?.['المغرب']?.adjust_minutes,
      isha: prefs.prayer_settings?.['العشاء']?.adjust_minutes,
    },
  );

  const notifications: NativeNotificationPayload[] = [];
  for (const item of schedule) {
    const prayerName = prayerNameFromKey(item.prayer);
    const setting = prefs.prayer_settings?.[prayerName];
    if (!setting?.enabled) continue;
    if (setting.channel === 'in_app') continue;
    const adhanType = setting.adhan_type ?? 'full';
    if (adhanType === 'silent') continue;

    const before = setting.remind_before_minutes ?? 0;
    if (before > 0) {
      const beforeAt = new Date(item.at.getTime() - before * 60000);
      if (beforeAt.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, beforeAt)) {
        notifications.push({
          id: prayerId(item.date, `${item.prayer}-before`),
          title: `تذكير: ${prayerNameAr(item.prayer)} بعد ${before} دقيقة`,
          body: 'استعد للصلاة.',
          schedule: { at: beforeAt, allowWhileIdle: true },
          channelId: generalChannelId,
          foreground: true,
          isExactNotification: isExact,
          extra: { rabbaniKind: 'prayer', prayer: item.prayer, date: item.date, eventType: 'before' },
        });
      }
    }

    const after = setting.remind_after_minutes ?? 0;
    if (after > 0) {
      const afterAt = new Date(item.at.getTime() + after * 60000);
      if (afterAt.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, afterAt)) {
        notifications.push({
          id: prayerId(item.date, `${item.prayer}-after`),
          title: `بعد أذان ${prayerNameAr(item.prayer)} · ${after} دقيقة`,
          body: 'اتبع الصلاة بالذكر والاستغفار.',
          schedule: { at: afterAt, allowWhileIdle: true },
          channelId: generalChannelId,
          foreground: true,
          isExactNotification: isExact,
          extra: { rabbaniKind: 'prayer', prayer: item.prayer, date: item.date, eventType: 'after' },
        });
      }
    }
  }

  notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return notifications.slice(0, MAX_PRAYER_ALARMS);
}

/**
 * Unified pure builder for all prayer-related notification payloads (at + before + after).
 */
export function buildNativePrayerPayloads(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
  adhanChannelId?: string;
  generalChannelId?: string;
  exactAlarm?: boolean;
  defaultAdhanId?: string;
}): NativeNotificationPayload[] {
  const isExact = opts.exactAlarm !== false;
  const fallbackAdhanId = opts.defaultAdhanId ?? getSelectedDefaultAdhanId();
  const defaultAdhan = resolvePrayerAdhan(undefined, fallbackAdhanId);
  const atAlarms = buildNativeAdhanAlarmInputs({ ...opts, defaultAdhanId: fallbackAdhanId });
  const beforeAfter = buildNativeBeforeAfterPayloads(opts);

  const atPayloads: NativeNotificationPayload[] = atAlarms.map((alarm) => {
    const [, prayer] = alarm.prayerKey.split(':') as [string, 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'];
    const date = alarm.prayerKey.split(':')[0] ?? '';
    return {
      id: alarm.id,
      title: alarm.title,
      body: alarm.body,
      schedule: { at: new Date(alarm.triggerAtMs), allowWhileIdle: true },
      channelId: opts.adhanChannelId ?? channelIdForRawSound(alarm.rawSound || defaultAdhan.rawName),
      foreground: true,
      isExactNotification: isExact,
      extra: {
        rabbaniKind: 'prayer',
        prayer,
        date,
        eventType: 'at',
        rawSound: alarm.rawSound,
        soundTitle: alarm.soundTitle,
      },
    };
  });

  const combined = [...atPayloads, ...beforeAfter];
  combined.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return combined.slice(0, MAX_PRAYER_ALARMS);
}

/**
 * Pure builder for personal reminder notification payloads on Android.
 */
export function buildNativeReminderPayloads(
  reminders: readonly Reminder[],
  prefs: NotificationPreference,
  now = new Date(),
  generalChannelId = GENERAL_CHANNEL_ID,
  exactAlarm = true,
): NativeNotificationPayload[] {
  if (!prefs.global_enabled || prefs.dnd_enabled) {
    return [];
  }

  const nowMs = now.getTime();
  const payloads: NativeNotificationPayload[] = [];

  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    if (!isReminderAllowed(reminder, prefs, now)) continue;
    const channelPref = prefs.reminder_settings?.default_channel ?? 'both';
    if (channelPref === 'in_app') continue;

    const snoozeAt = reminder.snooze_until ? new Date(reminder.snooze_until) : null;
    if (snoozeAt && !Number.isNaN(snoozeAt.getTime()) && snoozeAt.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, snoozeAt)) {
      payloads.push({
        id: prayerId('rem-snooze', `${reminder.id}:${snoozeAt.toISOString()}`),
        title: reminder.title,
        body: reminder.description || 'تذكير مؤجل',
        schedule: { at: snoozeAt, allowWhileIdle: true },
        channelId: generalChannelId,
        foreground: true,
        isExactNotification: exactAlarm,
        extra: { rabbaniKind: 'reminder', reminderId: reminder.id },
      });
    }

    const occurrences = upcomingOccurrences(reminder, now, 5);
    for (const at of occurrences) {
      if (at.getTime() <= nowMs + 1000) continue;
      if (isQuietHoursActive(prefs, at)) continue;
      payloads.push({
        id: prayerId('rem', `${reminder.id}:${at.toISOString()}`),
        title: reminder.title,
        body: reminder.description || 'تذكير مخصص',
        schedule: { at, allowWhileIdle: true },
        channelId: generalChannelId,
        foreground: true,
        isExactNotification: exactAlarm,
        extra: { rabbaniKind: 'reminder', reminderId: reminder.id },
      });
    }
  }

  payloads.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return payloads.slice(0, MAX_REMINDER_ALARMS);
}

export async function ensureChannels(): Promise<ActiveChannelInfo> {
  const defaultAdhan = resolvePrayerAdhan(undefined, getSelectedDefaultAdhanId());
  if (!isNative()) {
    cachedChannelInfo = {
      adhanChannelId: channelIdForRawSound(defaultAdhan.rawName),
      soundFile: defaultAdhan.fileName,
      soundTitle: defaultAdhan.name,
      soundMode: 'adhan',
    };
    return cachedChannelInfo;
  }

  const [env, nativeChannelId, LN] = await Promise.all([
    getAndroidEnvironmentStatus(),
    ensureNativeAdhanChannel(defaultAdhan.rawName, defaultAdhan.name),
    loadPlugin(),
  ]);

  if (LN) {
    try {
      const listed = await LN.listChannels();
      const existingChannels = (listed.channels ?? []) as Array<{ id: string }>;
      const hasGeneral = existingChannels.some((c) => c.id === GENERAL_CHANNEL_ID);
      if (!hasGeneral) {
        await LN.createChannel({
          id: GENERAL_CHANNEL_ID,
          name: 'تنبيهات عامة',
          description: 'تذكيرات وتنبيهات عامة',
          importance: 3,
          visibility: 1,
          vibration: true,
        });
      }
    } catch { /* ignore */ }
  }

  const hasAdhan = env?.hasAdhanRawSound ?? true;
  cachedChannelInfo = {
    adhanChannelId: nativeChannelId ?? channelIdForRawSound(defaultAdhan.rawName),
    soundFile: defaultAdhan.fileName,
    soundTitle: defaultAdhan.name,
    soundMode: hasAdhan ? 'adhan' : 'default',
  };
  return cachedChannelInfo;
}

export async function checkPermissions(): Promise<{ display: string; exact: string }> {
  if (!isNative()) return { display: 'unsupported', exact: 'unsupported' };
  const LN = await loadPlugin();
  if (!LN) return { display: 'unsupported', exact: 'unsupported' };
  let display = 'prompt';
  let exact = 'unsupported';
  try {
    const p = await LN.checkPermissions();
    display = p.display;
  } catch { /* ignore */ }
  try {
    const e = await LN.checkExactNotificationSetting();
    exact = e.exact_alarm;
  } catch { /* ignore */ }
  return { display, exact };
}

export async function requestPermissions(): Promise<{ display: string; exact: string }> {
  if (!isNative()) return { display: 'unsupported', exact: 'unsupported' };
  const LN = await loadPlugin();
  if (!LN) return { display: 'unsupported', exact: 'unsupported' };
  try {
    const p = await LN.requestPermissions();
    const display = (p as { display?: string }).display ?? 'prompt';
    let exact = 'unsupported';
    try {
      const e = await LN.checkExactNotificationSetting();
      exact = e.exact_alarm;
      if (display === 'granted' && exact !== 'granted') {
        try { await LN.changeExactNotificationSetting(); } catch { /* ignore */ }
        const e2 = await LN.checkExactNotificationSetting();
        exact = e2.exact_alarm;
      }
    } catch { /* ignore */ }
    return { display, exact };
  } catch {
    return { display: 'denied', exact: 'denied' };
  }
}

async function cancelScopedNotifications(
  LN: NonNullable<Awaited<ReturnType<typeof loadPlugin>>>,
  kind: 'prayer' | 'reminder',
  storageKey: string,
): Promise<number> {
  const tracked = new Set(loadTrackedIds(storageKey));
  try {
    const pending = await LN.getPending();
    for (const n of pending.notifications) {
      const extra = n.extra as { rabbaniKind?: string } | undefined;
      if (extra?.rabbaniKind === kind) {
        tracked.add(n.id);
      } else if (kind === 'prayer' && !extra?.rabbaniKind) {
        tracked.add(n.id);
      }
    }
  } catch { /* ignore */ }

  const ids = [...tracked];
  if (ids.length > 0) {
    try {
      await LN.cancel({ notifications: ids.map((id) => ({ id })) });
    } catch { /* ignore */ }
  }
  saveTrackedIds(storageKey, []);
  return ids.length;
}

export async function schedulePrayerNotifications(opts: NativeScheduleOptions): Promise<NativeScheduleResult> {
  return enqueueSync(async () => {
    if (!isNative()) {
      return {
        scheduled: 0,
        cancelled: 0,
        permission: 'unsupported',
        exactAlarm: 'unsupported',
        warning: 'المنبهات الأصلية غير متاحة (ويب).',
      };
    }
    const LN = await loadPlugin();
    if (!LN) {
      return {
        scheduled: 0,
        cancelled: 0,
        permission: 'unsupported',
        exactAlarm: 'unsupported',
        warning: 'إضافة الإشعارات المحلية غير متاحة.',
      };
    }

    const perms = await checkPermissions();
    const channelInfo = await ensureChannels();

    // Always clear both native AlarmManager Adhan alarms and Capacitor pending prayer notifications first.
    const [cancelledNative, cancelledReminders] = await Promise.all([
      cancelNativeAdhanAlarms(),
      cancelScopedNotifications(LN, 'prayer', PRAYER_IDS_STORAGE_KEY),
    ]);
    const cancelled = cancelledNative + cancelledReminders;

    if (perms.display !== 'granted') {
      return {
        scheduled: 0,
        cancelled,
        permission: perms.display as NativeScheduleResult['permission'],
        exactAlarm: perms.exact as NativeScheduleResult['exactAlarm'],
        channelId: channelInfo.adhanChannelId,
        soundMode: channelInfo.soundMode,
        warning: 'إذن الإشعارات غير ممنوح؛ لن تُعرض تنبيهات الأذان حتى تفعيل الإذن.',
      };
    }

    const exactGranted = perms.exact === 'granted' || perms.exact === 'unsupported';
    const adhanInputs = buildNativeAdhanAlarmInputs({
      location: opts.location,
      prefs: opts.prefs,
      days: opts.days,
      method: opts.method,
      madhab: opts.madhab,
      now: opts.now,
    });
    const reminderPayloads = buildNativeBeforeAfterPayloads({
      location: opts.location,
      prefs: opts.prefs,
      days: opts.days,
      method: opts.method,
      madhab: opts.madhab,
      now: opts.now,
      generalChannelId: GENERAL_CHANNEL_ID,
      exactAlarm: exactGranted,
    });

    if (adhanInputs.length === 0 && reminderPayloads.length === 0) {
      return {
        scheduled: 0,
        cancelled,
        permission: perms.display as NativeScheduleResult['permission'],
        exactAlarm: perms.exact as NativeScheduleResult['exactAlarm'],
        channelId: channelInfo.adhanChannelId,
        soundMode: channelInfo.soundMode,
      };
    }

    // Ensure every voice channel used across individual prayers exists on Android 8+.
    const uniqueVoices = new Map<string, string>();
    for (const input of adhanInputs) {
      if (!uniqueVoices.has(input.rawSound)) {
        uniqueVoices.set(input.rawSound, input.soundTitle);
      }
    }
    await Promise.all(
      [...uniqueVoices.entries()].map(([rawSound, soundTitle]) =>
        ensureNativeAdhanChannel(rawSound, soundTitle),
      ),
    );

    let scheduledCount = 0;
    let warning: string | undefined;

    try {
      if (adhanInputs.length > 0) {
        const nativeRes = await scheduleNativeAdhanAlarms(adhanInputs);
        scheduledCount += nativeRes?.scheduled ?? 0;
      }
      if (reminderPayloads.length > 0) {
        const res = await LN.schedule({ notifications: reminderPayloads as never });
        scheduledCount += res.notifications?.length ?? reminderPayloads.length;
        saveTrackedIds(PRAYER_IDS_STORAGE_KEY, reminderPayloads.map((p) => p.id));
        if (res.warning) {
          warning = res.warning.message;
        }
      }
      if (!warning && !exactGranted) {
        warning = 'منبهات الأذان الدقيقة غير مفعلة — تمت الجدولة كمنبه تقريبي وقد يتأخر الأذان قليلًا أو يكتفي بصوت الإشعار عندما يكون التطبيق مغلقًا.';
      }
    } catch (e) {
      warning = e instanceof Error ? e.message : 'فشل الجدولة';
    }

    const latestPerms = await checkPermissions();
    const result: NativeScheduleResult = {
      scheduled: scheduledCount,
      cancelled,
      warning,
      permission: latestPerms.display as NativeScheduleResult['permission'],
      exactAlarm: latestPerms.exact as NativeScheduleResult['exactAlarm'],
      channelId: channelInfo.adhanChannelId,
      soundMode: channelInfo.soundMode,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NATIVE_SCHEDULE_UPDATED_EVENT, { detail: result }));
    }
    return result;
  });
}

export async function scheduleNativePersonalReminders(
  reminders: readonly Reminder[],
  prefs: NotificationPreference,
  now = new Date(),
): Promise<number> {
  return enqueueSync(async () => {
    if (!isNative()) return 0;
    const LN = await loadPlugin();
    if (!LN) return 0;

    const perms = await checkPermissions();
    await ensureChannels();
    await cancelScopedNotifications(LN, 'reminder', REMINDER_IDS_STORAGE_KEY);
    if (perms.display !== 'granted') return 0;

    const exactGranted = perms.exact === 'granted' || perms.exact === 'unsupported';
    const payloads = buildNativeReminderPayloads(reminders, prefs, now, GENERAL_CHANNEL_ID, exactGranted);
    if (payloads.length === 0) return 0;

    try {
      const res = await LN.schedule({ notifications: payloads as never });
      saveTrackedIds(REMINDER_IDS_STORAGE_KEY, payloads.map((p) => p.id));
      return res.notifications?.length ?? payloads.length;
    } catch {
      return 0;
    }
  });
}

export async function cancelAllPrayerNotifications(): Promise<void> {
  await enqueueSync(async () => {
    if (!isNative()) return;
    await cancelNativeAdhanAlarms();
    const LN = await loadPlugin();
    if (LN) {
      await cancelScopedNotifications(LN, 'prayer', PRAYER_IDS_STORAGE_KEY);
    }
  });
}

export async function syncAllNativeNotifications(opts: {
  location?: PrayerLocation;
  prefs: NotificationPreference;
  reminders?: readonly Reminder[];
}): Promise<NativeScheduleResult | null> {
  if (!isNative()) return null;
  let prayerResult: NativeScheduleResult | null = null;
  if (opts.location) {
    prayerResult = await schedulePrayerNotifications({
      location: opts.location,
      prefs: opts.prefs,
      days: 10,
    });
  } else {
    await cancelAllPrayerNotifications();
  }
  if (opts.reminders) {
    await scheduleNativePersonalReminders(opts.reminders, opts.prefs);
  }
  return prayerResult;
}

export function isNativePlatform(): boolean {
  return isNative();
}

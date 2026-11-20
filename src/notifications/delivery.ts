// خدمة توصيل الإشعارات
// منفصلة عن المنطق التجاري؛ تُستدعى من خدمة الجدولة عند الموعد المحدد.
// تدعم المتصفح (إشعارات المتصفح، داخل التطبيق) ومستقبلاً التطبيقات الأصلية عبر محولات المنصة.

import {authClient} from '../auth';
import type {Reminder, NotificationChannel, NotificationCategory} from './types';

let permissionState: NotificationPermission | null = null;

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'denied';
  if (permissionState) return permissionState;
  permissionState = await Notification.requestPermission();
  return permissionState;
}

export function getBrowserPermission(): NotificationPermission | null {
  return permissionState;
}

export function showBrowserNotification(title: string, opts: {body?: string; icon?: string; tag?: string; requireInteraction?: boolean}): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  const notification = new Notification(title, {
    body: opts.body,
    icon: opts.icon,
    tag: opts.tag,
    requireInteraction: opts.requireInteraction ?? false,
    silent: false,
  });
  // Auto-clear browser notification after 30 minutes (user request: stay 30 min then clear).
  // Timer is best-effort; if the tab closes, the OS dismisses it.
  const TTL_MS = 30 * 60 * 1000;
  window.setTimeout(() => { try { notification.close(); } catch {} }, TTL_MS);
  notification.addEventListener?.('close', () => { /* timer will no-op if already closed */ });
}

/** يسجّل إشعارًا ذاتيًا في مركز الإشعارات فقط (بلا صوت أو إشعار نظام). يعيد false عند الفشل. */
export async function recordNotification(kind: string, title: string, body = '', link = ''): Promise<boolean> {
  if (!authClient) return false;
  try {
    const {error} = await authClient.rpc('notify_self', {p_kind: kind, p_title: title.slice(0, 200), p_body: body.slice(0, 2000), p_link: link});
    return !error;
  } catch {
    return false;
  }
}

/**
 * يرسل إشعارًا عبر القنوات المتاحة (داخل التطبيق + متصفح إن أمكن).
 * يُسجّل الحدث في جدول notification_events عبر RPC إن توفّر.
 */
export async function deliverReminder(reminder: Reminder, channel: NotificationChannel = 'both'): Promise<void> {
  const title = reminder.title;
  const body = reminder.description || 'تذكير مخصص';

  // 1. إشعار داخل التطبيق (يظهر في مركز الإشعارات)
  if (channel === 'in_app' || channel === 'both') await recordNotification('reminder', title, body, 'settings');

  // 2. إشعار متصفح (نظامي) إن أذن المستخدم
  if ((channel === 'system' || channel === 'both') && isBrowserNotificationSupported()) {
    const perm = await requestBrowserPermission();
    if (perm === 'granted') {
      showBrowserNotification(title, {body, tag: `reminder:${reminder.id}`, requireInteraction: true});
    }
  }
}

/**
 * يُظهر إشعارًا فوريًا (لأي وحدة) عبر القنوات المتاحة.
 */
export async function deliverNotification(kind: string, title: string, body?: string, link?: string): Promise<void> {
  await recordNotification(kind, title, body ?? '', link ?? '');
  if (isBrowserNotificationSupported()) {
    const perm = await requestBrowserPermission();
    if (perm === 'granted') {
      showBrowserNotification(title, {body: body ?? '', tag: `notification:${kind}:${Date.now()}`});
    }
  }
}

// ---------- إدارة الصوت ----------

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined' || !(window as any).AudioContext && !(window as any).webkitAudioContext) return null;
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  audioCtx = new Ctx();
  return audioCtx;
}

export function resumeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
}

export function playSound(url: string): void {
  const ctx = getAudioContext();
  if (!ctx) {
    // fallback: عنصر صوت بسيط
    const audio = new Audio(url);
    void audio.play().catch(() => {});
    return;
  }
  resumeAudioContext();
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => ctx!.decodeAudioData(buf))
    .then(buffer => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    })
    .catch(() => {
      // fallback إذا فشل الفك
      const audio = new Audio(url);
      void audio.play().catch(() => {});
    });
}

export function stopAllSounds(): void {
  const ctx = getAudioContext();
  if (ctx) ctx.close();
  audioCtx = null;
}

// ---------- تقييم تفضيلات الصوت ----------

export function shouldDeliverNow(channel: NotificationCategory, prefs: Record<string, boolean> | undefined): boolean {
  if (!prefs) return true;
  return prefs[channel] !== false;
}

export function isInQuietHours(prefs: {quiet_hours?: {enabled: boolean; start: string; end: string}} | null, now = new Date()): boolean {
  if (!prefs?.quiet_hours?.enabled) return false;
  const start = prefs.quiet_hours.start;
  const end = prefs.quiet_hours.end;
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

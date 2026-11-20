// مخزن مشترك لتفضيلات الإشعارات والتذكيرات الشخصية.
// الوضع الأول: السحابة (Supabase RPC). الوضع الاحتياطي: التخزين المحلي — يعمل
// بلا حساب/قاعدة بيانات ويُزامَن لاحقًا. نفس الحقول والجداول تخدم تطبيقات
// الجوال المستقبلية دون تغيير نموذج البيانات.

import {authClient} from '../auth';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  type NotificationPreference,
  type Reminder,
} from './types';

const PREFS_CACHE = 'rabbani-notif-prefs-v1';
const REMINDERS_CACHE = 'rabbani-notif-reminders-v1';

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** يدمج المُحفَّظ على الطبقات الافتراضية بشكل آمن (بلا حقول تالفة) */
function mergePrefs(stored: unknown, fallback: NotificationPreference): NotificationPreference {
  const value = (stored ?? {}) as Partial<NotificationPreference>;
  const merged: NotificationPreference = {
    ...fallback,
    ...value,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : fallback.updated_at,
    categories: {...fallback.categories, ...(value.categories ?? {})},
    prayer_settings: {...fallback.prayer_settings, ...(value.prayer_settings ?? {})},
    reminder_settings: {...fallback.reminder_settings, ...(value.reminder_settings ?? {})},
    quiet_hours: {...fallback.quiet_hours, ...(value.quiet_hours ?? {})},
  };
  merged.global_enabled = value.global_enabled !== false;
  merged.dnd_enabled = value.dnd_enabled === true;
  return merged;
}

function loadLocalPrefs(): NotificationPreference {
  try {
    const raw = storage()?.getItem(PREFS_CACHE);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCE;
    return mergePrefs(JSON.parse(raw), DEFAULT_NOTIFICATION_PREFERENCE);
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCE;
  }
}

function sanitizeReminder(value: unknown): Reminder | null {
  const item = value as Partial<Reminder> | null;
  if (!item || typeof item.id !== 'string' || !item.id
    || typeof item.title !== 'string' || !item.title.trim()
    || typeof item.scheduled_at !== 'string' || Number.isNaN(new Date(item.scheduled_at).getTime())) return null;
  return {
    id: item.id,
    user_id: typeof item.user_id === 'string' ? item.user_id : '',
    title: item.title.slice(0, 200),
    description: typeof item.description === 'string' ? item.description.slice(0, 1000) : '',
    scheduled_at: item.scheduled_at,
    recurrence: (item.recurrence ?? 'none') as Reminder['recurrence'],
    recurrence_config: (item.recurrence_config ?? {}) as Reminder['recurrence_config'],
    sound_id: typeof item.sound_id === 'string' ? item.sound_id : undefined,
    category: typeof item.category === 'string' ? item.category.slice(0, 50) : 'custom',
    linked_goal_id: item.linked_goal_id,
    linked_task_id: item.linked_task_id,
    enabled: item.enabled !== false,
    snooze_until: typeof item.snooze_until === 'string' ? item.snooze_until : null,
    created_at: typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
    updated_at: typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
  };
}

function loadLocalReminders(): Reminder[] {
  try {
    const raw = storage()?.getItem(REMINDERS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeReminder).filter((item): item is Reminder => item !== null);
  } catch {
    return [];
  }
}

function saveLocalReminders(list: Reminder[]): void {
  try {
    storage()?.setItem(REMINDERS_CACHE, JSON.stringify(list.slice(0, 200)));
  } catch {/* التخزين قد يكون ممتلئًا؛ التذكيرات تبقى في الذاكرة لهذه الجلسة */}
}

export type PrefsSource = 'cloud' | 'local' | 'unknown';

/** يجلب التفضيلات: سحابة أولًا، وإن تعذَّر فالاحتياطي المحلي */
export async function loadPrefs(): Promise<{prefs: NotificationPreference; source: PrefsSource}> {
  if (authClient) {
    try {
      const {data, error} = await authClient.rpc('get_notification_preferences');
      if (!error && data) {
        const prefs = mergePrefs(typeof data === 'string' ? JSON.parse(data) : data, loadLocalPrefs());
        try {storage()?.setItem(PREFS_CACHE, JSON.stringify(prefs))} catch {}
        return {prefs, source: 'cloud'};
      }
    } catch {/* الوقوع في الاحتياطي */}
  }
  return {prefs: loadLocalPrefs(), source: 'local'};
}

/** يحفظ التفضيلات: محليًا دائمًا، وفي السحابة إن توفّرت (نصيحة المستخدم تنتظر النتيجة فقط للحالة السحابية) */
export async function savePrefs(next: NotificationPreference): Promise<{ok: boolean; source: PrefsSource}> {
  const value: NotificationPreference = {...next, updated_at: new Date().toISOString()};
  try {storage()?.setItem(PREFS_CACHE, JSON.stringify(value))} catch {}
  if (authClient) {
    try {
      const {error} = await authClient.rpc('save_notification_preferences', {
        p_global_enabled: value.global_enabled,
        p_categories: value.categories,
        p_prayer_settings: value.prayer_settings,
        p_reminder_settings: value.reminder_settings,
        p_quiet_hours: value.quiet_hours,
        p_dnd_enabled: value.dnd_enabled,
        p_default_sound_id: value.reminder_settings.default_sound_id ?? null,
        p_default_channel: value.reminder_settings.default_channel,
        p_snooze_minutes: value.reminder_settings.snooze_minutes ?? 10,
      });
      if (!error) return {ok: true, source: 'cloud'};
    } catch {/* الوقوع في الحفظ المحلي */}
  }
  return {ok: true, source: 'local'};
}

/** يجلب التذكيرات: سحابة أولًا (مصفوفة الصفوف أو جدول من RPC)، ثم الاحتياطي المحلي */
export async function loadReminders(): Promise<{reminders: Reminder[]; source: PrefsSource}> {
  if (authClient) {
    try {
      const {data, error} = await authClient.rpc('list_reminders');
      if (!error && Array.isArray(data)) {
        const mapped = data.map((row: unknown) => {
          const item = row as Record<string, unknown>;
          return sanitizeReminder({
            ...item,
            scheduled_at: typeof item.scheduled_at === 'string' ? item.scheduled_at : String(item.scheduled_at ?? ''),
          });
        }).filter((item: Reminder | null): item is Reminder => item !== null);
        saveLocalReminders(mapped);
        return {reminders: mapped, source: 'cloud'};
      }
    } catch {/* الوقوع في الاحتياطي */}
  }
  return {reminders: loadLocalReminders(), source: 'local'};
}

/** ينسخ الكتلة المحدَّثة إلى الذاكرة/المحلي، ثم يحاول المزامنة السحابية عبر دالة المُحدِّثة */
export function storeLocalReminder(next: Reminder[]): Reminder[] {
  saveLocalReminders(next);
  return next;
}

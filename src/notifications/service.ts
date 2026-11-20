// خدمة إدارة الإشعارات والتنبيهات الموحّدة
// المنطق التجاري منفصل عن منصة التوصيل (المتصفح، الجوال المستقبلي).

import {authClient} from '../auth';
import type {
  Reminder, ReminderInput, NotificationPreference, AudioResource, DeviceToken,
  NotificationEvent, NotificationKind
} from './types';
import {DEFAULT_NOTIFICATION_PREFERENCE} from './types';

const EVENT_TABLE = 'notification_events';
const AUDIO_TABLE = 'audio_resources';

// ---------- التذكيرات الشخصية ----------

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const payload: Reminder = {
    ...input,
    id,
    user_id: '', // يُحشَد من الخادم عبر auth.uid()
    created_at: now,
    updated_at: now,
  };
  const {data, error} = await authClient.rpc('create_reminder', {
    p_title: payload.title,
    p_description: payload.description ?? '',
    p_scheduled_at: payload.scheduled_at,
    p_recurrence: payload.recurrence,
    p_recurrence_config: payload.recurrence_config ?? {},
    p_sound_id: payload.sound_id ?? null,
    p_category: payload.category,
    p_linked_goal_id: payload.linked_goal_id ?? null,
    p_linked_task_id: payload.linked_task_id ?? null,
    p_enabled: payload.enabled,
  });
  if (error) throw error;
  return data as unknown as Reminder;
}

export async function updateReminder(id: string, patch: Partial<ReminderInput>): Promise<Reminder> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const rpc: Record<string, unknown> = {p_reminder_id: id};
  if (patch.title !== undefined) rpc.p_title = patch.title;
  if (patch.description !== undefined) rpc.p_description = patch.description ?? '';
  if (patch.scheduled_at !== undefined) rpc.p_scheduled_at = patch.scheduled_at;
  if (patch.recurrence !== undefined) rpc.p_recurrence = patch.recurrence;
  if (patch.recurrence_config !== undefined) rpc.p_recurrence_config = patch.recurrence_config;
  if (patch.sound_id !== undefined) rpc.p_sound_id = patch.sound_id ?? null;
  if (patch.category !== undefined) rpc.p_category = patch.category;
  if (patch.linked_goal_id !== undefined) rpc.p_linked_goal_id = patch.linked_goal_id ?? null;
  if (patch.linked_task_id !== undefined) rpc.p_linked_task_id = patch.linked_task_id ?? null;
  if (patch.enabled !== undefined) rpc.p_enabled = patch.enabled;
  const {data, error} = await authClient.rpc('update_reminder', rpc);
  if (error) throw error;
  return data as unknown as Reminder;
}

export async function deleteReminder(id: string): Promise<void> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {error} = await authClient.rpc('delete_reminder', {p_reminder_id: id});
  if (error) throw error;
}

export async function listReminders(): Promise<Reminder[]> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.rpc('list_reminders');
  if (error) throw error;
  return (data ?? []) as unknown as Reminder[];
}

export async function snoozeReminder(id: string, minutes: number): Promise<Reminder> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.rpc('snooze_reminder', {p_reminder_id: id, p_minutes: minutes});
  if (error) throw error;
  return data as unknown as Reminder;
}

export async function toggleReminder(id: string, enabled: boolean): Promise<void> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {error} = await authClient.rpc('toggle_reminder', {p_reminder_id: id, p_enabled: enabled});
  if (error) throw error;
}

// ---------- تفضيلات الإشعارات ----------

export async function getNotificationPreferences(): Promise<NotificationPreference> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.rpc('get_notification_preferences');
  if (error) throw error;
  return (data ?? DEFAULT_NOTIFICATION_PREFERENCE) as NotificationPreference;
}

export async function saveNotificationPreferences(prefs: Partial<NotificationPreference>): Promise<NotificationPreference> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const current = await getNotificationPreferences();
  const next: NotificationPreference = {
    ...current,
    ...prefs,
    user_id: current.user_id,
    updated_at: new Date().toISOString(),
    categories: {...current.categories, ...prefs.categories},
    prayer_settings: {...current.prayer_settings, ...prefs.prayer_settings},
    reminder_settings: {...current.reminder_settings, ...prefs.reminder_settings},
    quiet_hours: {...current.quiet_hours, ...prefs.quiet_hours},
  };
  const {data, error} = await authClient.rpc('save_notification_preferences', {
    p_global_enabled: next.global_enabled,
    p_categories: next.categories,
    p_prayer_settings: next.prayer_settings,
    p_reminder_settings: next.reminder_settings,
    p_quiet_hours: next.quiet_hours,
    p_dnd_enabled: next.dnd_enabled,
    p_default_sound_id: next.reminder_settings.default_sound_id ?? null,
    p_default_channel: next.reminder_settings.default_channel,
    p_snooze_minutes: next.reminder_settings.snooze_minutes,
  });
  if (error) throw error;
  return (data ?? next) as NotificationPreference;
}

// ---------- مكتبة الأصوات ----------

export async function listAudioResources(): Promise<AudioResource[]> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.from(AUDIO_TABLE).select('*').order('is_default', {ascending: false}).order('title', {ascending: true});
  if (error) throw error;
  return (data ?? []) as unknown as AudioResource[];
}

export async function uploadAudioResource(file: File, title: string): Promise<AudioResource> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  // التحقق من الصيغة والحجم من جهة العميل كتحقق أولي (التحقق النهائي على الخادم)
  const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4'];
  if (!allowed.includes(file.type)) throw new Error('صيغة الصوت غير مدعومة.');
  if (file.size > 10 * 1024 * 1024) throw new Error('حجم الصوت أكبر من المسموح (10 ميغابايت).');
  const fileName = `audio_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const {error: uploadError} = await authClient.storage.from('audio').upload(fileName, file, {cacheControl: '3600'});
  if (uploadError) throw uploadError;
  const {data: urlData} = authClient.storage.from('audio').getPublicUrl(fileName);
  const {data, error} = await authClient.from(AUDIO_TABLE).insert({
    title,
    kind: 'custom',
    url: urlData.publicUrl,
    is_uploaded: true,
    uploader_id: '',
  }).select().single();
  if (error) throw error;
  return data as unknown as AudioResource;
}

// ---------- رموز الأجهزة للمستقبل ----------

export async function registerDeviceToken(token: string, platform: 'web' | 'android' | 'ios'): Promise<DeviceToken> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.rpc('register_device_token', {p_token: token, p_platform: platform});
  if (error) throw error;
  return data as unknown as DeviceToken;
}

export async function unregisterDeviceToken(token: string): Promise<void> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {error} = await authClient.rpc('unregister_device_token', {p_token: token});
  if (error) throw error;
}

// ---------- أحداث الإشعارات (تاريخ التسليم) ----------

export async function listNotificationEvents(limit = 50): Promise<NotificationEvent[]> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.from(EVENT_TABLE).select('*').order('delivered_at', {ascending: false}).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as NotificationEvent[];
}

// ---------- إرسال إشعار فوري (لأي وحدة) ----------

export async function sendNotification(opts: {
  recipient_id?: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
}): Promise<string> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.rpc('send_notification', {
    p_recipient_id: opts.recipient_id ?? null,
    p_kind: opts.kind,
    p_title: opts.title,
    p_body: opts.body ?? '',
    p_link: opts.link ?? '',
  });
  if (error) throw error;
  return data as string;
}

// أنواع بيانات محرك الإشعارات والمنبهات الموحّد
// كل التنبيهات والتذكيرات تمر عبر هذا المحرك بغض النظر عن مصدرها.

export type NotificationKind =
  | 'announcement'
  | 'join_request'
  | 'join_decision'
  | 'course'
  | 'session'
  | 'report'
  | 'system'
  | 'mudarasa'
  | 'share'
  | 'invitation'
  | 'prayer'
  | 'reminder'
  | 'worship'
  | 'goal'
  | 'task';

export type NotificationCategory =
  | 'invitation'
  | 'activity'
  | 'resource'
  | 'system'
  | 'prayer'
  | 'reminder'
  | 'worship'
  | 'goal'
  | 'task';

export type NotificationChannel = 'in_app' | 'system' | 'both';

export type ReminderRecurrence =
  | 'none'
  | 'daily'
  | 'weekday'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom'
  | 'specific_dates';

export type PrayerName = 'الفجر' | 'الظهر' | 'العصر' | 'المغرب' | 'العشاء';

export type PrayerAdhanType = 'full' | 'short' | 'silent';

export type Reminder = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  scheduled_at: string; // ISO timestamp
  recurrence: ReminderRecurrence;
  recurrence_config?: {
    days_of_week?: number[]; // 0-6 for weekly/weekdays
    start_date?: string;
    end_date?: string;
    specific_dates?: string[]; // YYYY-MM-DD
    interval_days?: number; // for custom
  };
  sound_id?: string;
  category: string; // 'prayer' | 'reminder' | 'worship' | 'goal' | 'task' | 'custom'
  linked_goal_id?: string;
  linked_task_id?: string;
  enabled: boolean;
  snooze_until?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReminderInput = Omit<Reminder, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export type NotificationPreference = {
  user_id: string;
  global_enabled: boolean;
  categories: Record<string, boolean>; // category -> enabled
  prayer_settings: Record<PrayerName, {
    enabled: boolean;
    adhan_type: PrayerAdhanType;
    remind_before_minutes?: number;
    remind_after_minutes?: number;
    adjust_minutes?: number;
    sound_id?: string;
    channel: NotificationChannel;
  }>;
  reminder_settings: {
    default_sound_id?: string;
    default_channel: NotificationChannel;
    snooze_minutes: number;
  };
  quiet_hours: {
    enabled: boolean;
    start: string; // HH:MM
    end: string; // HH:MM
  };
  dnd_enabled: boolean;
  updated_at: string;
};

export type AudioResource = {
  id: string;
  title: string;
  kind: 'system' | 'tone' | 'adhan' | 'custom';
  url: string;
  duration?: number;
  is_default: boolean;
  is_uploaded: boolean;
  uploader_id?: string;
  created_at: string;
};

export type DeviceToken = {
  id: string;
  user_id: string;
  token: string;
  platform: 'web' | 'android' | 'ios';
  created_at: string;
  last_used_at: string;
};

export type NotificationEvent = {
  id: string;
  notification_id: string;
  user_id: string;
  delivered_at: string;
  channel: NotificationChannel;
  status: 'delivered' | 'failed' | 'pending';
  error?: string;
};

//helpers

export const PRAYER_NAMES: PrayerName[] = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];

export const RECURRENCE_LABELS: Record<ReminderRecurrence, string> = {
  none: 'مرة واحدة',
  daily: 'يوميًا',
  weekday: 'كل يوم أحد',
  weekdays: 'أيام الأسبوع',
  weekly: 'أسبوعيًا',
  monthly: 'شهريًا',
  custom: 'مخصص',
  specific_dates: 'تواريخ محددة',
};

export const PRAYER_ADHAN_LABELS: Record<PrayerAdhanType, string> = {
  full: 'الأذان الكامل',
  short: 'الأذان المختصر',
  silent: 'صامت',
};

export function prayerKey(prayer: PrayerName): string {
  return prayer;
}

export function isQuietHoursActive(settings: NotificationPreference | null, now = new Date()): boolean {
  if (!settings || !settings.quiet_hours?.enabled) return false;
  const start = settings.quiet_hours.start;
  const end = settings.quiet_hours.end;
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (start <= end) {
    return current >= start && current <= end;
  }
  // crosses midnight
  return current >= start || current <= end;
}

export function categoryColor(category: NotificationCategory): {bg: string; text: string} {
  const map: Record<NotificationCategory, {bg: string; text: string}> = {
    invitation: {bg: 'rgba(138,90,19,.12)', text: '#8a5a13'},
    activity: {bg: 'rgba(31,92,74,.1)', text: '#1f5c4a'},
    resource: {bg: 'rgba(43,84,148,.12)', text: '#2b5494'},
    system: {bg: 'rgba(90,88,80,.12)', text: '#5a5850'},
    prayer: {bg: 'rgba(36,70,56,.12)', text: '#244638'},
    reminder: {bg: 'rgba(120,97,55,.12)', text: '#786137'},
    worship: {bg: 'rgba(49,94,73,.12)', text: '#315e49'},
    goal: {bg: 'rgba(126,91,140,.12)', text: '#7e5b8c'},
    task: {bg: 'rgba(36,70,56,.12)', text: '#244638'},
  };
  return map[category] ?? map.system;
}

export const DEFAULT_PRAYER_PREFERENCES: Record<PrayerName, {
  enabled: boolean;
  adhan_type: PrayerAdhanType;
  remind_before_minutes?: number;
  remind_after_minutes?: number;
  adjust_minutes?: number;
  sound_id?: string;
  channel: NotificationChannel;
}> = {
  الفجر: {enabled: true, adhan_type: 'full', channel: 'both'},
  الظهر: {enabled: true, adhan_type: 'short', channel: 'in_app'},
  العصر: {enabled: true, adhan_type: 'short', channel: 'in_app'},
  المغرب: {enabled: true, adhan_type: 'full', remind_after_minutes: 0, channel: 'both'},
  العشاء: {enabled: true, adhan_type: 'full', remind_before_minutes: 10, channel: 'both'},
};

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  user_id: '',
  global_enabled: true,
  categories: {
    invitation: true,
    activity: true,
    resource: true,
    system: true,
    prayer: true,
    reminder: true,
    worship: true,
    goal: true,
    task: true,
  },
  prayer_settings: DEFAULT_PRAYER_PREFERENCES,
  reminder_settings: {default_channel: 'both', snooze_minutes: 10},
  quiet_hours: {enabled: false, start: '22:00', end: '06:00'},
  dnd_enabled: false,
  updated_at: new Date().toISOString(),
};

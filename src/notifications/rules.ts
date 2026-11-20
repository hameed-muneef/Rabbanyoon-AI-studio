// قواعد السماح بتسليم التذكيرات الشخصية (نطاق عمل خالص): الإيقاف العام، عدم الإزعاج، الفئة، ساعات الهدوء.

import {isQuietHoursActive, type NotificationPreference, type Reminder} from './types';

export function isReminderAllowed(
  reminder: Pick<Reminder, 'category'>,
  prefs: NotificationPreference,
  now = new Date(),
): boolean {
  if (!prefs.global_enabled || prefs.dnd_enabled) return false;
  if (prefs.categories?.[reminder.category] === false) return false;
  return !isQuietHoursActive(prefs, now);
}

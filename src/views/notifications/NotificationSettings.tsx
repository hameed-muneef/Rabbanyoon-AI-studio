// صفحة «الإشعارات والتنبيهات»: تجمع أوقات الصلاة والمنبهات الشخصية ومكتبة الأصوات وحالة الإذن.

import {useEffect, useRef, useState} from 'react';
import {Bell} from 'lucide-react';
import {getBrowserPermission, isBrowserNotificationSupported, requestBrowserPermission} from '../../notifications/delivery';
import GeneralNotifications from './GeneralNotifications';
import PrayerNotifications from './PrayerNotifications';
import RemindersPanel from './RemindersPanel';
import SoundPanel from './SoundPanel';
import type {PrayerLocation} from '../../prayer-location';

const PERMISSION_TEXT: Record<string, string> = {
  granted: 'مسموح: تصلك إشعارات النظام ما دام المتصفح يعمل.',
  denied: 'محظور: فعّل الإشعارات لهذا الموقع من إعدادات المتصفح (رمز القفل بجوار العنوان) ثم أعد تحميل الصفحة.',
  default: 'لم يُطلب الإذن بعد. اضغط الزر أدناه لتفعيل إشعارات النظام.',
};

function PermissionStatus() {
  const [permission, setPermission] = useState(getBrowserPermission());
  if (!isBrowserNotificationSupported()) return <p className="muted">هذا المتصفح لا يدعم إشعارات النظام؛ ستظهر التنبيهات داخل المنصة فقط.</p>;
  return (
    <div>
      <p role="status">{PERMISSION_TEXT[permission ?? 'default']}</p>
      {permission !== 'granted' && permission !== 'denied' && (
        <button type="button" className="primary" onClick={() => void requestBrowserPermission().then(setPermission)}>تفعيل إشعارات النظام</button>
      )}
      <p className="muted small">المتصفحات لا تضمن التنبيه في الخلفية أو والصفحة مغلقة؛ يصبح ذلك ممكنًا بدقة أعلى في تطبيق الجوال لاحقًا.</p>
    </div>
  );
}

type Props = {
  notify: (message: string) => void;
  goals?: {id: string; title: string}[];
  prayerLocation?: PrayerLocation;
  onPrayerLocation?: (location?: PrayerLocation) => void;
};

// وجهات داخلية: بطاقات لوحة اليوم (مواقيت الصلاة / التذكيرات) تضع المفتاح قبل التنقل إلى الإعدادات.
export const OPEN_SECTION_KEY = 'rabbani-open-notif-section';
type OpenSection = 'prayer' | 'reminders';
export function requestNotificationSection(section: OpenSection): void {
  try {sessionStorage.setItem(OPEN_SECTION_KEY, section)} catch {/* تجاهل */}
}
function consumeOpenSection(): OpenSection | null {
  try {
    const value = sessionStorage.getItem(OPEN_SECTION_KEY) as OpenSection | null;
    if (value) sessionStorage.removeItem(OPEN_SECTION_KEY);
    return value;
  } catch {return null}
}

export default function NotificationSettings({notify, goals, prayerLocation, onPrayerLocation}: Props) {
  const target = useState(consumeOpenSection)[0];
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {if (target) ref.current?.scrollIntoView({behavior: 'smooth', block: 'start'})}, [target]);
  return (
    <section ref={ref} className="panel notif-settings" aria-labelledby="notif-settings-title">
      <h3 id="notif-settings-title"><Bell size={18}/> الإشعارات والتنبيهات</h3>
      <details open={target ? undefined : true}><summary>أذونات المتصفح</summary><PermissionStatus/></details>
      <details><summary>الإعدادات العامة وعدم الإزعاج</summary><GeneralNotifications notify={notify}/></details>
      <details open={target === 'prayer' || undefined}><summary>أوقات الصلاة والأذان</summary><PrayerNotifications notify={notify} prayerLocation={prayerLocation} onPrayerLocation={onPrayerLocation}/></details>
      <details open={target === 'reminders' || undefined}><summary>المنبهات الشخصية</summary><RemindersPanel notify={notify} goals={goals}/></details>
      <details><summary>مكتبة الأصوات</summary><SoundPanel notify={notify}/></details>
    </section>
  );
}

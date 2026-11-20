import {useEffect, useState} from 'react';
import {BellRing, Clock3, ChevronLeft} from 'lucide-react';
import usePrayerTimes from '../usePrayerTimes';
import {sanitizePrayerLocation, type PrayerLocation} from '../prayer-location';
import {loadReminders} from '../notifications/prefs-store';
import {formatRemaining, nextPrayer, upcomingReminders} from '../notifications/upcoming';
import {requestNotificationSection} from './notifications/NotificationSettings';
import type {Reminder} from '../notifications/types';
import type {View} from '../app-state';

const timeFmt = new Intl.DateTimeFormat('ar-EG', {hour: 'numeric', minute: '2-digit'});
const dayFmt = new Intl.DateTimeFormat('ar-EG', {weekday: 'short', day: 'numeric', month: 'short'});

export default function HomeDashboard({prayers, prayerLocation, navigate}: {prayers: Record<string, string>; prayerLocation?: PrayerLocation; navigate: (view: View) => void}) {
  const located = usePrayerTimes(Boolean(prayerLocation), sanitizePrayerLocation(prayerLocation));
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    loadReminders().then(r => {if (active) setReminders(r.reminders)}).catch(() => {if (active) setReminders([])});
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => {active = false; window.clearInterval(timer)};
  }, []);

  const next = nextPrayer({...prayers, ...located.prayers}, now);
  const upcoming = reminders ? upcomingReminders(reminders, now, 3) : [];

  return <section className="home-dashboard" aria-label="القادم اليوم">
    <button className="home-next-card" onClick={() => {requestNotificationSection('prayer'); navigate('settings')}}>
      <span className="home-next-icon"><Clock3 size={22}/></span>
      <span className="home-next-body">
        <small>الصلاة القادمة</small>
        {next ? <><strong>{next.prayer} · {timeFmt.format(next.at)}</strong><small>{next.tomorrow ? 'غدًا' : formatRemaining(next.at.getTime() - now.getTime())}</small></>
          : <><strong>لم تُضبط مواقيت الصلاة</strong><small>اختر مدينتك من الإعدادات</small></>}
      </span>
      <ChevronLeft size={18}/>
    </button>
    <button className="home-next-card" onClick={() => {requestNotificationSection('reminders'); navigate('settings')}}>
      <span className="home-next-icon"><BellRing size={22}/></span>
      <span className="home-next-body">
        <small>التذكيرات القادمة</small>
        {reminders === null ? <strong>جارٍ التحميل…</strong>
          : upcoming.length === 0 ? <><strong>لا تذكيرات قادمة</strong><small>أضف تذكيرًا من الإعدادات</small></>
          : <ul>{upcoming.map(({reminder, at}) => <li key={reminder.id}><strong>{reminder.title}</strong><small>{dayFmt.format(at)} · {timeFmt.format(at)}</small></li>)}</ul>}
      </span>
      <ChevronLeft size={18}/>
    </button>
  </section>;
}

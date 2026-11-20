// الإعدادات العامة للإشعارات: التفعيل العام، عدم الإزعاج، ساعات الهدوء، الفئات، والقناة والصوت الافتراضيان.

import {useEffect, useState} from 'react';
import {loadPrefs, savePrefs} from '../../notifications/prefs-store';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationChannel, type NotificationPreference} from '../../notifications/types';
import {channelLabel, SoundSelectField} from './SoundPanel';
import {NOTIFICATIONS_CHANGED_EVENT, notifyNativePrefsChanged} from '../../notifications/native-prayer-scheduler';

const CATEGORY_LABELS: Record<string, string> = {
  prayer: 'الصلاة والأذان',
  reminder: 'المنبهات والتذكيرات',
  worship: 'العبادات والأذكار',
  goal: 'الأهداف',
  task: 'المهام',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const GENERAL_KEYS = ['global_enabled', 'dnd_enabled', 'quiet_hours', 'categories', 'reminder_settings'] as const;

export default function GeneralNotifications({notify}: {notify: (message: string) => void}) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = () => {
      void loadPrefs().then(({prefs: loaded}) => {
        if (!active) return;
        setPrefs(loaded);
        setLoading(false);
      });
    };
    sync();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    };
  }, []);

  const change = (patch: Partial<NotificationPreference>) => {
    setPrefs(old => ({...old, ...patch}));
    setDirty(true);
  };

  const save = async () => {
    if (prefs.quiet_hours.enabled && (!TIME.test(prefs.quiet_hours.start) || !TIME.test(prefs.quiet_hours.end))) {
      notify('أدخل وقت بداية ونهاية صحيحين لساعات الهدوء');
      return;
    }
    setSaving(true);
    try {
      // يدمج حقول هذه اللوحة فقط في أحدث نسخة محفوظة كي لا يمحو إعدادات الصلاة
      const {prefs: fresh} = await loadPrefs();
      const merged = {...fresh};
      for (const key of GENERAL_KEYS) (merged as Record<string, unknown>)[key] = prefs[key];
      const result = await savePrefs(merged);
      notifyNativePrefsChanged();
      setDirty(false);
      notify(result.source === 'cloud' ? 'حُفظت الإعدادات العامة في حسابك' : 'حُفظت الإعدادات العامة على هذا الجهاز');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="muted" role="status">جارٍ تحميل الإعدادات…</p>;
  const quiet = prefs.quiet_hours;

  return (
    <div className="notif-general-panel">
      <label className="notif-switch">
        <input type="checkbox" checked={prefs.global_enabled} onChange={event => change({global_enabled: event.target.checked})}/>
        تفعيل كل الإشعارات والمنبهات
      </label>
      <fieldset disabled={!prefs.global_enabled}>
        <label className="notif-switch">
          <input type="checkbox" checked={prefs.dnd_enabled} onChange={event => change({dnd_enabled: event.target.checked})}/>
          عدم الإزعاج (يكتم الأذان والتذكيرات حتى تعطّله)
        </label>
        <label className="notif-switch">
          <input type="checkbox" checked={quiet.enabled} onChange={event => change({quiet_hours: {...quiet, enabled: event.target.checked}})}/>
          ساعات الهدوء (لا إشعارات ولا أصوات خلالها)
        </label>
        {quiet.enabled && (
          <div className="form-grid">
            <label>من<input type="time" dir="ltr" value={quiet.start} onChange={event => change({quiet_hours: {...quiet, start: event.target.value}})}/></label>
            <label>إلى<input type="time" dir="ltr" value={quiet.end} onChange={event => change({quiet_hours: {...quiet, end: event.target.value}})}/></label>
          </div>
        )}
        <fieldset className="notif-categories">
          <legend>الفئات المفعّلة</legend>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <label key={key} className="notif-switch">
              <input type="checkbox" checked={prefs.categories?.[key] !== false} onChange={event => change({categories: {...prefs.categories, [key]: event.target.checked}})}/>
              {label}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label>قناة التذكيرات الافتراضية
            <select value={prefs.reminder_settings.default_channel} onChange={event => change({reminder_settings: {...prefs.reminder_settings, default_channel: event.target.value as NotificationChannel}})}>
              {(['in_app', 'system', 'both'] as NotificationChannel[]).map(key => <option key={key} value={key}>{channelLabel(key)}</option>)}
            </select>
          </label>
          <label>صوت التذكيرات الافتراضي
            <SoundSelectField value={prefs.reminder_settings.default_sound_id} onChange={sound => change({reminder_settings: {...prefs.reminder_settings, default_sound_id: sound}})}/>
          </label>
          <label>مدة الغفوة (دقائق)
            <input type="number" inputMode="numeric" min={1} max={120} value={prefs.reminder_settings.snooze_minutes}
              onChange={event => change({reminder_settings: {...prefs.reminder_settings, snooze_minutes: Math.max(1, Math.min(120, Math.round(Number(event.target.value)) || 10))}})}/>
          </label>
        </div>
      </fieldset>
      <div className="notif-form-actions">
        <button type="button" className="primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات العامة'}</button>
      </div>
    </div>
  );
}

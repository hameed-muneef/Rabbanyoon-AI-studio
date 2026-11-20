// إعداد إشعارات الصلاة لكل صلاة على حدة: التفعيل، نوع الأذان، القناة، الصوت، التذكير قبل/بعد، والتعديل اليدوي.

import {useEffect, useState} from 'react';
import {loadPrefs, savePrefs} from '../../notifications/prefs-store';
import {clampAdjustment, MAX_PRAYER_ADJUSTMENT} from '../../notifications/prayer-planner';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  DEFAULT_PRAYER_PREFERENCES,
  PRAYER_ADHAN_LABELS,
  PRAYER_NAMES,
  type NotificationChannel,
  type NotificationPreference,
  type PrayerAdhanType,
  type PrayerName,
} from '../../notifications/types';
import {channelLabel, SoundSelectField} from './SoundPanel';
import PrayerLocationPicker from '../../PrayerLocationPicker';
import {sanitizePrayerLocation, type PrayerLocation} from '../../prayer-location';
import NativeAdhanPanel from './NativeAdhanPanel';
import {NOTIFICATIONS_CHANGED_EVENT, notifyNativePrefsChanged} from '../../notifications/native-prayer-scheduler';

type PrayerSetting = NotificationPreference['prayer_settings'][PrayerName];

const MAX_REMINDER_MINUTES = 120;

function boundedMinutes(value: string, max: number): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
}

type Props = {notify: (message: string) => void; prayerLocation?: PrayerLocation; onPrayerLocation?: (location?: PrayerLocation) => void};

export default function PrayerNotifications({notify, prayerLocation, onPrayerLocation}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [loading, setLoading] = useState(true);
  const [savingPrayer, setSavingPrayer] = useState<PrayerName | null>(null);
  // الحفظ لكل صلاة على حدة: تعديل صلاة لا يلمس إعدادات باقي الصلوات.
  const [dirtyPrayers, setDirtyPrayers] = useState<ReadonlySet<PrayerName>>(new Set());

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

  const update = (prayer: PrayerName, patch: Partial<PrayerSetting>) => {
    setPrefs(old => ({
      ...old,
      prayer_settings: {
        ...old.prayer_settings,
        [prayer]: {...DEFAULT_PRAYER_PREFERENCES[prayer], ...old.prayer_settings[prayer], ...patch},
      },
    }));
    setDirtyPrayers(old => new Set(old).add(prayer));
  };

  // يحفظ إعدادات صلاة واحدة فقط مدمجًا معها أحدث نسخة محفوظة لباقي الإعدادات.
  const savePrayer = async (prayer: PrayerName) => {
    setSavingPrayer(prayer);
    try {
      const setting: PrayerSetting = {...DEFAULT_PRAYER_PREFERENCES[prayer], ...prefs.prayer_settings[prayer]};
      const {prefs: fresh} = await loadPrefs();
      const result = await savePrefs({...fresh, prayer_settings: {...fresh.prayer_settings, [prayer]: setting}});
      notifyNativePrefsChanged();
      setDirtyPrayers(old => {
        const next = new Set(old);
        next.delete(prayer);
        return next;
      });
      notify(result.source === 'cloud' ? `حُفظت إعدادات صلاة ${prayer} في حسابك` : `حُفظت إعدادات صلاة ${prayer} على هذا الجهاز`);
    } finally {
      setSavingPrayer(null);
    }
  };

  const restorePrayer = (prayer: PrayerName) => {
    setPrefs(old => ({...old, prayer_settings: {...old.prayer_settings, [prayer]: structuredClone(DEFAULT_PRAYER_PREFERENCES[prayer])}}));
    setDirtyPrayers(old => new Set(old).add(prayer));
  };

  if (loading) return <p className="muted" role="status">جارٍ تحميل إعدادات الصلاة…</p>;

  return (
    <div className="notif-prayer-panel">
      <NativeAdhanPanel prayerLocation={prayerLocation} onNotify={notify} />
      {onPrayerLocation && <PrayerLocationPicker location={sanitizePrayerLocation(prayerLocation)} onChange={onPrayerLocation}/>}
      <p className="muted small">
        يمكنك هنا ضبط كل صلاة بشكل مستقل.
        الأذان داخل المتصفح يعمل فقط والصفحة مفتوحة؛ لا يضمن المتصفح التشغيل في الخلفية.
      </p>
      {PRAYER_NAMES.map(prayer => {
        const setting: PrayerSetting = {...DEFAULT_PRAYER_PREFERENCES[prayer], ...prefs.prayer_settings[prayer]};
        const id = `prayer-${PRAYER_NAMES.indexOf(prayer)}`;
        return (
          <fieldset key={prayer} className="notif-prayer-card" disabled={!prefs.global_enabled}>
            <legend>{prayer}</legend>
            <label className="notif-switch">
              <input type="checkbox" checked={setting.enabled} onChange={event => update(prayer, {enabled: event.target.checked})}/>
              تفعيل إشعار صلاة {prayer}
            </label>
            {setting.enabled && (
              <div className="form-grid">
                <label htmlFor={`${id}-type`}>نوع الأذان
                  <select id={`${id}-type`} value={setting.adhan_type} onChange={event => update(prayer, {adhan_type: event.target.value as PrayerAdhanType})}>
                    {(Object.keys(PRAYER_ADHAN_LABELS) as PrayerAdhanType[]).map(key => <option key={key} value={key}>{PRAYER_ADHAN_LABELS[key]}</option>)}
                  </select>
                </label>
                <label htmlFor={`${id}-channel`}>طريقة الإشعار
                  <select id={`${id}-channel`} value={setting.channel} onChange={event => update(prayer, {channel: event.target.value as NotificationChannel})}>
                    {(['in_app', 'system', 'both'] as NotificationChannel[]).map(key => <option key={key} value={key}>{channelLabel(key)}</option>)}
                  </select>
                </label>
                {setting.adhan_type !== 'silent' && (
                  <label>الصوت
                    <SoundSelectField value={setting.sound_id} onChange={sound => update(prayer, {sound_id: sound})}/>
                  </label>
                )}
                <label htmlFor={`${id}-before`}>تذكير قبل الأذان (دقائق، 0 = بلا تذكير)
                  <input id={`${id}-before`} type="number" inputMode="numeric" min={0} max={MAX_REMINDER_MINUTES}
                    value={setting.remind_before_minutes ?? 0} onChange={event => update(prayer, {remind_before_minutes: boundedMinutes(event.target.value, MAX_REMINDER_MINUTES)})}/>
                </label>
                <label htmlFor={`${id}-after`}>تذكير بعد الأذان (دقائق، 0 = بلا تذكير)
                  <input id={`${id}-after`} type="number" inputMode="numeric" min={0} max={MAX_REMINDER_MINUTES}
                    value={setting.remind_after_minutes ?? 0} onChange={event => update(prayer, {remind_after_minutes: boundedMinutes(event.target.value, MAX_REMINDER_MINUTES)})}/>
                </label>
                <label htmlFor={`${id}-adjust`}>تعديل يدوي للوقت (دقائق، من −{MAX_PRAYER_ADJUSTMENT} إلى +{MAX_PRAYER_ADJUSTMENT})
                  <input id={`${id}-adjust`} type="number" inputMode="numeric" min={-MAX_PRAYER_ADJUSTMENT} max={MAX_PRAYER_ADJUSTMENT}
                    value={setting.adjust_minutes ?? 0} onChange={event => update(prayer, {adjust_minutes: clampAdjustment(Number(event.target.value))})}/>
                </label>
              </div>
            )}
            <div className="notif-form-actions">
              <button type="button" className="primary" disabled={savingPrayer !== null || !dirtyPrayers.has(prayer)} onClick={() => void savePrayer(prayer)}>
                {savingPrayer === prayer ? 'جارٍ الحفظ…' : `حفظ إعدادات ${prayer}`}
              </button>
              <button type="button" className="soft-btn" disabled={savingPrayer !== null} onClick={() => restorePrayer(prayer)}>استعادة الافتراضي</button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

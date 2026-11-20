// src/views/notifications/NativeAdhanPanel.tsx
import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, loadReminders } from '../../notifications/prefs-store';
import { sanitizePrayerLocation, type PrayerLocation } from '../../prayer-location';
import {
  addAppResumeListener,
  getAndroidEnvironmentStatus,
  openAppSettings as openNativeAppSettings,
  openBatterySettings as openNativeBatterySettings,
  openExactAlarmSettings as openNativeExactAlarmSettings,
  stopNativeAdhan,
  type AndroidEnvironmentStatus,
} from '../../lib/settings-opener';
import {
  ensureChannels,
  checkPermissions,
  requestPermissions,
  schedulePrayerNotifications,
  scheduleNativePersonalReminders,
  cancelAllPrayerNotifications,
  getActiveAdhanChannelInfo,
  isNativePlatform,
  ADHAN_CHANNEL_ID,
  GENERAL_CHANNEL_ID,
  NATIVE_SCHEDULE_UPDATED_EVENT,
  type ActiveChannelInfo,
} from '../../notifications/native-prayer-scheduler';

interface Props { prayerLocation?: PrayerLocation; onNotify: (m: string) => void; }

export default function NativeAdhanPanel({ prayerLocation, onNotify }: Props) {
  const [perm, setPerm] = useState<{ display: string; exact: string }>({ display: 'prompt', exact: 'unsupported' });
  const [envStatus, setEnvStatus] = useState<AndroidEnvironmentStatus | null>(null);
  const [channelInfo, setChannelInfo] = useState<ActiveChannelInfo>(() => getActiveAdhanChannelInfo());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [supported] = useState(isNativePlatform());
  const [explainerOpen, setExplainerOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [p, ch, env] = await Promise.all([
      checkPermissions(),
      ensureChannels(),
      getAndroidEnvironmentStatus(),
    ]);
    setPerm(p);
    setChannelInfo(ch);
    setEnvStatus(env);
  }, []);

  useEffect(() => {
    void refresh();
    const stopResume = addAppResumeListener(() => { void refresh(); });
    const onUpdated = () => { void refresh(); };
    window.addEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, onUpdated);
    return () => {
      stopResume();
      window.removeEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, onUpdated);
    };
  }, [refresh]);

  const handleEnable = () => setExplainerOpen(true);

  const confirmEnable = async () => {
    setExplainerOpen(false);
    setBusy(true);
    try {
      const ch = await ensureChannels();
      setChannelInfo(ch);
      const p = await requestPermissions();
      setPerm(p);
      setEnvStatus(await getAndroidEnvironmentStatus());
      if (p.display !== 'granted') {
        setResult('لم يُمنح إذن الإشعارات.');
        onNotify('لم يُمنح إذن الإشعارات. يمكنك تفعيله من إعدادات النظام.');
        return;
      }
      const loc = sanitizePrayerLocation(prayerLocation);
      if (!loc) {
        onNotify('اختر موقعك (المدينة) أولاً.');
        return;
      }
      const [{ prefs }, { reminders }] = await Promise.all([loadPrefs(), loadReminders()]);
      const r = await schedulePrayerNotifications({ location: loc, prefs, days: 10 });
      await scheduleNativePersonalReminders(reminders, prefs);
      await refresh();
      if (r.scheduled > 0) {
        setResult(`تم جدولة ${r.scheduled} منبه (${r.cancelled} ملغى).${r.warning ? ' ملاحظة: ' + r.warning : ''}`);
        onNotify(r.exactAlarm === 'denied'
          ? 'تمت جدولة التنبيهات بشكل تقريبي (inexact) لأن إذن المنبهات الدقيقة غير مفعل.'
          : 'تم تفعيل تنبيهات الأذان على مستوى النظام.');
      } else {
        setResult(`لم تتم جدولة أي منبه (${r.cancelled} ملغى).${r.warning ? ' ' + r.warning : ' تأكد من تفعيل الإشعارات والصلوات.'}`);
        onNotify(r.warning ?? 'لم تتم جدولة أي منبه.');
      }
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'فشل تفعيل التنبيهات.');
    } finally {
      setBusy(false);
    }
  };

  const openAppSettings = async () => {
    const r = await openNativeAppSettings();
    if (r.opened) onNotify('تم فتح إعدادات التطبيق.');
    else if (r.error === 'not-native') onNotify('متاح في تطبيق Android فقط. يدويا: Settings -> Apps -> Al-Rabbaniyyun -> Permissions.');
    else onNotify('تعذر فتح الإعدادات. يدويا: Settings -> Apps -> Al-Rabbaniyyun -> Permissions.');
  };

  const openBatterySettings = async () => {
    const r = await openNativeBatterySettings();
    if (r.opened) onNotify('تم فتح إعدادات توفير البطارية.');
    else if (r.error === 'not-native') onNotify('متاح في تطبيق Android فقط. يدويا: Settings -> Battery -> Battery optimization -> Al-Rabbaniyyun -> Don\'t optimize.');
    else onNotify('تعذر فتح إعدادات البطارية. يدويا: Settings -> Battery -> Battery optimization -> Al-Rabbaniyyun -> Don\'t optimize.');
  };

  const openExactAlarmSettings = async () => {
    const r = await openNativeExactAlarmSettings();
    if (r.opened) {
      onNotify('تم فتح إعدادات المنبهات الدقيقة (Alarms & reminders).');
      return;
    }
    try {
      const mod = await import('@capacitor/local-notifications');
      const changed = await mod.LocalNotifications.changeExactNotificationSetting();
      setPerm((prev) => ({ ...prev, exact: changed.exact_alarm }));
      onNotify('تم فتح إعدادات المنبهات الدقيقة.');
    } catch {
      onNotify('تعذر فتح إعدادات المنبهات الدقيقة. يدويا: Settings -> Apps -> Al-Rabbaniyyun -> Alarms & reminders.');
    }
  };

  const handleReschedule = async () => {
    setBusy(true);
    try {
      const loc = sanitizePrayerLocation(prayerLocation);
      if (!loc) { onNotify('اختر موقعك أولاً.'); return; }
      const [{ prefs }, { reminders }] = await Promise.all([loadPrefs(), loadReminders()]);
      const r = await schedulePrayerNotifications({ location: loc, prefs, days: 10 });
      await scheduleNativePersonalReminders(reminders, prefs);
      await refresh();
      if (r.scheduled > 0) {
        setResult(`إعادة جدولة: ${r.scheduled} منبه.${r.warning ? ' ملاحظة: ' + r.warning : ''}`);
        onNotify(r.exactAlarm === 'denied'
          ? 'تمت إعادة الجدولة كتنبيهات تقريبية (inexact).'
          : 'تمت إعادة جدولة الأذان.');
      } else {
        setResult(`لم تتم جدولة أي منبه.${r.warning ? ' ' + r.warning : ''}`);
        onNotify(r.warning ?? 'لم تتم جدولة أي منبه.');
      }
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'فشل.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelAllPrayerNotifications();
      await refresh();
      setResult('تم إلغاء جميع منبهات الأذان.');
      onNotify('تم إلغاء المنبهات.');
    } finally {
      setBusy(false);
    }
  };

  const handleStopAdhan = async () => {
    await stopNativeAdhan();
    await refresh();
    onNotify('تم إيقاف صوت الأذان.');
  };

  if (!supported) {
    return (
      <div className="notif-prayer-panel">
        <h3>تنبيهات الأذان (نظام)</h3>
        <p className="muted small">
          تنبيهات الأذان على مستوى النظام (عند إغلاق التطبيق) متاحة في تطبيق Android (Capacitor) فقط.
          في نسخة الويب، الأذان يعمل داخل التطبيق (إن كان مفتوحًا).
        </p>
      </div>
    );
  }

  const activeSoundLabel = channelInfo.soundMode === 'adhan'
    ? `${channelInfo.soundTitle} (res/raw/${channelInfo.soundFile})`
    : 'صوت النظام الافتراضي';

  const batteryLabel = envStatus
    ? (envStatus.ignoringBatteryOptimizations ? 'مستثنى (موصى به)' : 'مقيّد بتوفير البطارية')
    : 'غير معروف';

  return (
    <>
      {explainerOpen && (
        <div className="qibla-banner info" role="dialog" aria-modal="true" style={{ marginBottom: 12 }}>
          <strong>قبل تفعيل تنبيهات الأذان</strong>
          <p className="muted small" style={{ margin: '6px 0' }}>
            سيطلب التطبيق إذن الإشعارات (Android 13+) وإذن المنبهات الدقيقة (Android 12+) لجدولة الأذان في وقتها.
            الأذان يعمل محليًا (بدون إنترنت). يمكنك إيقاف أي صلاة من الإعدادات.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" disabled={busy} onClick={() => void confirmEnable()}>متابعة وطلب الإذن</button>
            <button className="soft-btn" onClick={() => setExplainerOpen(false)}>إلغاء</button>
          </div>
        </div>
      )}
      <div className="notif-prayer-panel">
      <h3>تنبيهات الأذان (نظام Android)</h3>
      <p className="muted small">
        جدولة 10 أيام من مواقيت الصلاة كمنبهات نظام (تعمل حتى عند إغلاق التطبيق مع تشغيل الأذان الكامل).
        تُعاد الجدولة تلقائيًا عند فتح التطبيق، تغيير الإعدادات، إعادة التشغيل، تحديث التطبيق، أو تغيير الوقت والمنطقة الزمنية.
      </p>

      <div className="form-grid">
        <div>
          <strong>حالة الإذن (display):</strong> {perm.display}
        </div>
        <div>
          <strong>المنبهات الدقيقة (exact alarm):</strong> {perm.exact}
        </div>
        <div>
          <strong>قناة الأذان:</strong> {channelInfo.adhanChannelId || ADHAN_CHANNEL_ID} (صوت: {activeSoundLabel})
        </div>
        <div>
          <strong>قناة عامة:</strong> {GENERAL_CHANNEL_ID} · <strong>البطارية:</strong> {batteryLabel}
        </div>
      </div>

      {perm.display !== 'granted' && (
        <div className="qibla-banner warn" role="alert">
          لم يُمنح إذن الإشعارات. اضغط «تفعيل» لطلب الإذن، أو افتح إعدادات النظام.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="soft-btn" onClick={() => void openAppSettings()}>فتح إعدادات التطبيق</button>
            <button className="soft-btn" onClick={() => void openBatterySettings()}>إعدادات توفير البطارية</button>
          </div>
        </div>
      )}
      {perm.exact !== 'granted' && perm.exact !== 'unsupported' && (
        <div className="qibla-banner warn" role="alert">
          منبهات الأذان الدقيقة (exact alarm) غير مفعلة. سيتم استخدام الجدولة التقريبية (inexact) وقد تتأخر التنبيهات بضع دقائق.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="soft-btn" onClick={() => void openExactAlarmSettings()}>فتح إعدادات المنبهات الدقيقة</button>
          </div>
        </div>
      )}
      {perm.display === 'granted' && envStatus && !envStatus.ignoringBatteryOptimizations && (
        <div className="qibla-banner warn" role="alert">
          التطبيق خاضع لتوفير البطارية، ما قد يؤخر أو يوقف تنبيهات الأذان في بعض الأجهزة عند إغلاق الشاشة.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="soft-btn" onClick={() => void openBatterySettings()}>إعدادات توفير البطارية</button>
          </div>
        </div>
      )}

      <div className="notif-form-actions">
        <button className="primary" disabled={busy} onClick={() => void handleEnable()}>
          {busy ? 'جارٍ…' : 'تفعيل تنبيهات الأذان'}
        </button>
        <button className="soft-btn" disabled={busy} onClick={() => void handleReschedule()}>
          إعادة جدولة
        </button>
        <button className="soft-btn" disabled={busy} onClick={() => void handleCancel()}>
          إلغاء الكل
        </button>
        {envStatus?.isAdhanPlaying && (
          <button className="soft-btn" type="button" onClick={() => void handleStopAdhan()}>
            إيقاف الأذان
          </button>
        )}
      </div>

      {result && <p className="muted small">{result}</p>}

      <details className="qibla-steps" style={{ marginTop: 8 }}>
        <summary><strong>تشخيص + تعليمات أجهزة OEM</strong></summary>
        <ul style={{ paddingInlineStart: 20, fontSize: 13 }}>
          <li>Android 13+: صلاحية POST_NOTIFICATIONS (تُطلب وقت التشغيل).</li>
          <li>Android 12+: صلاحية SCHEDULE_EXACT_ALARM (exact alarm) — توجيه المستخدم لإعدادات النظام، مع استمرار العمل بالمنبه التقريبي عند الرفض.</li>
          <li>استثناء توفير البطارية: Settings → Battery → Battery optimization → Al-Rabbaniyyun → Don't optimize.</li>
          <li>Xiaomi/Huawei/Oppo: فعّل "التشغيل التلقائي" (Auto-start) و"التشغيل في الخلفية" (Background activity) و"عرض الإشعارات على شاشة القفل".</li>
          <li>إعادة تشغيل الجهاز وتحديث التطبيق وتغيير الوقت/المنطقة الزمنية ومنح إذن المنبهات الدقيقة: يستعيد النظام المنبهات المحفوظة تلقائيًا عبر مستقبل النظام، وتُحدّث الجدولة لـ 10 أيام عند فتح التطبيق.</li>
        </ul>
      </details>

      <details className="qibla-steps" style={{ marginTop: 8 }}>
        <summary><strong>أصوات الأذان المدمجة وتشغيل الخلفية</strong></summary>
        <ol style={{ paddingInlineStart: 20, fontSize: 13 }}>
          <li>التطبيق يضم 6 تسجيلات أذان كاملة مدمجة محليًا في `res/raw/adhan_*.mp3` (تعمل دون إنترنت)، إضافة إلى ملف `takbeerat_eid.mp3` المستقل لتكبيرات العيد.</li>
          <li>يُشغّل الأذان الكامل في الخلفية أو أثناء قفل الشاشة عبر خدمة `AdhanPlaybackService` (MediaPlayback Foreground Service) مع زر «إيقاف الأذان» وإغلاق تلقائي مضبوط، مع قناة إشعار مخصصة لكل مؤذن في Android 8+.</li>
          <li>لتبديل صوت الأذان، اختر المؤذن من قسم «الأذان» أو من «إعدادات الأصوات» لكل صلاة، وستُحدّث قناة ومنبهات الأذان تلقائيًا.</li>
        </ol>
      </details>
    </div>
    </>
  );
}

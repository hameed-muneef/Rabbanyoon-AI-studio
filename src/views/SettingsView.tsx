import {useEffect, useRef, useState} from 'react';
import {Globe, Lock, Play, RotateCcw, Square, UserRound, Volume2} from 'lucide-react';
import {type State, createSeed} from '../app-state';
import NotificationSettings from './notifications/NotificationSettings';
import {AppearancePanel} from '../AppearanceToggle';
import {InstallGuidePanel} from '../InstallApp';
import {LOCAL_ONLY} from '../config';
import {BUILTIN_SOUNDS} from '../notifications/builtin-sounds';
import {
  NATIVE_SCHEDULE_UPDATED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  notifyNativePrefsChanged,
} from '../notifications/native-prayer-scheduler';
import {loadPrefs, savePrefs} from '../notifications/prefs-store';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  DEFAULT_PRAYER_PREFERENCES,
  PRAYER_NAMES,
  type NotificationPreference,
  type PrayerName,
} from '../notifications/types';
import {
  ADHAN_SELECTION_STORAGE_KEY,
  BUNDLED_ADHAN_SOUNDS,
  getSelectedDefaultAdhanId,
  resolvePrayerAdhan,
} from '../sounds/adhan-catalog';
import AdhanPlayer from './AdhanPlayer';
import AlarmTonePlayer from './AlarmTonePlayer';

type Props = {state: State; onReplace: (state: State) => void; notify: (message: string) => void; onOpenProfile?: () => void};

// إعدادات المستخدم: الحساب (في نسخة السحابة)، والتنبيهات والمظهر والخصوصية،
// واختيار أصوات الأذان المحلية لكل وقت صلاة وللمنبهات دون اتصال بالإنترنت.
export default function SettingsView({state, onReplace, notify, onOpenProfile}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [defaultAdhanId, setDefaultAdhanId] = useState<string>(() => getSelectedDefaultAdhanId());
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    const sync = () => {
      setDefaultAdhanId(getSelectedDefaultAdhanId());
      void loadPrefs().then(({prefs: loaded}) => {
        if (active) setPrefs(loaded);
      });
    };
    sync();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    window.addEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
      window.removeEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, sync);
    };
  }, []);

  useEffect(() => () => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
  }, []);

  const stopPreview = () => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPreviewPlayingId(null);
  };

  const togglePreview = (idOrSoundId?: string) => {
    const resolved = resolvePrayerAdhan(idOrSoundId, defaultAdhanId);
    if (previewPlayingId === resolved.soundId) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(resolved.url);
    previewAudioRef.current = audio;
    setPreviewPlayingId(resolved.soundId);
    audio.addEventListener('ended', () => {
      setPreviewPlayingId(null);
      previewAudioRef.current = null;
    }, {once: true});
    audio.addEventListener('error', () => {
      setPreviewPlayingId(null);
      previewAudioRef.current = null;
      notify('تعذر تشغيل ملف الأذان.');
    }, {once: true});
    void audio.play().catch(() => {
      setPreviewPlayingId(null);
      previewAudioRef.current = null;
      notify('تعذر تشغيل ملف الأذان.');
    });
  };

  const handleDefaultAdhanChange = (nextId: string) => {
    stopPreview();
    setDefaultAdhanId(nextId);
    try {
      localStorage.setItem(ADHAN_SELECTION_STORAGE_KEY, nextId);
    } catch { /* ignore */ }
    notifyNativePrefsChanged();
    const entry = resolvePrayerAdhan(undefined, nextId);
    notify(`تم تعيين الأذان الافتراضي: ${entry.name}`);
  };

  const handlePrayerSoundChange = async (prayer: PrayerName, nextSoundId: string) => {
    const soundId = nextSoundId || undefined;
    setPrefs(old => ({
      ...old,
      prayer_settings: {
        ...old.prayer_settings,
        [prayer]: {
          ...DEFAULT_PRAYER_PREFERENCES[prayer],
          ...old.prayer_settings?.[prayer],
          sound_id: soundId,
        },
      },
    }));
    try {
      const {prefs: fresh} = await loadPrefs();
      const current = {...DEFAULT_PRAYER_PREFERENCES[prayer], ...fresh.prayer_settings?.[prayer], sound_id: soundId};
      const nextPrefs: NotificationPreference = {
        ...fresh,
        prayer_settings: {
          ...fresh.prayer_settings,
          [prayer]: current,
        },
      };
      await savePrefs(nextPrefs);
      setPrefs(nextPrefs);
      notifyNativePrefsChanged();
      const label = soundId
        ? (BUNDLED_ADHAN_SOUNDS.find(s => s.soundId === soundId)?.name
          ?? BUILTIN_SOUNDS.find(s => s.id === soundId)?.title
          ?? 'الصوت المختار')
        : `الافتراضي (${defaultAdhan.name})`;
      notify(`تم تعيين صوت ${prayer}: ${label}`);
    } catch {
      notify(`تعذر حفظ صوت ${prayer}`);
    }
  };

  const handleReminderSoundChange = async (nextSoundId: string) => {
    const soundId = nextSoundId || undefined;
    setPrefs(old => ({
      ...old,
      reminder_settings: {
        ...old.reminder_settings,
        default_sound_id: soundId,
      },
    }));
    try {
      const {prefs: fresh} = await loadPrefs();
      const nextPrefs: NotificationPreference = {
        ...fresh,
        reminder_settings: {
          ...fresh.reminder_settings,
          default_sound_id: soundId,
        },
      };
      await savePrefs(nextPrefs);
      setPrefs(nextPrefs);
      notifyNativePrefsChanged();
      const label = soundId
        ? (BUNDLED_ADHAN_SOUNDS.find(s => s.soundId === soundId)?.name
          ?? BUILTIN_SOUNDS.find(s => s.id === soundId)?.title
          ?? 'الصوت المختار')
        : 'الافتراضي';
      notify(`تم تعيين صوت المنبهات: ${label}`);
    } catch {
      notify('تعذر حفظ صوت المنبهات');
    }
  };

  const reset = () => {
    if (window.confirm('هل تريد حذف كل البيانات المحلية في هذا الجهاز؟ لا يمكن التراجع.')) {
      onReplace(createSeed());
      notify('تمت إعادة الضبط');
    }
  };

  const defaultAdhan = resolvePrayerAdhan(undefined, defaultAdhanId);
  const isDefaultPlaying = previewPlayingId === defaultAdhan.soundId;

  return <>
    <div className="page-intro"><span className="eyebrow">المنصة</span><h1>الإعدادات والبيانات</h1><p>{LOCAL_ONLY?'نسخة محلية تعمل على هذا الجهاز وحده: لا حساب ولا مزامنة سحابية ولا نسخ احتياطية خارجية.':'نسخة تجريبية تعمل محليًا في المتصفح، وتُزامَن بيانات حسابك في السحابة عند تسجيل الدخول.'}</p></div>
    {!LOCAL_ONLY&&onOpenProfile&&<section className='panel'><h3><UserRound size={18}/> الملف الشخصي وإعدادات الحساب</h3><p className="muted">اسمك وبلدك، والمنطقة الزمنية واللغة والمدينة ومواعيد اليوم، وتفضيلات الإشعارات، وحذف الحساب.</p><button className="primary" onClick={onOpenProfile}><Globe size={17}/> فتح حسابي</button></section>}
    <section className="panel adhan-player" dir="rtl" aria-labelledby="offline-adhan-select-title">
      <h3 id="offline-adhan-select-title"><Volume2 size={18}/> اختيار صوت الأذان (يعمل بدون إنترنت)</h3>
      <p className="muted">اختر صوت الأذان المفضل من الملفات المدمجة محليًا في التطبيق لكل وقت صلاة أو للمنبهات دون الحاجة لاتصال بالإنترنت.</p>
      <div className="adhan-row" style={{marginBottom: 14}}>
        <select
          aria-label="الأذان الافتراضي للصلوات"
          value={defaultAdhanId}
          onChange={event => handleDefaultAdhanChange(event.target.value)}
        >
          {BUNDLED_ADHAN_SOUNDS.map(sound => (
            <option key={sound.id} value={sound.id}>{sound.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={isDefaultPlaying ? 'soft-btn selected' : 'primary'}
          onClick={() => togglePreview(defaultAdhan.soundId)}
          aria-pressed={isDefaultPlaying}
        >
          {isDefaultPlaying ? <Square size={16}/> : <Play size={16}/>} {isDefaultPlaying ? 'إيقاف' : 'معاينة'}
        </button>
      </div>
      <div className="form-grid">
        {PRAYER_NAMES.map(prayer => {
          const currentValue = prefs.prayer_settings?.[prayer]?.sound_id ?? '';
          return (
            <label key={prayer}>أذان صلاة {prayer}
              <select
                aria-label={`أذان صلاة ${prayer}`}
                value={currentValue}
                onChange={event => void handlePrayerSoundChange(prayer, event.target.value)}
              >
                <option value="">الافتراضي ({defaultAdhan.name})</option>
                <optgroup label="ملفات الأذان المحلية (بدون إنترنت)">
                  {BUNDLED_ADHAN_SOUNDS.map(sound => (
                    <option key={sound.soundId} value={sound.soundId}>{sound.name}</option>
                  ))}
                </optgroup>
                <optgroup label="نغمات التنبيه">
                  {BUILTIN_SOUNDS.map(sound => (
                    <option key={sound.id} value={sound.id}>{sound.title}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          );
        })}
        <label>صوت المنبهات والتذكيرات
          <select
            aria-label="صوت المنبهات والتذكيرات"
            value={prefs.reminder_settings?.default_sound_id ?? ''}
            onChange={event => void handleReminderSoundChange(event.target.value)}
          >
            <option value="">الافتراضي</option>
            <optgroup label="ملفات الأذان المحلية (بدون إنترنت)">
              {BUNDLED_ADHAN_SOUNDS.map(sound => (
                <option key={sound.soundId} value={sound.soundId}>{sound.name}</option>
              ))}
            </optgroup>
            <optgroup label="نغمات التنبيه">
              {BUILTIN_SOUNDS.map(sound => (
                <option key={sound.id} value={sound.id}>{sound.title}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
    </section>
    <NotificationSettings notify={notify} prayerLocation={state.prayerLocation} onPrayerLocation={prayerLocation=>onReplace({...state,prayerLocation})} goals={state.goals.map(goal=>({id:String(goal.id),title:String((goal as {title?:string}).title??'')}))}/>
    <AppearancePanel/>
    <AdhanPlayer notify={notify}/>
    <AlarmTonePlayer notify={notify}/>
    <InstallGuidePanel/>
    <section className='panel'><h3><Lock size={18}/> الخصوصية</h3><p className="muted">اسمك وبلدك ملكك وحدك ولا يظهران لغيرك. محاسبة نفسك («حاسب نفسك») لا تُعرض على أحد ولا تدخل في أي إجمالي.</p></section>
    <section className="panel"><h3>بياناتك على هذا الجهاز</h3><p className="muted">كل ما تكتبه — مهامك وأهدافك وأورادك ومحاسبتك وقراءتك — يُحفظ على هذا الجهاز فقط. لا يُرسل إلى خادم، ولا تُصدَّر نسخة احتياطية إلى ملف خارجي، ولا تُستورد نسخة من جهاز آخر. إن حذفت بيانات المتصفح أو التطبيق ضاعت بياناتك، فاحتفظ بجهازك آمنًا.</p><button className="outline-danger" onClick={reset}><RotateCcw size={17}/> حذف البيانات المحلية</button></section>
  </>;
}

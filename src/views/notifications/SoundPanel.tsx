// لوحة الصوت — اختيار نغمات (مدمجة / سحابية / خارجية).
import {useEffect, useRef, useState} from 'react';
import {Play, Square, Upload} from 'lucide-react';
import {authClient} from '../../auth';
import {LOCAL_ONLY} from '../../config';
import {BUILTIN_SOUNDS, previewSound, type SoundOption} from '../../notifications/builtin-sounds';
import {playAudio, stopAudio} from '../../notifications/audio';
import {listAudioResources, uploadAudioResource} from '../../notifications/service';
import type {AudioResource, NotificationChannel} from '../../notifications/types';
import {getCustomAlarmUrl, setCustomAlarmUrl} from '../../notifications/sound-selection';
import {loadCustomSound, customSoundUrl} from '../../sounds/custom-store';
import {BUNDLED_ADHAN_SOUNDS} from '../../sounds/adhan-catalog';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
const MAX_SIZE = 10 * 1024 * 1024;
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'داخل التطبيق',
  system: 'إشعار النظام',
  both: 'داخل التطبيق + إشعار النظام',
};

export function channelLabel(channel: NotificationChannel): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

let cloudSounds: AudioResource[] = [];
let cloudLoading: Promise<void> | null = null;

export function useCloudSounds(): AudioResource[] {
  const [list, setList] = useState(cloudSounds);
  useEffect(() => {
    if (LOCAL_ONLY || !authClient) return;
    let active = true;
    cloudLoading ??= listAudioResources()
      .then(rows => { cloudSounds = rows.filter(row => row.kind === 'adhan' || row.kind === 'tone'); })
      .catch(() => { cloudLoading = null; });
    void cloudLoading.then(() => { if (active) setList(cloudSounds); });
    return () => { active = false; };
  }, []);
  return list;
}

export function SoundSelectField({value, onChange, allowNone = true}:
  {value: string | undefined; onChange: (id: string | undefined) => void; allowNone?: boolean}) {
  const cloud = useCloudSounds();
  const [hasCustom, setHasCustom] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rec = await loadCustomSound('alarm');
        if (active && rec) {
          setCustomAlarmUrl(customSoundUrl(rec));
          setHasCustom(true);
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);
  const customUrl = hasCustom ? getCustomAlarmUrl() : undefined;
  return (
    <select value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
      {allowNone && <option value="">الافتراضي</option>}
      <optgroup label="أصوات الأذان (يعمل بدون إنترنت)">
        {BUNDLED_ADHAN_SOUNDS.map(sound => <option key={sound.soundId} value={sound.soundId}>{sound.name}</option>)}
      </optgroup>
      {BUILTIN_SOUNDS.map(sound => <option key={sound.id} value={sound.id}>{sound.title}</option>)}
      {cloud.length > 0 && <optgroup label="الأذان والنغمات المعتمدة">{cloud.map(sound => <option key={sound.id} value={sound.id}>{sound.title}</option>)}</optgroup>}
      {(soundLibraryCustom ?? []).map(sound => <option key={sound.id} value={sound.id}>{sound.title} (مرفوع)</option>)}
      {customUrl && <option value="custom:alarm">نغمة خارجية (ملف من جهازك)</option>}
    </select>
  );
}

let soundLibraryCustom: AudioResource[] = [];

export default function SoundPanel({notify}: {notify: (message: string) => void}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cloud = useCloudSounds();
  const stop = () => {
    stopAudio();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(null);
  };

  const play = (sound: SoundOption) => {
    stop();
    if (sound.kind === 'silent') {
      setMessage('صامت — لا صوت.');
      return;
    }
    if (sound.url) playAudio(sound.url); else previewSound(sound);
    setPlaying(sound.id);
    setMessage('');
    window.setTimeout(() => setPlaying(null), 2500);
  };

  const upload = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage('نوع ملف غير مدعوم. الأنواع: MP3 أو WAV أو OGG أو M4A.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setMessage('حجم الملف أكبر من 10 ميغابايت.');
      return;
    }
    setBusy(true);
    setMessage('');
    const title = (file.name.replace(/\.[^.]+$/, '') || 'صوت مخصص').slice(0, 60);
    try {
      if (!LOCAL_ONLY && authClient) {
        const stored = await uploadAudioResource(file, title);
        soundLibraryCustom = [...soundLibraryCustom.filter(item => item.id !== stored.id), stored];
        setMessage(`تم إضافة «${stored.title}».`);
        notify('تم إضافة الصوت');
      } else {
        soundLibraryCustom = [...soundLibraryCustom, {
          id: `custom:${Date.now()}`,
          title,
          kind: 'custom',
          url: URL.createObjectURL(file),
          is_default: false,
          is_uploaded: true,
          created_at: new Date().toISOString(),
        }];
        setMessage(`أُضيف «${title}» محليًا.`);
      }
    } catch (error) {
      setMessage(`تعذر إضافة الصوت: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="notif-sound-panel">
      <ul className="notif-sound-list">
        {BUNDLED_ADHAN_SOUNDS.map(sound => (
          <li key={sound.soundId}>
            <div className="notif-sound-main">
              <strong>{sound.name}</strong>
              <small>أذان محلي (يعمل بدون إنترنت)</small>
            </div>
            <button
              type="button"
              className="soft-btn notif-play"
              onClick={() => playing === sound.soundId ? stop() : play({id: sound.soundId, title: sound.name, kind: 'adhan', url: sound.url})}
              aria-label={`تشغيل ${sound.name}`}
            >
              {playing === sound.soundId ? <Square size={15}/> : <Play size={15}/>}
            </button>
          </li>
        ))}
        {BUILTIN_SOUNDS.map(sound => (
          <li key={sound.id}>
            <div className="notif-sound-main">
              <strong>{sound.title}</strong>
              <small>{sound.description}</small>
            </div>
            {sound.kind === 'silent'
              ? <span className="muted small">—</span>
              : <button type="button" className="soft-btn notif-play" onClick={() => play(sound)} aria-label={`تشغيل ${sound.title}`}>
                  {playing === sound.id ? <Square size={15}/> : <Play size={15}/>}
                </button>}
          </li>
        ))}
        {cloud.map(sound => (
          <li key={sound.id}>
            <div className="notif-sound-main">
              <strong>{sound.title}</strong>
              <small>{sound.kind === 'adhan' ? 'أذان' : 'نغمة'}</small>
            </div>
            <button type="button" className="soft-btn notif-play" onClick={() => play(sound)} aria-label={`تشغيل ${sound.title}`}>
              {playing === sound.id ? <Square size={15}/> : <Play size={15}/>}
            </button>
          </li>
        ))}
        {soundLibraryCustom.map(sound => (
          <li key={sound.id}>
            <div className="notif-sound-main">
              <strong>{sound.title}</strong>
              <small>صوت خارجي</small>
            </div>
            <button type="button" className="soft-btn notif-play" onClick={() => play(sound)} aria-label={`تشغيل ${sound.title}`}>
              {playing === sound.id ? <Square size={15}/> : <Play size={15}/>}
            </button>
          </li>
        ))}
      </ul>
      <label className="notif-upload">
        <Upload size={16}/> إضافة صوت (حتى 10 ميغابايت)
        <input type="file" accept="audio/*" disabled={busy} onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}/>
      </label>
      {message && <p role="status" className="muted small">{message}</p>}
    </div>
  );
}

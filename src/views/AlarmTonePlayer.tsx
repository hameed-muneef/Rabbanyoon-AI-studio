// نغمة تذكير خارجية: اختيار ملف صوتي من جهاز المستخدم (للتنبيهات).
import {useEffect, useRef, useState} from 'react';
import {Play, Square, Bell, Trash2} from 'lucide-react';
import {saveCustomSound, loadCustomSound, deleteCustomSound, customSoundUrl} from '../sounds/custom-store';
import {setCustomAlarmUrl} from '../notifications/sound-selection';

export default function AlarmTonePlayer({notify}: {notify: (text: string) => void}) {
  const [external, setExternal] = useState<{name: string; url: string} | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const rec = await loadCustomSound('alarm');
      if (rec) {
        const url = customSoundUrl(rec);
        setExternal({name: rec.name, url});
        setCustomAlarmUrl(url);
      } else {
        setExternal(null);
        setCustomAlarmUrl(undefined);
      }
    })();
  }, []);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const toggle = () => {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (!external?.url) {
      notify('اختر ملف نغمة أولًا.');
      return;
    }
    const audio = new Audio(external.url);
    audioRef.current = audio;
    setPlaying(true);
    audio.addEventListener('ended', () => { setPlaying(false); audioRef.current = null; }, {once: true});
    audio.addEventListener('error', () => { setPlaying(false); audioRef.current = null; notify('تعذر تشغيل النغمة.'); }, {once: true});
    audio.play().catch(() => { setPlaying(false); audioRef.current = null; notify('تعذر تشغيل النغمة.'); });
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      await saveCustomSound('alarm', file);
      const rec = await loadCustomSound('alarm');
      if (rec) {
        setExternal({name: rec.name, url: customSoundUrl(rec)});
        setCustomAlarmUrl(customSoundUrl(rec));
        notify('تم حفظ نغمة التذكير.');
      }
    } catch {
      notify('تعذر حفظ الملف.');
    }
  };

  const remove = async () => {
    await deleteCustomSound('alarm');
    setExternal(null);
    setCustomAlarmUrl(undefined);
    notify('تم حذف نغمة التذكير.');
  };

  return (
    <section className="panel adhan-player" dir="rtl">
      <h3><Bell size={18}/> نغمة التذكير (Alarm)</h3>
      <p className="muted">اختر ملف صوتي من جهازك (MP3/OGG/WAV) ليُستخدم كنغمة للتنبيهات والتذكيرات.</p>
      <div className="adhan-row">
        {external ? (
          <>
            <span className="muted small" style={{flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{external.name}</span>
            <button type="button" className={playing ? 'soft-btn selected' : 'primary'} onClick={toggle} aria-pressed={playing}>
              {playing ? <Square size={16}/> : <Play size={16}/>} {playing ? 'إيقاف' : 'تشغيل'}
            </button>
            <button type="button" className="soft-btn" onClick={remove} aria-label="حذف النغمة"><Trash2 size={15}/> حذف</button>
          </>
        ) : (
          <label className="adhan-file-label" style={{flex: 1}}>
            اختر ملف صوتي (MP3/OGG/WAV)
            <input ref={pickerRef} type="file" accept="audio/*" onChange={event => void onFile(event.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>
    </section>
  );
}

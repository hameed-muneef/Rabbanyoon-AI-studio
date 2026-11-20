// مشغّل أذان: اختيار صوت الأذان (محلي أو خارجي) وتشغيله/إيقافه.
import {useEffect, useRef, useState} from 'react';
import {Play, Square, Volume2, Trash2} from 'lucide-react';
import {saveCustomSound, loadCustomSound, deleteCustomSound, customSoundUrl} from '../sounds/custom-store';
import {
  ADHAN_SELECTION_STORAGE_KEY,
  BUNDLED_ADHAN_SOUNDS,
  EID_TAKBEERAT_SOUND,
} from '../sounds/adhan-catalog';
import {NOTIFICATIONS_CHANGED_EVENT, notifyNativePrefsChanged} from '../notifications/native-prayer-scheduler';

export type AdhanSound = {id: string; name: string; url: string};

const SOUNDS: AdhanSound[] = [
  ...BUNDLED_ADHAN_SOUNDS.map(item => ({id: item.id, name: item.name, url: item.url})),
  {id: EID_TAKBEERAT_SOUND.id, name: EID_TAKBEERAT_SOUND.name, url: EID_TAKBEERAT_SOUND.url},
  {id: 'external', name: 'أذان خارجي (ملف من جهازك)', url: ''},
];

const ADHAN_OPTIONS = SOUNDS.filter(s => s.id !== EID_TAKBEERAT_SOUND.id && s.id !== 'external');

export default function AdhanPlayer({notify}: {notify: (text: string) => void}) {
  const [selected, setSelected] = useState<string>(() => {
    try { const v = localStorage.getItem(ADHAN_SELECTION_STORAGE_KEY); return SOUNDS.some(s => s.id === v) ? v! : SOUNDS[0].id; } catch { return SOUNDS[0].id; }
  });
  const [external, setExternal] = useState<{name: string; url: string} | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const prev = localStorage.getItem(ADHAN_SELECTION_STORAGE_KEY);
      if (prev !== selected) {
        localStorage.setItem(ADHAN_SELECTION_STORAGE_KEY, selected);
        notifyNativePrefsChanged();
      }
    } catch { /* ignore */ }
  }, [selected]);

  useEffect(() => {
    const syncSelected = () => {
      try {
        const stored = localStorage.getItem(ADHAN_SELECTION_STORAGE_KEY);
        if (stored && SOUNDS.some(s => s.id === stored)) {
          setSelected(curr => (curr === stored ? curr : stored));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, syncSelected);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, syncSelected);
  }, []);

  useEffect(() => {
    if (selected !== 'external') return;
    (async () => {
      const rec = await loadCustomSound('adhan');
      if (rec) {
        const url = customSoundUrl(rec);
        setExternal({name: rec.name, url});
      } else {
        setExternal(null);
      }
    })();
  }, [selected]);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const sound = SOUNDS.find(s => s.id === selected) ?? SOUNDS[0];
  const playUrl = selected === 'external' ? (external?.url ?? null) : sound.url;

  const toggle = () => {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (!playUrl) {
      notify('اختر ملف أذان خارجي أولًا.');
      return;
    }
    const audio = new Audio(playUrl);
    audioRef.current = audio;
    setPlaying(true);
    audio.addEventListener('ended', () => { setPlaying(false); audioRef.current = null; }, {once: true});
    audio.addEventListener('error', () => { setPlaying(false); audioRef.current = null; notify('تعذر تشغيل الأذان.'); }, {once: true});
    audio.play().catch(() => { setPlaying(false); audioRef.current = null; notify('تعذر تشغيل الأذان.'); });
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      await saveCustomSound('adhan', file);
      const rec = await loadCustomSound('adhan');
      if (rec) {
        const url = customSoundUrl(rec);
        setExternal({name: rec.name, url});
        notify('تم حفظ الأذان الخارجي.');
      }
    } catch {
      notify('تعذر حفظ الملف.');
    }
  };

  const removeExternal = async () => {
    await deleteCustomSound('adhan');
    setExternal(null);
    if (selected === 'external') setSelected(SOUNDS[0].id);
    notify('تم حذف الأذان الخارجي.');
  };

  return (
    <section className="panel adhan-player" dir="rtl">
      <h3><Volume2 size={18}/> أذان الصلاة</h3>
      <p className="muted">اختر صوت الأذان (محلي أو ملف من جهازك) وشغّله.</p>
      <div className="adhan-row">
        <select
          value={selected}
          onChange={event => {
            const nextId = event.target.value;
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
              setPlaying(false);
            }
            setSelected(nextId);
            const chosen = ADHAN_OPTIONS.find(s => s.id === nextId);
            if (chosen) notify(`تم اختيار صوت الأذان: ${chosen.name}`);
          }}
          aria-label="صوت الأذان"
          style={{flex: 1, minWidth: 0}}
        >
          <optgroup label="أصوات الأذان (يعمل بدون إنترنت)">
            {ADHAN_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
          <optgroup label="مناسبات خاصة (لا يُستخدم كأذان للصلوات)">
            <option value={EID_TAKBEERAT_SOUND.id}>{EID_TAKBEERAT_SOUND.name}</option>
          </optgroup>
          <option value="external">أذان خارجي (ملف من جهازك)</option>
        </select>
        <button type="button" className={playing ? 'soft-btn selected' : 'primary'} onClick={toggle} aria-pressed={playing}>
          {playing ? <Square size={16}/> : <Play size={16}/>} {playing ? 'إيقاف' : 'تشغيل الأذان'}
        </button>
      </div>
      {selected === 'external' && (
        <div className="adhan-external">
          {external ? (
            <div className="adhan-ext-row">
              <span className="muted small">الملف: {external.name}</span>
              <button type="button" className="soft-btn" onClick={removeExternal} aria-label="حذف الأذان الخارجي"><Trash2 size={15}/> حذف</button>
            </div>
          ) : (
            <label className="adhan-file-label">
              اختر ملف صوتي (MP3/OGG/WAV)
              <input ref={pickerRef} type="file" accept="audio/*" onChange={event => void onFile(event.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
      )}
    </section>
  );
}

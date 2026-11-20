import {useCallback, useEffect, useRef, useState} from 'react';
import {Play, Square, Trash2, Upload, Volume2} from 'lucide-react';
import type {User} from '@supabase/supabase-js';
import {deleteAdhan, listAdhanResources, setAdhanActive, uploadAdhan, type AdhanResource} from '../notifications/adhan-admin';
import '../notifications.css';

// إدارة تسجيلات الأذان: المدير وحده يرفع، وتظهر التسجيلات المفعّلة في مكتبة الأصوات لكل المستخدمين.
export default function AdhanAdminPanel({user}: {user: User}) {
  const [items, setItems] = useState<AdhanResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState('');
  const [license, setLicense] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const report = (text: string, error = false) => {setMessage(text); setFailed(error)};
  const reload = useCallback(async () => {
    try {
      setItems(await listAdhanResources());
    } catch (error) {
      report(error instanceof Error ? error.message : 'تعذر تحميل التسجيلات.', true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => {audio.current?.pause()};
  }, [reload]);

  const stop = () => {audio.current?.pause(); audio.current = null; setPlaying(null)};
  const play = (item: AdhanResource) => {
    if (playing === item.id) return stop();
    stop();
    const element = new Audio(item.url);
    element.onended = () => setPlaying(null);
    audio.current = element;
    setPlaying(item.id);
    void element.play().catch(() => {setPlaying(null); report('تعذر تشغيل التسجيل.', true)});
  };

  const submit = async () => {
    if (!file) return report('اختر ملفًا صوتيًا.', true);
    setBusy(true);
    try {
      const created = await uploadAdhan(file, title, license, user.id);
      setItems(list => [created, ...list]);
      setTitle(''); setLicense(''); setFile(null);
      if (picker.current) picker.current.value = '';
      report(`رُفع «${created.title}» وأصبح متاحًا للمستخدمين.`);
    } catch (error) {
      report(error instanceof Error ? error.message : 'تعذر رفع الأذان.', true);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: AdhanResource) => {
    try {
      await setAdhanActive(item.id, !item.is_active);
      setItems(list => list.map(row => row.id === item.id ? {...row, is_active: !item.is_active} : row));
    } catch (error) {
      report(error instanceof Error ? error.message : 'تعذر تحديث الحالة.', true);
    }
  };

  const remove = async (item: AdhanResource) => {
    if (!window.confirm(`حذف «${item.title}» نهائيًا؟ ستتوقف الإشعارات التي اختارته عن استخدامه.`)) return;
    try {
      if (playing === item.id) stop();
      await deleteAdhan(item);
      setItems(list => list.filter(row => row.id !== item.id));
      report('حُذف التسجيل.');
    } catch (error) {
      report(error instanceof Error ? error.message : 'تعذر الحذف.', true);
    }
  };

  return <section className="panel adhan-admin-panel" dir="rtl">
    <span className="admin-eyebrow"><Volume2 size={15}/> مكتبة الأذان</span>
    <h2>تسجيلات الأذان</h2>
    <p className="muted">ارفع التسجيلات التي لديك حق استخدامها فقط، واكتب مصدرها وحالة ترخيصها. تظهر التسجيلات المفعّلة لكل المستخدمين في مكتبة الأصوات.</p>
    <form className="form-grid" onSubmit={event => {event.preventDefault(); void submit()}}>
      <label>اسم الأذان<input value={title} maxLength={100} placeholder="مثال: أذان الحرم المكي" onChange={event => setTitle(event.target.value)}/></label>
      <label>المصدر والترخيص (مطلوب)<input value={license} maxLength={500} placeholder="مثال: إذن كتابي من الجهة، أو CC0 من ويكيميديا" onChange={event => setLicense(event.target.value)}/></label>
      <label>الملف الصوتي (MP3 / OGG / WAV / M4A حتى 10 ميغابايت)
        <input ref={picker} type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a" onChange={event => setFile(event.target.files?.[0] ?? null)}/>
      </label>
      <button className="primary" type="submit" disabled={busy}><Upload size={16}/> {busy ? 'جارٍ الرفع…' : 'رفع الأذان'}</button>
    </form>
    {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'notif-error' : 'muted'}>{message}</p>}
    {loading ? <p className="muted">جارٍ التحميل…</p> : items.length === 0 ? <p className="muted">لا توجد تسجيلات أذان بعد.</p> : <ul className="notif-sound-list">
      {items.map(item => <li key={item.id}>
        <div className="notif-sound-main">
          <strong>{item.title}</strong>
          <small>{item.license_note} · {item.is_active ? 'مفعّل' : 'موقوف'}</small>
        </div>
        <button type="button" className="soft-btn notif-play" onClick={() => play(item)} aria-label={`معاينة ${item.title}`}>{playing === item.id ? <Square size={15}/> : <Play size={15}/>}</button>
        <button type="button" className="soft-btn" onClick={() => void toggle(item)}>{item.is_active ? 'إيقاف' : 'تفعيل'}</button>
        <button type="button" className="soft-btn" onClick={() => void remove(item)} aria-label={`حذف ${item.title}`}><Trash2 size={15}/></button>
      </li>)}
    </ul>}
  </section>;
}

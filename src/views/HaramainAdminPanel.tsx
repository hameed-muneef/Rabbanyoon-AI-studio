// إدارة قنوات «من الحرمين الشريفين»: تحديث الروابط الرسمية ورابط HLS (إن أُتاح)
// دون تغيير في الكود. الصلاحية مفروضة في قاعدة البيانات (RLS) — القراءة
// للمستخدمين والتعديل للمدير فقط.

import {useCallback, useEffect, useState} from 'react';
import {RefreshCw, Save} from 'lucide-react';
import {listHaramainChannelsAdmin, saveHaramainChannel, type HaramainChannel, type HaramainChannelPatch} from '../haramain/channels';

type Draft = HaramainChannel & {dirty: boolean};

export default function HaramainAdminPanel() {
  const [items, setItems] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [reloading, setReloading] = useState(false);

  const report = (text: string, error = false) => {setMessage(text); setFailed(error)};

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      const rows = await listHaramainChannelsAdmin();
      setItems(rows.map(row => ({...row, dirty: false})));
      report('');
    } catch (error) {
      report(error instanceof Error ? error.message : 'تعذر تحميل القنوات.', true);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);
  useEffect(() => {void reload()}, [reload]);

  const patch = (id: string, changes: Partial<HaramainChannelPatch>) => {
    setItems(list => list.map(item => item.id === id ? {...item, ...changes, dirty: true} : item));
  };

  const save = async (item: Draft) => {
    setBusyId(item.id);
    try {
      await saveHaramainChannel(item.id, {
        title: item.title, subtitle: item.subtitle, official_url: item.official_url,
        hls_url: item.hls_url, sort: item.sort, is_active: item.is_active,
      });
      setItems(list => list.map(row => row.id === item.id ? {...row, dirty: false} : row));
      report(`حُفظت إعدادات «${item.title}».`);
    } catch (error) {
      report(error instanceof Error ? error.message : 'تعذر الحفظ.', true);
    } finally {
      setBusyId(null);
    }
  };

  return <fieldset className="admin-editor-fieldset admin-haramain" dir="rtl">
    <legend className="admin-panel-legend">من الحرمين الشريفين — قنوات البث المباشر</legend>
    <p className="muted small">
      البث المباشر من قناتي القرآن الكريم والسنة النبوية (هيئة الإذاعة السعودية — علولاء).
      حدّث الروابط الرسمية هنا دون تغيير في الكود. رابط HLS اختياري: إن لم يُتاح من المزود اتركه فارغًا وسيُعرض
      الجدار بالصفحة الرسمية دائمًا. لا نقوم بتوزيع البث أو تنزيله.
    </p>
    <div className="admin-panel-tools">
      <button type="button" className="soft-btn" onClick={() => void reload()} disabled={reloading}><RefreshCw size={15}/> إعادة التحميل</button>
      {message && <span className={failed ? 'admin-panel-error' : 'admin-panel-status'} role="status">{message}</span>}
    </div>
    {loading ? <p className="admin-loading">جارٍ تحميل القنوات…</p> : (
      <div className="admin-haramain-list">
        {items.map(item => (
          <div key={item.id} className="admin-haramain-row">
            <div className="admin-haramain-row-head">
              <strong>{item.id}</strong>
              {item.dirty && <span className="admin-haramain-dirty">تغييرات غير محفوظة</span>}
              <label className="admin-haramain-active"><input type="checkbox" checked={item.is_active} onChange={e => patch(item.id, {is_active: e.target.checked})}/> مفعّلة</label>
            </div>
            <label>العنوان<input value={item.title} onChange={e => patch(item.id, {title: e.target.value})}/></label>
            <label>الوصف<input value={item.subtitle ?? ''} onChange={e => patch(item.id, {subtitle: e.target.value})}/></label>
            <label>الصفحة الرسمية (إطار احتياطي)<input dir="ltr" value={item.official_url} onChange={e => patch(item.id, {official_url: e.target.value})}/></label>
            <label>رابط HLS الرسمي (اختياري)<input dir="ltr" value={item.hls_url ?? ''} placeholder="https://…/playlist.m3u8" onChange={e => patch(item.id, {hls_url: e.target.value})}/></label>
            <label>الترتيب<input type="number" value={item.sort} onChange={e => patch(item.id, {sort: Math.round(Number(e.target.value) || 0)})}/></label>
            <button type="button" className="primary" disabled={!item.dirty || busyId !== null} onClick={() => void save(item)}>
              <Save size={15}/> {busyId === item.id ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>
        ))}
      </div>
    )}
  </fieldset>;
}

// مكتبة التفسير والترجمات: تنزيل المصادر على الجهاز للقراءة دون إنترنت،
// مع إظهار التقدم والحجم وإمكانية الحذف. المحتوى يُنزَّل للاستخدام الشخصي من
// مصدره المعلن (Quran Foundation) ولا يُعاد توزيعه.
import {useEffect, useMemo, useRef, useState} from 'react';
import {CheckCircle2, Download, HardDrive, Pause, Trash2} from 'lucide-react';
import type {QuranAsset} from '../../quran/types';
import {TAFSIRS, TRANSLATIONS} from '../../quran/content-api';
import {type OfflineKind, type PackMeta, listPacks, deletePack, getPack, storageEstimate} from '../../quran/offline-store';
import {downloadPack, TOTAL_CHAPTERS} from '../../quran/offline-download';
import {toArabicNumber} from '../../quran/content';
import {InternetBadge, useOnline} from '../../online';

type Props = {
  kind: OfflineKind;
  asset: QuranAsset;
  notify: (text: string) => void;
};

const SOURCE_LABEL: Record<OfflineKind, {title: string; intro: string}> = {
  tafsir: {
    title: 'مكتبة التفسير',
    intro: 'نزّل التفاسير على جهازك مرة واحدة، ثم اقرأها كاملة دون إنترنت. يمكنك تنزيل المصحف كاملًا أو سورة محددة، وحذف أي مصدر متى شئت.',
  },
  translation: {
    title: 'مكتبة الترجمات',
    intro: 'ترجمات معتمدة من مصدرها المعلن. نزّل الترجمة التي تثق بها لتقرأها دون إنترنت، ويمكنك الاحتفاظ بأكثر من ترجمة في الوقت نفسه.',
  },
};

function formatBytes(bytes: number): string {
  if (!bytes) return '٠ بايت';
  if (bytes < 1024) return `${toArabicNumber(bytes)} بايت`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${toArabicNumber(mb.toFixed(1))} م.ب`;
  const kb = bytes / 1024;
  return `${toArabicNumber(Math.max(1, Math.round(kb)))} ك.ب`;
}

export default function OfflineLibrary({kind, asset, notify}: Props) {
  const online = useOnline();
  const [packs, setPacks] = useState<Record<number, PackMeta>>({});
  const [scope, setScope] = useState<'all' | number>('all');
  const [runningId, setRunningId] = useState<number | null>(null);
  const [targetCount, setTargetCount] = useState<number>(TOTAL_CHAPTERS);
  const [usage, setUsage] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sources = kind === 'tafsir' ? TAFSIRS : TRANSLATIONS;
  const label = SOURCE_LABEL[kind];

  const refresh = async () => {
    const all = await listPacks();
    const next: Record<number, PackMeta> = {};
    for (const pack of all) if (pack.kind === kind) next[pack.id] = pack;
    setPacks(next);
    setUsage(await storageEstimate());
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const scopeLabel = useMemo(() => {
    if (scope === 'all') return 'المصحف كاملًا (١١٤ سورة)';
    const surah = asset.surahs.find(item => item.n === scope);
    return surah ? `سورة ${surah.name} فقط` : 'سورة واحدة';
  }, [asset, scope]);

  const start = async (source: {id: number; name: string}) => {
    if (!online) { notify('التنزيل يحتاج اتصالًا بالإنترنت. القراءة تعمل دون اتصال بعد التنزيل.'); return; }
    if (runningId !== null) { notify('هناك تنزيل جارٍ بالفعل. أوقفه أولًا.'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningId(source.id);
    const chapters = scope === 'all' ? Array.from({length: TOTAL_CHAPTERS}, (_, index) => index + 1) : [Number(scope)];
    setTargetCount(chapters.length);
    if (scope !== 'all') {
      const current = await getPack(kind, source.id);
      if (current?.chapters.includes(Number(scope))) {
        notify('هذه السورة منزَّلة بالفعل لهذا المصدر.');
        setRunningId(null);
        abortRef.current = null;
        return;
      }
    }
    try {
      await downloadPack({
        kind, id: source.id, name: source.name,
        language: kind === 'tafsir' ? 'ar' : 'en',
        chapters, signal: controller.signal,
        onProgress: meta => setPacks(prev => ({...prev, [meta.id]: meta})),
      });
      notify(`اكتمل تنزيل ${source.name} (${scopeLabel}).`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') notify('أُوقف التنزيل. يمكنك الاستئناف لاحقًا من حيث توقف.');
      else notify('تعذر إكمال التنزيل. تحقق من الاتصال وأعد المحاولة.');
    } finally {
      setRunningId(null);
      abortRef.current = null;
      void refresh();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunningId(null);
  };

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`حذف ${name} المنزَّل من هذا الجهاز؟ ستحتاج إلى إنترنت لقراءته بعد ذلك.`)) return;
    await deletePack(kind, id);
    await refresh();
    notify('حُذف المحتوى المنزَّل.');
  };

  return <section className="panel offline-library">
    <header className="ol-head">
      <div>
        <h3><HardDrive size={18}/> {label.title}</h3>
        <p className="muted">{label.intro}</p>
      </div>
      {usage !== null && <span className="ol-usage">المستخدم على الجهاز: {formatBytes(usage)}</span>}
    </header>

    <div className="ol-scope">
      <label>نطاق التنزيل
        <select value={String(scope)} onChange={event => setScope(event.target.value === 'all' ? 'all' : Number(event.target.value))} disabled={runningId !== null}>
          <option value="all">المصحف كاملًا (١١٤ سورة)</option>
          {asset.surahs.map(surah => <option key={surah.n} value={surah.n}>سورة {surah.name}</option>)}
        </select>
      </label>
      <span className="muted small">{scopeLabel}</span>
      {!online && <InternetBadge/>}
    </div>

    <ul className="ol-list">
      {sources.map(source => {
        const pack = packs[source.id];
        const running = runningId === source.id;
        const done = pack && pack.chapters.length >= TOTAL_CHAPTERS;
        const partial = pack && pack.chapters.length > 0 && !done;
        const percent = pack ? Math.min(100, Math.round(pack.chapters.length / Math.max(1, targetCount) * 100)) : 0;
        return <li key={source.id} className="ol-row">
          <div className="ol-info">
            <strong>{source.name}</strong>
            <small className="muted">
              {source.language === 'ar' ? 'عربي' : source.language === 'en' ? 'إنجليزي' : source.language}
              {pack && pack.entries > 0 ? ` · ${toArabicNumber(pack.chapters.length)} سورة · ${formatBytes(pack.bytes)}` : ' · غير منزَّل'}
            </small>
            {running && <div className="ol-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{width: `${Math.max(3, percent)}%`}}/>
            </div>}
            {running && <small className="muted">{percent}٪ — جارٍ التنزيل…</small>}
          </div>
          <div className="ol-actions">
            {done ? <span className="ol-done"><CheckCircle2 size={15}/> متاح دون اتصال</span>
              : partial ? <span className="ol-done"><CheckCircle2 size={15}/> جزء منزَّل</span> : null}
            {running
              ? <button type="button" className="soft-btn" onClick={stop}><Pause size={15}/> إيقاف</button>
              : <button type="button" className="soft-btn" onClick={() => void start(source)} disabled={runningId !== null}>
                <Download size={15}/> {pack && pack.chapters.length > 0 && !done ? 'استئناف' : 'تنزيل'}
              </button>}
            {pack && pack.entries > 0 && !running && <button type="button" className="icon-btn" aria-label={`حذف ${source.name}`} onClick={() => void remove(source.id, source.name)}><Trash2 size={15}/></button>}
          </div>
        </li>;
      })}
    </ul>

    <p className="ol-foot muted small">
      المصدر: Quran Foundation Content API — النصوص تُنزَّل كما هي من مصدرها المعلن، وتُحفظ على هذا الجهاز فقط للاستخدام الشخصي.
      راجع ترخيص كل طبعة قبل أي إعادة نشر.
    </p>
  </section>;
}

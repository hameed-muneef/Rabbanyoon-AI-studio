// «من الحرمين الشريفين»: بث مباشر من قناتي القرآن الكريم والسنة النبوية
// (هيئة الإذاعة السعودية — علولاء). لا نقوم بتوزيع البث ولا تذييله؛ نعرض
// الصفحة الرسمية داخل إطار، أو رابط HLS الرسمي الذي يحدّده المدير — وعند
// فشل التشغيل المباشر نعود تلقائيًا إلى الصفحة الرسمية، وتبقى دائمًا رابطة
// «الموقع الرسمي» قابلة للفتح.

import {lazy, useEffect, useRef, useState} from 'react';
import {AlertTriangle, Expand, ExternalLink, MonitorPlay, RefreshCw, Satellite} from 'lucide-react';
import {loadHaramainChannels, type HaramainChannel} from '../haramain/channels';
import {InternetBadge, OfflineNotice, useOnline} from '../online';

// hls.js يُحمَّل كسولًا فقط عند توفّر رابط HLS رسمي.
const HlsPlayer = lazy(() => import('./HaramainHls'));

type Mode = 'embed' | 'hls';

function Player({channel, mode, onHlsFailed}: {channel: HaramainChannel; mode: Mode; onHlsFailed: () => void}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [frameState, setFrameState] = useState<'loading' | 'ready'>('loading');
  const [isFullscreen, setFullscreen] = useState(false);

  // حالة الإطار تعيد الضبط عند تغيّر القناة أو النمط.
  useEffect(() => {setFrameState('loading')}, [channel.id, mode]);

  // تتبّع وضع الشاشة الكاملة (Esc في المتصفح لا يمر عبر onClick).
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {/* قد يرفض المتصفح دون إطار مفعّل — لا شيء يتعطل */}
  };

  return (
    <div className={isFullscreen ? 'haramain-shell fullscreen' : 'haramain-shell'} ref={shellRef} data-testid="haramain-shell">
      <div className="haramain-screen">
        {mode === 'hls' && channel.hls_url
          ? <HlsPlayer src={channel.hls_url} onFatalError={onHlsFailed}/>
          : <iframe
              key={`${channel.id}:${mode}`}
              src={channel.official_url}
              title={channel.title}
              className="haramain-frame"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              onLoad={() => setFrameState('ready')}
            />}
        {mode === 'embed' && frameState === 'loading' && <div className="haramain-loading" role="status">جارٍ تحميل البث…</div>}
      </div>
      <div className="haramain-screen-actions">
        <button type="button" className="soft-btn" onClick={() => void toggleFullscreen()}>
          <Expand size={16}/> {isFullscreen ? 'الخروج من الشاشة الكاملة' : 'شاشة كاملة'}
        </button>
      </div>
    </div>
  );
}

export default function HaramainLive() {
  const online = useOnline();
  const [channels, setChannels] = useState<HaramainChannel[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hlsFailedIds, setHlsFailedIds] = useState<ReadonlySet<string>>(new Set());
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    void loadHaramainChannels().then(({channels: loaded}) => {
      if (!active) return;
      setChannels(loaded);
      setActiveId(current => loaded.some(channel => channel.id === current) ? current : loaded[0]?.id ?? '');
      setLoadState('ready');
    }).catch(() => {
      if (active) setLoadState('error');
    });
    return () => {active = false};
  }, [retry]);

  // أثناء عرض قسم الحرمين: السكرول يكون داخل الـ widget (الإطار) فقط،
  // ولا يُطبَّق على المنصة (الصفحة) ككل.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);
  const active = channels.find(channel => channel.id === activeId) ?? channels[0];
  const mode: Mode = active?.hls_url && !hlsFailedIds.has(active.id) ? 'hls' : 'embed';
  const onHlsFailed = () => {
    if (!active) return;
    setHlsFailedIds(old => new Set(old).add(active.id));
  };

  if (!online) {
    return <div className="haramain" dir="rtl">
      <header className="haramain-head">
        <span className="haramain-eyebrow"><MonitorPlay size={16}/> البث المباشر <InternetBadge/></span>
        <h1>من الحرمين الشريفين</h1>
      </header>
      <OfflineNotice title="البث المباشر يحتاج اتصالًا بالإنترنت" onRetry={() => setRetry(value => value + 1)}/>
    </div>;
  }

  if (loadState === 'loading') {
    return <div className="haramain" dir="rtl"><div className="auth-loading" role="status">جارٍ تحميل قنوات البث…</div></div>;
  }

  if (loadState === 'error' || !active) {
    return <div className="haramain" dir="rtl">
      <section className="panel haramain-error" role="alert">
        <AlertTriangle size={22}/>
        <h2>تعذّر تحميل قنوات البث</h2>
        <p>تحقق من الاتصال ثم أعد المحاولة، أو تابع البث مباشرة من الموقع الرسمي لعلولاء.</p>
        <div className="haramain-error-actions">
          <button type="button" className="primary" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16}/> إعادة المحاولة</button>
          <a className="soft-btn" href="https://aloula.sba.sa" target="_blank" rel="noreferrer noopener">الموقع الرسمي <ExternalLink size={15}/></a>
        </div>
      </section>
    </div>;
  }

  return <div className="haramain" dir="rtl">
    <header className="haramain-head">
      <span className="haramain-eyebrow"><MonitorPlay size={16}/> البث المباشر <InternetBadge/></span>
      <h1>من الحرمين الشريفين</h1>
      <p>نقل حيّ لصلوات الحرمين عبر قناتي القرآن الكريم والسنة النبوية — مصدر البث الرسمي: هيئة الإذاعة السعودية (علولاء).</p>
    </header>

    <div className="haramain-tabs" role="tablist" aria-label="اختيار القناة">
      {channels.map(channel => (
        <button key={channel.id} type="button" role="tab" aria-selected={channel.id === active.id}
          className={channel.id === active.id ? 'haramain-tab active' : 'haramain-tab'}
          onClick={() => setActiveId(channel.id)}>
          <Satellite size={16}/>
          <span><strong>{channel.title}</strong><small>{channel.subtitle ?? ''}</small></span>
        </button>
      ))}
    </div>

    <Player channel={active} mode={mode} onHlsFailed={onHlsFailed}/>
    {mode === 'embed' && channelHlsNote(active)}

    <p className="haramain-attribution">
      البث مملوك لهيئة الإذاعة السعودية ولا تُعاد نشره أو تنزيله؛ هذا العرض يفتح المصدر الرسمي فقط.
      <a href={active.official_url} target="_blank" rel="noreferrer noopener">فتح الموقع الرسمي <ExternalLink size={14}/></a>
    </p>
  </div>;
}

/** ملاحظة تظهر حين يتعذر رابط HLS المباشر فنعرض الصفحة الرسمية بدلًا منه */
function channelHlsNote(channel: HaramainChannel) {
  if (!channel.hls_url) return null;
  return <p className="haramain-fallback-note" role="status">تعذّر تشغيل البث المباشر هنا؛ نعرض الصفحة الرسمية الآن.</p>;
}

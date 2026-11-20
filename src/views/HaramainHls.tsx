// مشغّل HLS.js لرابط بث رسمي يحدّده المدير. يُستورد hls.js كسولًا (chunk مستقل)
// ولا يُستخدم إلا حين يوجد رابط m3u8. عند أي خطأ قاتل نبلّغ المكوّن الأعلى
// ليعود إلى عرض الصفحة الرسمية داخل إطار — بلا حالة تحميل لا نهائية.

import {useEffect, useRef, useState} from 'react';
import {Loader2} from 'lucide-react';

type Props = {
  src: string;
  /** خطأ قاتل (تعذر الشبكة/الرابط منتهي) — يعود العرض إلى الصفحة الرسمية */
  onFatalError: () => void;
};

export default function HaramainHls({src, onFatalError}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const failedRef = useRef(false);
  // آخر نسخة من المستمع كي لا يعاد إعداد المشغّل مع كل رسم للمكوّن الأعلى.
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;

  useEffect(() => {
    failedRef.current = false;
    setState('loading');
    const video = videoRef.current;
    if (!video) return;
    let destroy: (() => void) | undefined;
    let disposed = false;

    void import('hls.js').then(({default: Hls}) => {
      if (disposed || !videoRef.current) return;
      if (!Hls.isSupported()) {
        // Safari يدعم HLS أصلًا عبر <video src>.
        video.src = src;
      } else {
        const hls = new Hls({enableWorker: true, lowLatencyMode: false, backBufferLength: 90});
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || failedRef.current) return;
          failedRef.current = true;
          setState('error');
          onFatalErrorRef.current();
        });
        destroy = () => {hls.destroy()};
      }
      video.addEventListener('playing', onPlaying);
    }).catch(() => {
      if (!failedRef.current) {
        failedRef.current = true;
        setState('error');
        onFatalErrorRef.current();
      }
    });

    function onPlaying() {setState('playing')}

    return () => {
      disposed = true;
      videoRef.current?.removeEventListener('playing', onPlaying);
      destroy?.();
    };
  }, [src]);

  if (state === 'error') return null; // الأعلى يعرض الصفحة الرسمية بدلًا منه

  return <div className="haramain-hls">
    <video ref={videoRef} className="haramain-video" autoPlay playsInline controls muted/>
    {state === 'loading' && <div className="haramain-loading" role="status"><Loader2 size={22} className="spin"/>جارٍ تحميل البث…</div>}
  </div>;
}

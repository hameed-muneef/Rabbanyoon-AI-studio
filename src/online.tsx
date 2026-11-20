// فصل الميزات التي تحتاج إنترنت عن الميزات التي تعمل بلا اتصال.
// المصحف والتفسير المُنزَّل والترجمات المُنزَّلة تعمل محليًا؛ البث المباشر
// والتلاوات الصوتية وجلب تفسير جديد / ترجمة جديدة تحتاج اتصالًا.
import {useEffect, useState} from 'react';
import {Wifi, WifiOff} from 'lucide-react';

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}

/** شارة صغيرة تُلصق بجانب أي ميزة تحتاج إنترنت. */
export function InternetBadge({compact = false}: {compact?: boolean}) {
  return <span className="internet-badge" title="يتطلب اتصالًا بالإنترنت">
    <Wifi size={11} aria-hidden="true"/>{!compact && <span>يتطلب إنترنت</span>}
  </span>;
}

/** لوحة توضيحية تُعرض بدل الميزة عندما يكون الجهاز غير متصل. */
export function OfflineNotice({title, children, onRetry, retryLabel = 'إعادة المحاولة'}: {
  title: string;
  children?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return <section className="panel offline-notice" role="status" dir="rtl">
    <WifiOff size={22} aria-hidden="true"/>
    <h2>{title}</h2>
    <p>{children ?? 'هذه الميزة تعمل عبر الإنترنت فقط. اتصل بالشبكة ثم أعد المحاولة — بقية التطبيق (المصحف، الأذكار، المهام، المحاسبة) تعمل بلا اتصال.'}</p>
    {onRetry && <button type="button" className="soft-btn" onClick={onRetry}>{retryLabel}</button>}
  </section>;
}

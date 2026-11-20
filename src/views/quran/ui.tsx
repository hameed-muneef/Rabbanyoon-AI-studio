import type {ReactNode} from 'react';
import {ChevronLeft} from 'lucide-react';
import {toArabicNumber, verseBody, verseMarker} from '../../quran/content';

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } finally { area.remove(); }
  return Promise.resolve();
}

export async function shareText(text: string): Promise<'shared' | 'copied'> {
  const share = navigator.share;
  if (share) {
    try { await share.call(navigator, {text}); return 'shared'; } catch { /* user cancelled */ }
  }
  await copyText(text);
  return 'copied';
}

export function QuranVerseText({surah, ayah, text, hidden, className = ''}: {
  surah: number; ayah: number; text: string; hidden?: boolean; className?: string;
}) {
  const body = verseBody(text);
  return (
    <p className={`quran-verse-text ${className}`} data-surah={surah} data-ayah={ayah}>
      {hidden ? <span className="quran-verse-hidden" aria-label="آية مخفية للاختبار">••••••••••••</span> : body}
      <span className="quran-verse-marker" aria-label={`رقم الآية ${ayah}`}>{verseMarker(text) || `۝${toArabicNumber(ayah)}`}</span>
    </p>
  );
}

export function ReferenceBadge({children}:{children:ReactNode}) {
  return <span className="quran-reference">{children}</span>;
}

export function BackToSections({onClick}:{onClick:()=>void}) {
  return <button className="soft-btn quran-back" onClick={onClick}><ChevronLeft size={16}/> كل أقسام القرآن والسنة</button>;
}

export function EmptyNote({children}:{children:ReactNode}) {
  return <p className="muted quran-empty">{children}</p>;
}

export function ProgressBar({value,label}:{value:number;label:string}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="quran-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="quran-progress-track"><span style={{width: `${percent}%`}}/></div>
      <small>{toArabicNumber(percent)}٪</small>
    </div>
  );
}

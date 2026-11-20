// مبدّل المظهر: زر أيقونة (تلقائي → فاتح → داكن) مع سبانكت إعدادات مفصّل في الإعدادات.
import {useEffect, useState, type JSX} from 'react';
import {Monitor, Moon, Sun} from 'lucide-react';
import {
  APPEARANCE_EVENT, setAppearance, currentAppearance,
  type Appearance,
} from './appearance';

const ORDER: Appearance[] = ['system', 'light', 'dark'];
const LABEL: Record<Appearance, string> = {system: 'تلقائي (لون النظام)', light: 'نهاري', dark: 'ليلي'};

function subscribe(callback: () => void): () => void {
  window.addEventListener(APPEARANCE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useAppearance(): [Appearance, (next: Appearance) => void] {
  const [mode, setMode] = useState<Appearance>(() => currentAppearance());
  useEffect(() => subscribe(() => setMode(currentAppearance())), []);
  const change = (next: Appearance) => {
    setAppearance(next);
    setMode(next);
  };
  return [mode, change];
}

export function AppearanceToggle(): JSX.Element {
  const [mode, change] = useAppearance();
  const cycle = () => change(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      className="icon-btn appearance-toggle"
      aria-label={`المظهر: ${LABEL[mode]} — اضغط للتغيير`}
      title={`المظهر: ${LABEL[mode]}`}
      data-appearance-mode={mode}
      onClick={cycle}
    >
      <Icon size={18}/>
    </button>
  );
}

export function AppearancePanel(): JSX.Element {
  const [mode, change] = useAppearance();
  return (
    <section className="panel" aria-label="مظهر المنصة">
      <h3>مظهر المنصة</h3>
      <p className="muted small">«تلقائي» يتبع لون جهازك، ثم يمكنك اختيار النمط النهاري أو الليلي.</p>
      <div className="appearance-seg" role="radiogroup" aria-label="اختيار المظهر">
        {ORDER.map(option => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            className={mode === option ? 'selected' : ''}
            onClick={() => change(option)}
          >
            {option === 'system' ? <Monitor size={16}/> : option === 'light' ? <Sun size={16}/> : <Moon size={16}/>}
            {option === 'system' ? 'تلقائي' : option === 'light' ? 'نهاري' : 'ليلي'}
          </button>
        ))}
      </div>
    </section>
  );
}

// src/features/qibla/CompassDial.tsx
import { useEffect, useRef } from 'react';

interface Props {
  heading: number | null; // device heading (true north), degrees
  qibla: number; // qibla bearing, degrees
  digitalOnly?: boolean;
}

export default function CompassDial({ heading, qibla, digitalOnly }: Props) {
  const dialRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<number | null>(heading);
  headingRef.current = heading;

  useEffect(() => {
    if (digitalOnly) return;
    let raf = 0;
    const tick = () => {
      const h = headingRef.current;
      if (dialRef.current && h !== null) {
        dialRef.current.style.transform = `rotate(${-h}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [digitalOnly]);

  if (digitalOnly) {
    return (
      <div className="qibla-digital" aria-label="عرض رقمي">
        <div className="qibla-digital-row">
          <span>القبلة</span>
          <strong>{Math.round(qibla)}°</strong>
        </div>
        <div className="qibla-digital-row">
          <span>جهازك</span>
          <strong>{heading === null ? '—' : `${Math.round(heading)}°`}</strong>
        </div>
      </div>
    );
  }

  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <div className="qibla-compass" aria-label="بوصلة القبلة">
      <div className="qibla-marker-top" aria-hidden="true" />
      <div className="qibla-dial" ref={dialRef}>
        {ticks.map((t) => (
          <div
            key={t}
            className={`qibla-tick ${t % 30 === 0 ? 'major' : ''}`}
            style={{ transform: `rotate(${t}deg)` }}
          />
        ))}
        <span className="qibla-cardinal n">N</span>
        <span className="qibla-cardinal e">E</span>
        <span className="qibla-cardinal s">S</span>
        <span className="qibla-cardinal w">W</span>
        <div className="qibla-kaaba" style={{ transform: `rotate(${qibla}deg) translateY(-38%)` }}>
          <span className="qibla-kaaba-icon" aria-hidden="true">🕋</span>
        </div>
      </div>
    </div>
  );
}

// src/features/qibla/QiblaScreen.tsx
import { useEffect, useMemo, useState } from 'react';
import { Compass, MapPin, RotateCcw, Settings2 } from 'lucide-react';
import { useGeolocation, type GeoStatus } from '../../hooks/useGeolocation';
import { useCompassHeading } from '../../hooks/useCompassHeading';
import { qiblaBearing, distanceToKaabaKm, turnInstruction, bearingToCardinal } from '../../lib/qibla';
import { findNearestCity, searchCities, type QiblaCity } from '../../lib/qibla-cities';
import CompassDial from './CompassDial';

interface Props { notify?: (t: string) => void; }

export default function QiblaScreen({ notify }: Props) {
  const geo = useGeolocation(true);
  const [manualCity, setManualCity] = useState<QiblaCity | null>(null);
  const [query, setQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [digitalOnly, setDigitalOnly] = useState(false);
  const [showSteps, setShowSteps] = useState(true);

  // Effective coordinates: manual overrides GPS
  const coords = manualCity
    ? { latitude: manualCity.lat, longitude: manualCity.lon }
    : geo.coords;

  const compass = useCompassHeading(true, coords);

  const qibla = useMemo(() => (coords ? qiblaBearing(coords.latitude, coords.longitude) : 0), [coords]);
  const distance = useMemo(() => (coords ? distanceToKaabaKm(coords.latitude, coords.longitude) : 0), [coords]);
  const nearest = useMemo(() => (coords && !manualCity ? findNearestCity(coords.latitude, coords.longitude) : null), [coords, manualCity]);
  const turn = useMemo(() => (compass.heading === null ? null : turnInstruction(compass.heading, qibla)), [compass.heading, qibla]);
  const aligned = turn?.direction === 'aligned';

  useEffect(() => {
    if (!compass.hasSensor) setDigitalOnly(true);
  }, [compass.hasSensor]);

  // Haptic feedback on alignment
  useEffect(() => {
    if (!aligned) return;
    try { navigator.vibrate?.(40); } catch { /* ignore */ }
  }, [aligned]);

  const statusText = (s: GeoStatus): string => {
    switch (s) {
      case 'loading': return 'جارٍ تحديد موقعك…';
      case 'denied': return 'لم يُسمح بالوصول للموقع.';
      case 'unsupported': return 'تحديد الموقع غير مدعوم.';
      case 'error': return geo.error ?? 'تعذر تحديد الموقع.';
      default: return '';
    }
  };

  const handleSelectCity = (c: QiblaCity) => {
    setManualCity(c);
    setShowPicker(false);
    setQuery('');
    notify?.(`تم اختيار ${c.name}، ${c.country}`);
  };

  const handleUseGps = () => {
    setManualCity(null);
    geo.request();
  };

  const filtered = searchCities(query);

  return (
    <div className="qibla-page" dir="rtl">
      <div className="qibla-header">
        <h1><Compass size={22} /> اتجاه القبلة</h1>
        <p className="muted">وجّه هاتفك حتى يشير إلى الكعبة، ثم صلِّ.</p>
      </div>

      {showSteps && (
        <div className="qibla-steps" role="note">
          <div className="qibla-steps-head">
            <strong>3 خطوات سريعة</strong>
            <button className="qibla-steps-close" onClick={() => setShowSteps(false)} aria-label="إخفاء">✕</button>
          </div>
          <ol>
            <li>فعّل الموقع (أو اختر مدينتك).</li>
            <li>ضع الهاتف مسطحًا (أفقيًا) قدر الإمكان.</li>
            <li>دُر حتى يصير المؤشر أخضر.</li>
          </ol>
        </div>
      )}

      <div className="qibla-card">
        <CompassDial heading={compass.heading} qibla={qibla} digitalOnly={digitalOnly} />

        <div className={`qibla-status ${aligned ? 'aligned' : ''}`}>
          {aligned ? (
            <span className="qibla-aligned">أنت الآن باتجاه القبلة ✓</span>
          ) : compass.heading === null ? (
            <span>في انتظار اتجاه الجهاز…</span>
          ) : turn ? (
            <span>
              دُر {turn.direction === 'right' ? 'يمينًا' : 'يسارًا'} {turn.degrees}°
            </span>
          ) : null}
        </div>

        <div className="qibla-info">
          <div className="qibla-info-row">
            <span>زاوية القبلة</span>
            <strong>{Math.round(qibla)}° · {bearingToCardinal(qibla)}</strong>
          </div>
          <div className="qibla-info-row">
            <span>اتجاه جهازك</span>
            <strong>{compass.heading === null ? '—' : `${Math.round(compass.heading)}°`}</strong>
          </div>
          <div className="qibla-info-row">
            <span>المسافة إلى الكعبة</span>
            <strong>{Math.round(distance).toLocaleString('ar-EG')} كم</strong>
          </div>
          {coords && (
            <div className="qibla-info-row">
              <span>الموقع</span>
              <strong>
                {manualCity ? `${manualCity.name}، ${manualCity.country}` : (nearest ? `${nearest.name}، ${nearest.country}` : 'موقع GPS')}
                <small> ({coords.latitude.toFixed(3)}°, {coords.longitude.toFixed(3)}°{!manualCity && geo.coords ? ` · ±${Math.round(geo.coords.accuracy)}م` : ''})</small>
              </strong>
            </div>
          )}
        </div>
      </div>

      {compass.tooTilted && !digitalOnly && (
        <div className="qibla-banner warn">ضع الهاتف مسطحًا (أفقيًا) للحصول على دقة أفضل.</div>
      )}
      {!compass.hasSensor && !digitalOnly && (
        <div className="qibla-banner info">
          لا يوجد مستشعر بوصلة في هذا الجهاز/المتصفح. تم تفعيل العرض الرقمي.
        </div>
      )}
      {compass.status === 'needs-calibration' && (
        <div className="qibla-banner warn">
          حرّك الهاتف على شكل ∞ (رقم 8) لمعايرة البوصلة.
          <div className="qibla-calib-anim" aria-hidden="true" />
        </div>
      )}

      {(geo.status !== 'ready' || geo.error) && !manualCity && (
        <div className="qibla-banner info">
          {statusText(geo.status)} {geo.error && geo.status !== 'loading' ? geo.error : ''}
        </div>
      )}

      <div className="qibla-actions">
        <button className="soft-btn" onClick={handleUseGps} disabled={geo.status === 'loading'}>
          <MapPin size={16} /> استخدام موقعي (GPS)
        </button>
        <button className="soft-btn" onClick={() => setShowPicker((v) => !v)}>
          <Settings2 size={16} /> اختيار مدينة
        </button>
        <button className="soft-btn" onClick={() => setDigitalOnly((v) => !v)}>
          {digitalOnly ? 'إظهار البوصلة' : 'عرض رقمي فقط'}
        </button>
      </div>

      {geo.status === 'denied' || geo.status === 'unsupported' || geo.status === 'error' ? (
        <p className="muted small qibla-hint">
          على Android: تأكد من تفعيل صلاحيات الموقع (Settings → Apps → Al-Rabbaniyyun → Permissions → Location).
        </p>
      ) : null}

      {showPicker && (
        <div className="qibla-picker">
          <input
            type="search"
            className="qibla-picker-input"
            placeholder="ابحث عن مدينة…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="qibla-picker-list">
            {filtered.map((c) => (
              <li key={`${c.name}-${c.country}`}>
                <button onClick={() => handleSelectCity(c)}>
                  {c.name} <small>{c.country}</small>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="muted">لا نتائج.</li>}
          </ul>
        </div>
      )}

      {manualCity && (
        <button className="soft-btn qibla-reset" onClick={() => setManualCity(null)}>
          <RotateCcw size={16} /> العودة إلى GPS
        </button>
      )}

      <p className="muted small qibla-note">
        ملاحظة: دقة البوصلة تعتمد على مستشعر جهازك وتجنب المعادن/المغناطيس. الاتجاه يُصحَّح إلى الشمال الحقيقي via نموذج WMM (geomagnetism). على بعض الأجهزة قد يلزم معايرة (حركة ∞).
      </p>
    </div>
  );
}

// src/hooks/useGeolocation.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unsupported' | 'error';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
}

export interface GeoState {
  status: GeoStatus;
  coords: GeoCoords | null;
  error: string | null;
  request: () => void;
}

const STORAGE_KEY = 'rabbani-qibla-location-v1';

export function loadSavedLocation(): GeoCoords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GeoCoords>;
    if (typeof v.latitude !== 'number' || typeof v.longitude !== 'number') return null;
    return { latitude: v.latitude, longitude: v.longitude, accuracy: typeof v.accuracy === 'number' ? v.accuracy : 0 };
  } catch {
    return null;
  }
}

export function saveLocation(c: GeoCoords): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function useGeolocation(autoRequest = true): GeoState {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<GeoCoords | null>(loadSavedLocation());
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unsupported');
      setError('تحديد الموقع غير مدعوم في هذا المتصفح.');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('unsupported');
      setError('تحديد الموقع يتطلب اتصالًا آمنًا (HTTPS).');
      return;
    }
    setStatus('loading');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return;
        const c: GeoCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
        };
        setCoords(c);
        saveLocation(c);
        setStatus('ready');
      },
      (err) => {
        if (!mounted.current) return;
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('لم يُسمح بالوصول للموقع. يمكنك اختيار مدينتك يدويًا.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus('error');
          setError('تعذر تحديد موقعك. تحقق من GPS ثم أعد المحاولة.');
        } else {
          setStatus('error');
          setError('انتهت مهلة تحديد الموقع. أعد المحاولة.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (autoRequest) request();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, coords, error, request };
}

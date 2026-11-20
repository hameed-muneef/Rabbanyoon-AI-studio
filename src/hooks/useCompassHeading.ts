// src/hooks/useCompassHeading.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import * as geomagnetism from 'geomagnetism';

export type CompassStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'needs-calibration' | 'weak';

export interface CompassState {
  heading: number | null; // magnetic/true heading in degrees [0,360), null if unavailable
  status: CompassStatus;
  tilt: { beta: number; gamma: number } | null;
  tooTilted: boolean;
  requestPermission: () => Promise<void>;
  hasSensor: boolean;
}

const SMOOTH = 0.18; // low-pass factor

function normalizeAngle(deg: number): number {
  let r = deg % 360;
  if (r < 0) r += 360;
  return r;
}

// tilt-compensated heading from deviceorientation (alpha/beta/gamma)
function headingFromOrientation(alpha: number, beta: number, gamma: number): number {
  const d2r = Math.PI / 180;
  const a = alpha * d2r;
  const b = beta * d2r;
  const g = gamma * d2r;
  const cA = Math.cos(a), sA = Math.sin(a);
  const sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  const R00 = cA * cG - sA * sB * sG;
  const R10 = sA * cG + cA * sB * sG;
  const yaw = Math.atan2(R10, R00);
  return normalizeAngle((yaw * 180) / Math.PI);
}

function magneticDeclination(lat: number, lon: number): number {
  try {
    const model = geomagnetism.model(new Date());
    const pt = model.point([lat, lon, 0]);
    return pt.decl ?? 0;
  } catch {
    return 0;
  }
}

interface CompassProvider {
  isSupported(): boolean;
  start(cb: (h: number, beta: number, gamma: number, source: string) => void): void;
  stop(): void;
}

class WebCompassProvider implements CompassProvider {
  private handler: ((e: DeviceOrientationEvent) => void) | null = null;
  private fallbackTimer: number | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && ('DeviceOrientationEvent' in window);
  }

  start(cb: (h: number, beta: number, gamma: number, source: string) => void): void {
    let gotValidReading = false;
    const onEvent = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      const webkit = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkit === 'number' && Number.isFinite(webkit)) {
        gotValidReading = true;
        cb(normalizeAngle(webkit), beta, gamma, 'webkit');
        return;
      }
      const alpha = e.alpha;
      if (alpha === null || alpha === undefined) return;
      gotValidReading = true;
      const isAbs = (e as unknown as { absolute?: boolean }).absolute === true;
      const h = headingFromOrientation(alpha, beta, gamma);
      cb(h, beta, gamma, isAbs ? 'absolute' : 'relative');
    };

    this.handler = onEvent;
    const w = window as unknown as {
      addEventListener: (t: string, l: EventListener, c?: boolean) => void;
    };
    if ('ondeviceorientationabsolute' in window) {
      w.addEventListener('deviceorientationabsolute', onEvent as EventListener, true);
      this.fallbackTimer = window.setTimeout(() => {
        if (!gotValidReading && this.handler === onEvent) {
          w.addEventListener('deviceorientation', onEvent as EventListener, true);
        }
      }, 1500);
    } else {
      w.addEventListener('deviceorientation', onEvent as EventListener, true);
    }
  }

  stop(): void {
    if (this.fallbackTimer !== null) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.handler) {
      const w = window as unknown as {
        removeEventListener: (t: string, l: EventListener, c?: boolean) => void;
      };
      w.removeEventListener('deviceorientationabsolute', this.handler as EventListener, true);
      w.removeEventListener('deviceorientation', this.handler as EventListener, true);
      this.handler = null;
    }
  }
}

export function useCompassHeading(enabled: boolean, coords: { latitude: number; longitude: number } | null): CompassState {
  const [heading, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<CompassStatus>('idle');
  const [tilt, setTilt] = useState<{ beta: number; gamma: number } | null>(null);
  const [tooTilted, setTooTilted] = useState(false);
  const [hasSensor, setHasSensor] = useState(true);

  const smoothedRef = useRef<number | null>(null);
  const providerRef = useRef<CompassProvider | null>(null);
  const declRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const eventCountRef = useRef(0);
  const lastUpdateRef = useRef(0);

  // update declination when coords change
  useEffect(() => {
    if (coords) declRef.current = magneticDeclination(coords.latitude, coords.longitude);
  }, [coords]);

  const requestPermission = useCallback(async () => {
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DOE?.requestPermission === 'function') {
      try {
        await DOE.requestPermission();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    eventCountRef.current = 0;
    const provider = new WebCompassProvider();
    providerRef.current = provider;

    if (!provider.isSupported()) {
      setStatus('unsupported');
      setHasSensor(false);
      return;
    }

    setStatus('loading');

    const noSensorTimer = window.setTimeout(() => {
      if (eventCountRef.current === 0) {
        setHasSensor(false);
        setStatus('unsupported');
      }
    }, 2500);

    provider.start((h, beta, gamma, _source) => {
      eventCountRef.current += 1;
      if (!mountedRef.current) return;

      // tilt check
      const flat = (Math.abs(beta) < 30) || (Math.abs(beta) > 150);
      const tooTilted = !flat || Math.abs(gamma) > 45;
      setTooTilted(tooTilted);
      setTilt({ beta, gamma });

      // magnetic heading -> true heading via declination
      const trueH = normalizeAngle(h + declRef.current);

      // smoothing with wrap handling
      const prev = smoothedRef.current;
      let smoothed: number;
      if (prev === null) {
        smoothed = trueH;
      } else {
        let diff = trueH - prev;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        smoothed = normalizeAngle(prev + SMOOTH * diff);
      }
      smoothedRef.current = smoothed;

      // throttle state updates to ~8Hz
      const now = performance.now();
      if (now - lastUpdateRef.current > 120) {
        lastUpdateRef.current = now;
        setHeading(smoothed);
        setStatus('ready');
      }
    });

    return () => {
      mountedRef.current = false;
      window.clearTimeout(noSensorTimer);
      provider.stop();
      providerRef.current = null;
    };
  }, [enabled]);

  return { heading, status, tilt, tooTilted, requestPermission, hasSensor };
}

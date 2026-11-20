// src/lib/qibla.test.ts
import { describe, it, expect } from 'vitest';
import {
  qiblaBearing, haversineKm, distanceToKaabaKm, normalizeAngle,
  shortestAngularDifference, bearingToCardinal, turnInstruction, KAABA,
} from './qibla';

// القيم المرجعية: من مكتبة adhan (Qibla) v4.x — معتمدة على صيغة الدائرة العظمى.
// Source: adhan library Qibla(coordinates) (npm: adhan), which implements the
// initial-bearing formula to Makkah (21.4225N, 39.8262E).
const REF: Record<string, { lat: number; lon: number; bearing: number }> = {
  Cairo: { lat: 30.0444, lon: 31.2357, bearing: 136.1373 },
  Riyadh: { lat: 24.7136, lon: 46.6753, bearing: 243.7982 },
  Istanbul: { lat: 41.0082, lon: 28.9784, bearing: 151.6206 },
  London: { lat: 51.5074, lon: -0.1278, bearing: 118.9872 },
  NewYork: { lat: 40.7128, lon: -74.006, bearing: 58.4817 },
  Jakarta: { lat: -6.2088, lon: 106.8456, bearing: 295.1518 },
  Sydney: { lat: -33.8688, lon: 151.2093, bearing: 277.4996 },
};

describe('qiblaBearing', () => {
  for (const [name, v] of Object.entries(REF)) {
    it(`matches reference for ${name} (≤0.5°)`, () => {
      const got = qiblaBearing(v.lat, v.lon);
      expect(Math.abs(shortestAngularDifference(got, v.bearing))).toBeLessThanOrEqual(0.5);
    });
  }
  it('returns 0 inside Makkah', () => {
    expect(qiblaBearing(KAABA.latitude, KAABA.longitude)).toBe(0);
  });
  it('handles ±180 longitude', () => {
    const a = qiblaBearing(0, 179.9);
    const b = qiblaBearing(0, -179.9);
    expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });
  it('handles poles', () => {
    expect(Number.isFinite(qiblaBearing(89, 0))).toBe(true);
    expect(Number.isFinite(qiblaBearing(-89, 0))).toBe(true);
  });
  it('rejects invalid input', () => {
    expect(qiblaBearing(NaN, 0)).toBe(0);
    expect(qiblaBearing(0, NaN)).toBe(0);
    expect(qiblaBearing(100, 0)).toBe(0);
  });
});

describe('distanceToKaabaKm', () => {
  it('is ~0 at Kaaba', () => {
    expect(distanceToKaabaKm(KAABA.latitude, KAABA.longitude)).toBeLessThan(1);
  });
  it('Cairo ~1287 km', () => {
    const d = distanceToKaabaKm(30.0444, 31.2357);
    expect(d).toBeGreaterThan(1200);
    expect(d).toBeLessThan(1400);
  });
  it('haversine symmetry', () => {
    const a = haversineKm(0, 0, 10, 10);
    const b = haversineKm(10, 10, 0, 0);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('normalizeAngle', () => {
  it('normalizes negatives', () => expect(normalizeAngle(-30)).toBe(330));
  it('wraps 360', () => expect(normalizeAngle(360)).toBe(0));
  it('handles 720', () => expect(normalizeAngle(720)).toBe(0));
  it('NaN -> 0', () => expect(normalizeAngle(NaN)).toBe(0));
});

describe('shortestAngularDifference', () => {
  it('small', () => expect(shortestAngularDifference(10, 20)).toBe(10));
  it('wrap 359->0', () => expect(shortestAngularDifference(359, 1)).toBe(2));
  it('wrap 0->359', () => expect(shortestAngularDifference(1, 359)).toBe(-2));
  it('opposite', () => expect(shortestAngularDifference(0, 180)).toBe(180));
});

describe('bearingToCardinal', () => {
  it('N', () => expect(bearingToCardinal(0)).toBe('شمال'));
  it('E', () => expect(bearingToCardinal(90)).toBe('شرق'));
  it('S', () => expect(bearingToCardinal(180)).toBe('جنوب'));
  it('W', () => expect(bearingToCardinal(270)).toBe('غرب'));
});

describe('turnInstruction', () => {
  it('aligned within 3°', () => expect(turnInstruction(10, 12)).toEqual({ direction: 'aligned', degrees: 0 }));
  it('right', () => expect(turnInstruction(10, 40)).toEqual({ direction: 'right', degrees: 30 }));
  it('left', () => expect(turnInstruction(40, 10)).toEqual({ direction: 'left', degrees: 30 }));
  it('wrap', () => expect(turnInstruction(350, 10)).toEqual({ direction: 'right', degrees: 20 }));
});

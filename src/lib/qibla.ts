// src/lib/qibla.ts
// دوال نقية (pure) لحساب اتجاه القبلة والمسافة. بلا اعتماد على React/DOM.
// زاوية القبلة: Initial Bearing (الدائرة العظمى) إلى الكعبة.
// الإحداثيات المرجعية للكعبة (مصدر: adhan library / Umm al-Qura).
export const KAABA = { latitude: 21.422487, longitude: 39.826206 } as const;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** تطبيع زاوية إلى [0,360). */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let r = deg % 360;
  if (r < 0) r += 360;
  return r;
}

/** أقصر فرق زاوية بين اتجاهين ( signed، في [-180,180] ). */
export function shortestAngularDifference(from: number, to: number): number {
  const a = normalizeAngle(to) - normalizeAngle(from);
  if (a > 180) return a - 360;
  if (a < -180) return a + 360;
  return a;
}

/** زاوية القبلة (Initial Bearing) من (lat,lon) إلى الكعبة، بالدرجات [0,360). */
export function qiblaBearing(lat: number, lon: number): number {
  // حالات حدية
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return 0;
  // المستخدم داخل/قرب الكعبة
  const dLat = Math.abs(lat - KAABA.latitude);
  const dLon = Math.abs(lon - KAABA.longitude);
  if (dLat < 1e-6 && dLon < 1e-6) return 0;

  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.latitude);
  const dLambda = toRad(KAABA.longitude - lon);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return normalizeAngle(toDeg(theta));
}

/** مسافة Haversine (كم) بين نقطتين. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const R = 6371; // كم
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** مسافة إلى الكعبة (كم). */
export function distanceToKaabaKm(lat: number, lon: number): number {
  return haversineKm(lat, lon, KAABA.latitude, KAABA.longitude);
}

/** تحويل زاوية [0,360) إلى اتجاه 8 نقاط (N, NE, E, ...). */
export function bearingToCardinal(deg: number): string {
  const dirs = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
  const idx = Math.round(normalizeAngle(deg) / 45) % 8;
  return dirs[idx];
}

/** وصف "دُر يمينًا/يسارًا X°". */
export function turnInstruction(deviceHeading: number, qibla: number): { direction: 'right' | 'left' | 'aligned'; degrees: number } {
  const diff = shortestAngularDifference(deviceHeading, qibla);
  const abs = Math.abs(diff);
  if (abs <= 3) return { direction: 'aligned', degrees: 0 };
  return { direction: diff > 0 ? 'right' : 'left', degrees: Math.round(abs) };
}

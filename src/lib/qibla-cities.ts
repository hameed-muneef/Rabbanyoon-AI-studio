// src/lib/qibla-cities.ts
// قائمة مدن مضمّنة (Offline) لاختيار موقع يدوي. بيانات تقريبية (lat, lon).
export interface QiblaCity { name: string; country: string; lat: number; lon: number; }

export const QIBLA_CITIES: QiblaCity[] = [
  { name: 'مكة المكرمة', country: 'السعودية', lat: 21.4225, lon: 39.8262 },
  { name: 'المدينة المنورة', country: 'السعودية', lat: 24.4686, lon: 39.6142 },
  { name: 'الرياض', country: 'السعودية', lat: 24.7136, lon: 46.6753 },
  { name: 'جدة', country: 'السعودية', lat: 21.4858, lon: 39.1925 },
  { name: 'الدمام', country: 'السعودية', lat: 26.4207, lon: 50.0888 },
  { name: 'أبها', country: 'السعودية', lat: 18.2164, lon: 42.5053 },
  { name: 'تبوك', country: 'السعودية', lat: 28.3838, lon: 36.5662 },
  { name: 'القاهرة', country: 'مصر', lat: 30.0444, lon: 31.2357 },
  { name: 'الإسكندرية', country: 'مصر', lat: 31.2001, lon: 29.9187 },
  { name: 'الجيزة', country: 'مصر', lat: 30.0131, lon: 31.2089 },
  { name: 'أسوان', country: 'مصر', lat: 24.0889, lon: 32.8998 },
  { name: 'بغداد', country: 'العراق', lat: 33.3128, lon: 44.3615 },
  { name: 'البصرة', country: 'العراق', lat: 30.5085, lon: 47.7804 },
  { name: 'أربيل', country: 'العراق', lat: 36.1911, lon: 44.0093 },
  { name: 'دمشق', country: 'سوريا', lat: 33.5138, lon: 36.2765 },
  { name: 'حلب', country: 'سوريا', lat: 36.2021, lon: 37.1343 },
  { name: 'بيروت', country: 'لبنان', lat: 33.8938, lon: 35.5018 },
  { name: 'عمّان', country: 'الأردن', lat: 31.9454, lon: 35.9284 },
  { name: 'القدس', country: 'فلسطين', lat: 31.7683, lon: 35.2137 },
  { name: 'غزة', country: 'فلسطين', lat: 31.5017, lon: 34.4668 },
  { name: 'الكويت', country: 'الكويت', lat: 29.3759, lon: 47.9774 },
  { name: 'الدوحة', country: 'قطر', lat: 25.2854, lon: 51.531 },
  { name: 'أبوظبي', country: 'الإمارات', lat: 24.4539, lon: 54.3773 },
  { name: 'دبي', country: 'الإمارات', lat: 25.2048, lon: 55.2708 },
  { name: 'مسقط', country: 'عمان', lat: 23.588, lon: 58.3829 },
  { name: 'صنعاء', country: 'اليمن', lat: 15.3694, lon: 44.191 },
  { name: 'عدن', country: 'اليمن', lat: 12.7855, lon: 45.0187 },
  { name: 'المنامة', country: 'البحرين', lat: 26.2285, lon: 50.586 },
  { name: 'طهران', country: 'إيران', lat: 35.6892, lon: 51.389 },
  { name: 'كابول', country: 'أفغانستان', lat: 34.5553, lon: 69.2075 },
  { name: 'إسلام آباد', country: 'باكستان', lat: 33.6844, lon: 73.0479 },
  { name: 'كراشي', country: 'باكستان', lat: 24.8607, lon: 67.0011 },
  { name: 'لاهور', country: 'باكستان', lat: 31.5204, lon: 74.3587 },
  { name: 'نيودلهي', country: 'الهند', lat: 28.6139, lon: 77.209 },
  { name: 'مومباي', country: 'الهند', lat: 19.076, lon: 72.8777 },
  { name: 'دكا', country: 'بنغلاديش', lat: 23.8103, lon: 90.4125 },
  { name: 'جاكرتا', country: 'إندونيسيا', lat: -6.2088, lon: 106.8456 },
  { name: 'كوالالمبور', country: 'ماليزيا', lat: 3.139, lon: 101.6869 },
  { name: 'سنغافورة', country: 'سنغافورة', lat: 1.3521, lon: 103.8198 },
  { name: 'إسطنبول', country: 'تركيا', lat: 41.0082, lon: 28.9784 },
  { name: 'أنقرة', country: 'تركيا', lat: 39.9334, lon: 32.8597 },
  { name: 'الخرطوم', country: 'السودان', lat: 15.5007, lon: 32.5599 },
  { name: 'نواكشوط', country: 'موريتانيا', lat: 18.0735, lon: -15.9582 },
  { name: 'الرباط', country: 'المغرب', lat: 34.0209, lon: -6.8416 },
  { name: 'الدار البيضاء', country: 'المغرب', lat: 33.5731, lon: -7.5898 },
  { name: 'الجزائر', country: 'الجزائر', lat: 36.7538, lon: 3.0588 },
  { name: 'تونس', country: 'تونس', lat: 36.8065, lon: 10.1815 },
  { name: 'طرابلس', country: 'ليبيا', lat: 32.8872, lon: 13.1913 },
  { name: 'القاهرة', country: 'مصر', lat: 30.0444, lon: 31.2357 },
  { name: 'نيامي', country: 'النيجر', lat: 13.5116, lon: 2.1254 },
  { name: 'أبوجا', country: 'نيجيريا', lat: 9.0765, lon: 7.3986 },
  { name: 'القاهرة', country: 'مصر', lat: 30.0444, lon: 31.2357 },
  { name: 'لندن', country: 'المملكة المتحدة', lat: 51.5074, lon: -0.1278 },
  { name: 'باريس', country: 'فرنسا', lat: 48.8566, lon: 2.3522 },
  { name: 'برلين', country: 'ألمانيا', lat: 52.52, lon: 13.405 },
  { name: 'روما', country: 'إيطاليا', lat: 41.9028, lon: 12.4964 },
  { name: 'مدريد', country: 'إسبانيا', lat: 40.4168, lon: -3.7038 },
  { name: 'موسكو', country: 'روسيا', lat: 55.7558, lon: 37.6173 },
  { name: 'نيويورك', country: 'الولايات المتحدة', lat: 40.7128, lon: -74.006 },
  { name: 'لوس أنجلوس', country: 'الولايات المتحدة', lat: 34.0522, lon: -118.2437 },
  { name: 'شيكاغو', country: 'الولايات المتحدة', lat: 41.8781, lon: -87.6298 },
  { name: 'تورونتو', country: 'كندا', lat: 43.6532, lon: -79.3832 },
  { name: 'سيدني', country: 'أستراليا', lat: -33.8688, lon: 151.2093 },
  { name: 'ملبورن', country: 'أستراليا', lat: -37.8136, lon: 144.9631 },
  { name: 'طوكيو', country: 'اليابان', lat: 35.6762, lon: 139.6503 },
  { name: 'بكين', country: 'الصين', lat: 39.9042, lon: 116.4074 },
  { name: 'جاكرتا', country: 'إندونيسيا', lat: -6.2088, lon: 106.8456 },
];

export function findNearestCity(lat: number, lon: number): QiblaCity | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: QiblaCity | null = null;
  let bestD = Infinity;
  for (const c of QIBLA_CITIES) {
    const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function searchCities(query: string): QiblaCity[] {
  const q = query.trim().toLowerCase();
  if (!q) return QIBLA_CITIES.slice(0, 30);
  return QIBLA_CITIES.filter((c) =>
    c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
  ).slice(0, 40);
}

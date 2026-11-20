import type {AzkarAsset} from './types';

const BASE = '/azkar/';

let cached: Promise<AzkarAsset> | null = null;

export function loadAzkar(): Promise<AzkarAsset> {
  if (!cached) {
    cached = Promise.all([
      fetch(`${BASE}ar.json`).then(r => { if (!r.ok) throw new Error('تعذر تحميل الأذكار العربية.'); return r.json(); }),
      fetch(`${BASE}en.json`).then(r => { if (!r.ok) throw new Error('تعذر تحميل الأذكار الإنجليزية.'); return r.json(); }),
      fetch(`${BASE}tr.json`).then(r => { if (!r.ok) throw new Error('تعذر تحميل الأذكار التركية.'); return r.json(); })
    ]).then(([ar, en, tr]) => {
      if (!Array.isArray(ar) || !Array.isArray(en) || !Array.isArray(tr)) throw new Error('أصل الأذكار غير مكتمل.');
      if (ar.length < 100) throw new Error('أصل الأذكار غير مكتمل.');
      return {ar, en, tr} as AzkarAsset;
    }).catch(error => { cached = null; throw error; });
  }
  return cached;
}

export function resetAzkarCache() { cached = null; }

export const AZKAR_AUDIO_BASE = 'https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main';

export function azkarAudioUrl(path?: string): string | null {
  if (!path) return null;
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${AZKAR_AUDIO_BASE}/${clean}`;
}

import type {HadithAsset} from './types';

const BASE = '/hadith/';

let cache: Record<string, Promise<HadithAsset>> = {};

export function loadHadith(collection: 'bukhari' | 'muslim'): Promise<HadithAsset> {
  if (!cache[collection]) {
    cache[collection] = fetch(`${BASE}${collection}.json`)
      .then(r => { if (!r.ok) throw new Error('تعذر تحميل الأحاديث.'); return r.json(); })
      .then((a: HadithAsset) => {
        if (!Array.isArray(a.hadiths) || a.hadiths.length < 1000) throw new Error('أصل الأحاديث غير مكتمل.');
        return a;
      })
      .catch(e => { delete cache[collection]; throw e; });
  }
  return cache[collection];
}

export function resetHadithCache(collection?: 'bukhari' | 'muslim') {
  if (collection) delete cache[collection]; else cache = {};
}

export function hadithAudioUrl(): null { return null; }

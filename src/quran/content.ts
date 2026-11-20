import type {QuranAsset, QuranSurah, QuranVerse} from './types';

let cached: Promise<QuranAsset> | null = null;
let loaded: QuranAsset | null = null;
let index: Map<string, QuranVerse> | null = null;

export function loadQuran(): Promise<QuranAsset> {
  if (!cached) {
    cached = fetch('/quran/quran-hafs-uthmani.json')
      .then(response => {
        if (!response.ok) throw new Error('تعذر تحميل نص المصحف المعتمد.');
        return response.json() as Promise<QuranAsset>;
      })
      .then(asset => {
        if (asset.counts.surahs !== 114 || asset.counts.verses !== 6236) {
          throw new Error('أصل المصحف غير مكتمل؛ أُوقف العرض.');
        }
        loaded = asset;
        index = null;
        return asset;
      })
      .catch(error => { cached = null; throw error; });
  }
  return cached;
}

export function currentQuran(): QuranAsset | null { return loaded; }

export function resetQuranCache() { cached = null; loaded = null; index = null; }

export const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toArabicNumber = (value: number | string) => String(value).replace(/[0-9]/g, digit => ARABIC_DIGITS[Number(digit)]);
export const fromArabicNumber = (value: string) => value.replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)));

export const verseKey = (surah: number, ayah: number) => `${surah}:${ayah}`;
const END_MARKER = /\s*\u06DD[\u0660-\u0669]+\s*$/;

// Removes only the end-of-verse marker for display/interaction. The stored asset
// keeps the exact source text untouched.
export function verseBody(text: string): string {
  return text.replace(END_MARKER, '').trim();
}

export function verseMarker(text: string): string {
  const match = text.match(/\u06DD[\u0660-\u0669]+/);
  return match ? match[0] : '';
}

export function verseIndex(asset: QuranAsset): Map<string, QuranVerse> {
  if (!index) index = new Map(asset.verses.map(verse => [verseKey(verse.s, verse.a), verse]));
  return index;
}

export function findVerse(asset: QuranAsset, surah: number, ayah: number): QuranVerse | undefined {
  return verseIndex(asset).get(verseKey(surah, ayah));
}

export function surahInfo(asset: QuranAsset, number: number): QuranSurah | undefined {
  return asset.surahs.find(surah => surah.n === number);
}

export function surahVerses(asset: QuranAsset, number: number): QuranVerse[] {
  return asset.verses.filter(verse => verse.s === number);
}

export function basmalaText(asset: QuranAsset): string {
  const first = findVerse(asset, 1, 1);
  return first ? verseBody(first.t) : '';
}

export const showsBasmala = (surah: number) => surah !== 1 && surah !== 9;

export function navigationTarget(asset: QuranAsset, kind: 'juz' | 'hizb' | 'page', value: number): QuranVerse | undefined {
  return asset.verses.find(verse => kind === 'juz' ? verse.j === value : kind === 'hizb' ? verse.h === value : verse.p === value);
}

export function referenceLabel(asset: QuranAsset, surah: number, ayah: number, ayahEnd?: number): string {
  const name = surahInfo(asset, surah)?.name ?? `سورة ${surah}`;
  return ayahEnd && ayahEnd !== ayah ? `${name}: ${toArabicNumber(ayah)}–${toArabicNumber(ayahEnd)}` : `${name}: ${toArabicNumber(ayah)}`;
}

export function rangeVerses(asset: QuranAsset, start: QuranVerse, end: QuranVerse): QuranVerse[] {
  const first = asset.verses.indexOf(start);
  const last = asset.verses.indexOf(end);
  if (first === -1 || last === -1 || last < first) return [];
  return asset.verses.slice(first, last + 1);
}

// Validation-only search form. It never touches the stored or displayed text.
export function normalizeSearch(value: string): string {
  return value.normalize('NFC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0621\u0654\u0655]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SearchResult = {verse: QuranVerse; surahName: string; body: string};

export function searchVerses(asset: QuranAsset, query: string, limit = 60): SearchResult[] {
  const normalized = normalizeSearch(query);
  if (normalized.length < 2) return [];
  const words = normalized.split(' ').filter(Boolean);
  const results: SearchResult[] = [];
  for (const verse of asset.verses) {
    const haystack = normalizeSearch(verse.e);
    if (words.every(word => haystack.includes(word))) {
      results.push({verse, surahName: surahInfo(asset, verse.s)?.name ?? '', body: verseBody(verse.t)});
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function parseReference(value: string): {surah: number; ayah: number} | null {
  const match = value.trim().match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/);
  if (!match) return null;
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  return surah >= 1 && surah <= 114 && ayah >= 1 ? {surah, ayah} : null;
}

export function relativeVerse(asset: QuranAsset, verse: QuranVerse, delta: number): QuranVerse | undefined {
  const position = asset.verses.indexOf(verse);
  return position === -1 ? undefined : asset.verses[position + delta];
}

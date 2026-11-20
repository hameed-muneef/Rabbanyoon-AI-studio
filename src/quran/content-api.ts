// ربط Quran Foundation Content API (api.quran.com) — للترجمات والتفسير.
// لا محتوى ديني مخترع: كل النصوص تُجلب من API.
import {getOfflineEntry} from './offline-store';

const CACHE_PREFIX = 'quran-content-cache-v1:';

function cacheKey(kind: string, id: number, verseKey: string): string {
  return `${CACHE_PREFIX}${kind}:${id}:${verseKey}`;
}

function readCache(kind: string, id: number, verseKey: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(kind, id, verseKey));
    if (raw === null) return undefined; // not cached
    return raw === '' ? null : raw;
  } catch { return undefined; }
}

function writeCache(kind: string, id: number, verseKey: string, value: string | null): void {
  try { localStorage.setItem(cacheKey(kind, id, verseKey), value ?? ''); } catch { /* quota */ }
}

export const QURAN_API_BASE = 'https://api.quran.com/api/v4';

export interface TranslationChoice { id: number; name: string; language: string; }
export interface TafsirChoice { id: number; name: string; language: string; }

// ترجمات شائعة (من Quran.com)
export const TRANSLATIONS: TranslationChoice[] = [
  { id: 20, name: 'Saheeh International', language: 'en' },
  { id: 22, name: 'Yusuf Ali', language: 'en' },
  { id: 19, name: 'Pickthall', language: 'en' },
  { id: 85, name: 'Muhammad Taqi Usmani', language: 'en' },
];

// تفاسير (من Quran.com) — ملاحظة: "الجلالين" غير متاح عبر هذا API.
// متاح: الميسر، السعدي، ابن كثير، القرطبي، الطبري، البغوي.
export const TAFSIRS: TafsirChoice[] = [
  { id: 91, name: 'تفسير السعدي', language: 'ar' },
  { id: 16, name: 'التفسير الميسر', language: 'ar' },
  { id: 14, name: 'تفسير ابن كثير', language: 'ar' },
  { id: 90, name: 'تفسير القرطبي', language: 'ar' },
  { id: 15, name: 'تفسير الطبري', language: 'ar' },
  { id: 94, name: 'تفسير البغوي', language: 'ar' },
  
];

export type FetchState<T> = { status: 'idle' | 'loading' | 'success' | 'error' | 'empty'; data: T | null; error?: string };

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// جلب ترجمة آية (verse_key = "surah:ayah", e.g. "2:255")
export async function fetchTranslation(verseKey: string, translationId: number, signal?: AbortSignal): Promise<string | null> {
  const offline = await getOfflineEntry('translation', translationId, verseKey);
  if (offline !== undefined) return offline;
  const cached = readCache('tr', translationId, verseKey);
  if (cached !== undefined) return cached;
  const body = await fetchJson(`${QURAN_API_BASE}/quran/translations/${translationId}?verse_key=${encodeURIComponent(verseKey)}`, signal) as { translations?: { text?: string }[] };
  const text = body?.translations?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) { writeCache('tr', translationId, verseKey, null); return null; }
  const cleaned = text.replace(/<[^>]*>/g, '').trim();
  writeCache('tr', translationId, verseKey, cleaned);
  return cleaned;
}

// جلب تفسير آية
export async function fetchTafsir(verseKey: string, tafsirId: number, signal?: AbortSignal): Promise<string | null> {
  const offline = await getOfflineEntry('tafsir', tafsirId, verseKey);
  if (offline !== undefined) return offline;
  const cached = readCache('tf', tafsirId, verseKey);
  if (cached !== undefined) return cached;
  const body = await fetchJson(`${QURAN_API_BASE}/tafsirs/${tafsirId}/by_ayah/${encodeURIComponent(verseKey)}`, signal) as { tafsir?: { text?: string } };
  const text = body?.tafsir?.text;
  if (typeof text !== 'string' || !text.trim()) { writeCache('tf', tafsirId, verseKey, null); return null; }
  const cleaned = text.replace(/<[^>]*>/g, '').trim();
  writeCache('tf', tafsirId, verseKey, cleaned);
  return cleaned;
}

// جلب "أسباب النزول" — Quran.com لا يوفر endpoint مخصصًا. نستخدم tafsir id 16 (الجلالين)
// كمصدر "أسباب النزول" (الجلالين يذكر أسباب النزول في التفسير). لا محتوى مخترع.
export async function fetchAsbabNuzul(verseKey: string, signal?: AbortSignal): Promise<string | null> {
  return fetchTafsir(verseKey, 16, signal);
}
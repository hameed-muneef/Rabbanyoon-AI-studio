// محرّك تنزيل التفسير والترجمات حفظًا على الجهاز، سورةً سورة، مع إمكانية
// التوقف والاستئناف. المصدر Quran Foundation Content API (api.quran.com).
import {type OfflineKind, type PackMeta, packKey, getPack, putChapter, startPack} from './offline-store';

const API = 'https://api.quran.com/api/v4';
const TOTAL_CHAPTERS = 114;

export type DownloadRequest = {
  kind: OfflineKind;
  id: number;
  name: string;
  language: string;
  chapters: number[];
  signal: AbortSignal;
  onProgress: (meta: PackMeta) => void;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cleanText(raw: string): string {
  return raw
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) throw new DOMException('أُوقف التنزيل', 'AbortError');
    try {
      const response = await fetch(url, {signal, headers: {Accept: 'application/json'}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw new DOMException('أُوقف التنزيل', 'AbortError');
      lastError = error;
      await sleep(400);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('تعذر الاتصال بالمصدر.');
}

type TafsirResponse = {tafsirs?: {verse_key?: string; text?: string}[]; pagination?: {next_page?: number | null}};
type TranslationResponse = {translations?: {text?: string}[]};

async function fetchTafsirChapter(id: number, chapter: number, signal: AbortSignal) {
  const items: {verseKey: string; text: string}[] = [];
  let page = 1;
  for (let guard = 0; guard < 20; guard += 1) {
    const body = await getJson(`${API}/tafsirs/${id}/by_chapter/${chapter}?per_page=100&page=${page}`, signal) as TafsirResponse;
    for (const entry of body.tafsirs ?? []) {
      if (!entry.verse_key || !entry.text) continue;
      const text = cleanText(entry.text);
      if (text) items.push({verseKey: entry.verse_key, text});
    }
    const next = body.pagination?.next_page;
    if (!next) break;
    page = next;
  }
  return items;
}

async function fetchTranslationChapter(id: number, chapter: number, signal: AbortSignal) {
  const body = await getJson(`${API}/quran/translations/${id}?chapter_number=${chapter}`, signal) as TranslationResponse;
  const items: {verseKey: string; text: string}[] = [];
  (body.translations ?? []).forEach((entry, index) => {
    if (!entry.text) return;
    const text = cleanText(entry.text);
    if (text) items.push({verseKey: `${chapter}:${index + 1}`, text});
  });
  return items;
}

export async function downloadPack({kind, id, name, language, chapters, signal, onProgress}: DownloadRequest): Promise<PackMeta> {
  const key = packKey(kind, id);
  const existing = await getPack(kind, id);
  const meta: PackMeta = existing ?? {
    key, kind, id, name, language,
    status: 'downloading', chapters: [], entries: 0, bytes: 0,
    updatedAt: new Date().toISOString(),
  };
  meta.status = 'downloading';
  meta.error = undefined;
  await startPack(meta);
  onProgress({...meta});

  const targets = [...new Set(chapters)].filter(chapter => chapter >= 1 && chapter <= TOTAL_CHAPTERS).sort((a, b) => a - b);
  for (const chapter of targets) {
    if (signal.aborted) {
      meta.status = 'idle';
      meta.updatedAt = new Date().toISOString();
      await startPack(meta);
      onProgress({...meta});
      throw new DOMException('أُوقف التنزيل', 'AbortError');
    }
    if (meta.chapters.includes(chapter)) continue;
    const items = kind === 'tafsir'
      ? await fetchTafsirChapter(id, chapter, signal)
      : await fetchTranslationChapter(id, chapter, signal);
    if (items.length) {
      const {bytes, entries} = await putChapter(kind, id, chapter, items);
      meta.bytes += bytes;
      meta.entries += entries;
    }
    meta.chapters = [...meta.chapters, chapter];
    meta.updatedAt = new Date().toISOString();
    await startPack(meta);
    onProgress({...meta});
    await sleep(120);
  }

  const allDone = meta.chapters.length >= TOTAL_CHAPTERS;
  meta.status = allDone ? 'done' : 'idle';
  meta.updatedAt = new Date().toISOString();
  await startPack(meta);
  onProgress({...meta});
  return meta;
}

export {TOTAL_CHAPTERS};

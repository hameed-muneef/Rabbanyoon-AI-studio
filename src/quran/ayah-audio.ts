// تلاوة على مستوى الآية (per-ayah) من Quran.com API v4
// يوفر روابط صوتية لكل آية على حدة (بدقة تلاوة الآية).
// يُستخدم إلى جانب تلاوة MP3Quran.net (على مستوى السورة).

export type AyahAudioResult = {verseKey: string; url: string};

const BASE_AUDIO = 'https://verses.quran.com/';
const CACHE = new Map<string, string>();

export type QuranComReciter = {id: number; name: string; style?: string | null};

export const QURAN_COM_RECITERS: QuranComReciter[] = [
  {id: 7, name: 'مشاري راشد العفاسي'},
  {id: 3, name: 'عبدالرحمن السديس'},
  {id: 4, name: 'أبو بكر الشاطرى'},
  {id: 5, name: 'هاني الرفاعي'},
  {id: 10, name: 'سعود الشريم'},
  {id: 11, name: 'محمد الطبلاوي'},
  {id: 2, name: 'عبد الباسط عبد الصمد (مرتل)'},
  {id: 1, name: 'عبد الباسط عبد الصمد (مجود)'},
  {id: 6, name: 'محمود خليل الحصري'},
  {id: 12, name: 'محمود خليل الحصري (معلم)'},
  {id: 9, name: 'محمد صديق المنشاوي (مرتل)'},
  {id: 8, name: 'محمد صديق المنشاوي (مجود)'},
];

export const DEFAULT_RECITATION_ID = 7;

export async function fetchAyahAudioUrl(recitationId: number, surah: number, ayah: number): Promise<string | null> {
  const key = `${recitationId}:${surah}:${ayah}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  try {
    const res = await fetch(`https://api.quran.com/api/v4/recitations/${recitationId}/by_ayah/${surah}:${ayah}`);
    if (!res.ok) return null;
    const json = await res.json();
    const url = json?.audio_files?.[0]?.url;
    if (url) {
      let full = String(url);
      if (full.startsWith('//')) full = 'https:' + full;
      else if (!full.startsWith('http')) full = `${BASE_AUDIO}${full.replace(/^\/+/, '')}`;
      // collapse accidental triple slashes in the path
      full = full.replace(/([^:])\/\/+/g, '$1/');
      CACHE.set(key, full);
      return full;
    }
    return null;
  } catch {
    return null;
  }
}

// جلب صوت سورة كاملة (ملف MP3 واحد) — لقراءة متواصلة بدون تقطّع بين الآيات.
export async function fetchChapterAudioUrl(recitationId: number, chapter: number): Promise<string | null> {
  const key = `ch:${recitationId}:${chapter}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  try {
    const res = await fetch(`https://api.quran.com/api/v4/chapter_recitations/${recitationId}/${chapter}`);
    if (!res.ok) return null;
    const json = await res.json();
    const url = json?.audio_file?.audio_url;
    if (url) {
      const full = String(url).startsWith('http') ? String(url) : `https:${String(url)}`;
      CACHE.set(key, full);
      return full;
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch a batch of ayahs for a surah (for sequential playback)
export async function fetchSurahAyahAudioUrls(recitationId: number, surah: number, _ayahs: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  // Quran.com API supports fetching all ayahs of a surah at once
  try {
    const res = await fetch(`https://api.quran.com/api/v4/recitations/${recitationId}/by_chapter/${surah}`);
    if (!res.ok) return result;
    const json = await res.json();
    for (const af of json?.audio_files ?? []) {
      const ak = af.verse_key?.split(':')[1];
      if (ak && af.url) {
        result.set(Number(ak), af.url.startsWith('http') ? af.url : `${BASE_AUDIO}${af.url}`);
      }
    }
  } catch { /* ignore */ }
  return result;
}

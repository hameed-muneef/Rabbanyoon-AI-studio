// خدمة تلاوة Qur'an من MP3Quran.net (API v3)
// تجلب قائمة القراء + روابط التلاوة (cdn.mp3quran.net) وتُخزّنها مؤقتًا.
// لا تعتمد على منصة توصيل؛ تُستدعى من واجهة القارئ.

export type ReciterMoshaf = {
  id: number;
  name: string;
  server: string;
  surahTotal: number;
  surahList: number[];
};

export type Reciter = {
  id: number;
  name: string;
  letter: string;
  moshaf: ReciterMoshaf[];
};

const API_URL = 'https://www.mp3quran.net/api/v3/reciters?language=ar';
let cached: Promise<Reciter[]> | null = null;

export async function loadReciters(): Promise<Reciter[]> {
  if (cached) return cached;
  cached = fetch(API_URL)
    .then(async res => {
      if (!res.ok) throw new Error('تعذر تحميل قائمة القراء.');
      const json = await res.json();
      const reciters = (json?.reciters ?? []) as Array<{
        id: number;
        name: string;
        letter: string;
        moshaf: Array<{id: number; name: string; server: string; surah_total: number; surah_list: string}>;
      }>;
      return reciters.map(r => ({
        id: r.id,
        name: r.name,
        letter: r.letter,
        moshaf: (r.moshaf ?? []).map(m => ({
          id: m.id,
          name: m.name,
          server: m.server,
          surahTotal: m.surah_total,
          surahList: (m.surah_list ?? '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0),
        })),
      }));
    })
    .catch(err => { cached = null; throw err; });
  return cached;
}

export function audioUrl(moshaf: ReciterMoshaf, surah: number): string {
  const padded = String(surah).padStart(3, '0');
  return `${moshaf.server}${padded}.mp3`;
}

export function reciterHasSurah(moshaf: ReciterMoshaf, surah: number): boolean {
  return moshaf.surahList.includes(surah);
}

export function defaultMoshaf(reciter: Reciter): ReciterMoshaf | undefined {
  return reciter.moshaf.find(m => m.surahList.length >= 114) ?? reciter.moshaf[0];
}

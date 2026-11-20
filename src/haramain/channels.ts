// قنوات «من الحرمين الشريفين»: بث مباشر من قناتي القرآن الكريم والسنة النبوية
// (هيئة الإذاعة السعودية — علولاء). تُقرأ القنوات من جدول haramain_channels
// الذي يحدّثه المدير من لوحة الإدارة دون تغيير في الكود. لا إعادة توزيع للبث:
// نعرض الصفحة الرسمية داخل إطار، أو رابط HLS رسميًا يحدّده المدير.

import {authClient} from '../auth';

const TABLE = 'haramain_channels';

export type HaramainChannel = {
  id: string;
  title: string;
  subtitle: string | null;
  /** الصفحة الرسمية للقناة (تُعرض داخل إطار وتصلح مسارًا احتياطيًا) */
  official_url: string;
  /** رابط HLS رسمي اختياري؛ فارغ = عرض الصفحة الرسمية فقط */
  hls_url: string | null;
  sort: number;
  is_active: boolean;
};

export const HARAMAIN_FALLBACK_CHANNELS: HaramainChannel[] = [
  {id: 'quran', title: 'قناة القرآن الكريم', subtitle: 'البث المباشر من الحرم المكي', official_url: 'https://aloula.sba.sa/live/quran?embed=true', hls_url: null, sort: 1, is_active: true},
  {id: 'sunna', title: 'قناة السنة النبوية', subtitle: 'البث المباشر من المسجد النبوي', official_url: 'https://aloula.sba.sa/live/sunna?embed=true', hls_url: null, sort: 2, is_active: true},
];

function sanitize(row: Partial<HaramainChannel> & {id?: string}, fallback: HaramainChannel): HaramainChannel | null {
  if (!row || typeof row.id !== 'string' || !row.id.trim()) return null;
  if (typeof row.official_url !== 'string' || !row.official_url.startsWith('https://')) return null;
  return {
    id: row.id,
    title: typeof row.title === 'string' && row.title.trim() ? row.title : fallback.title,
    subtitle: typeof row.subtitle === 'string' && row.subtitle.trim() ? row.subtitle : null,
    official_url: row.official_url,
    hls_url: typeof row.hls_url === 'string' && row.hls_url.startsWith('https://') ? row.hls_url : null,
    sort: Number.isFinite(row.sort) ? Number(row.sort) : fallback.sort,
    is_active: row.is_active !== false,
  };
}

/** القنوات المفعّلة مرتبة بالترتيب — من السحابة، وعند تعذرها الافتراضية الرسمية */
export async function loadHaramainChannels(): Promise<{channels: HaramainChannel[]; source: 'cloud' | 'fallback'}> {
  if (authClient) {
    try {
      const {data, error} = await authClient
        .from(TABLE)
        .select('id,title,subtitle,official_url,hls_url,sort,is_active')
        .eq('is_active', true)
        .order('sort');
      if (!error && data?.length) {
        const channels = data
          .map(row => sanitize(row as Partial<HaramainChannel>, HARAMAIN_FALLBACK_CHANNELS[0]))
          .filter((channel): channel is HaramainChannel => Boolean(channel))
          .sort((a, b) => a.sort - b.sort);
        if (channels.length) return {channels, source: 'cloud'};
      }
    } catch {/* الوقوع في الافتراضي */}
  }
  return {channels: HARAMAIN_FALLBACK_CHANNELS, source: 'fallback'};
}

/** كل القنوات (حتى الموقوفة) للوحة الإدارة */
export async function listHaramainChannelsAdmin(): Promise<HaramainChannel[]> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient
    .from(TABLE)
    .select('id,title,subtitle,official_url,hls_url,sort,is_active')
    .order('sort');
  if (error) throw error;
  return (data ?? [])
    .map(row => sanitize(row as Partial<HaramainChannel>, HARAMAIN_FALLBACK_CHANNELS[0]))
    .filter((channel): channel is HaramainChannel => Boolean(channel));
}

export type HaramainChannelPatch = Partial<Pick<HaramainChannel, 'title' | 'subtitle' | 'official_url' | 'hls_url' | 'sort' | 'is_active'>>;

/** تحديث قناة من لوحة الإدارة — الصلاحية مفروضة في قاعدة البيانات (RLS) */
export async function saveHaramainChannel(id: string, patch: HaramainChannelPatch): Promise<void> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const clean: HaramainChannelPatch = {
    title: patch.title?.trim().slice(0, 120),
    subtitle: patch.subtitle?.trim().slice(0, 200) ?? null,
    official_url: patch.official_url?.trim(),
    hls_url: patch.hls_url?.trim() ? patch.hls_url.trim() : null,
    sort: patch.sort,
    is_active: patch.is_active,
  };
  if (clean.official_url && !clean.official_url.startsWith('https://')) throw new Error('رابط الصفحة الرسمية يجب أن يبدأ بـ https://');
  if (clean.hls_url && !clean.hls_url.startsWith('https://')) throw new Error('رابط HLS يجب أن يبدأ بـ https://');
  const {error} = await authClient.from(TABLE).update(clean).eq('id', id);
  if (error) throw error;
}

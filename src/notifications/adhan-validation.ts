// التحقق من ملفات الأذان قبل الرفع (دالة خالصة قابلة للاختبار): الحجم والامتداد والنوع المعلن،
// ثم بصمة الملف الفعلية (magic bytes) فلا يُكتفى بنوع MIME الذي يعلنه المتصفح.

export const ADHAN_MAX_BYTES = 10 * 1024 * 1024;

export type AdhanFormat = {mime: string; extensions: string[]};

export const ADHAN_FORMATS: Record<string, AdhanFormat> = {
  mp3: {mime: 'audio/mpeg', extensions: ['mp3']},
  ogg: {mime: 'audio/ogg', extensions: ['ogg', 'oga']},
  wav: {mime: 'audio/wav', extensions: ['wav']},
  m4a: {mime: 'audio/mp4', extensions: ['m4a', 'mp4']},
};

const ascii = (bytes: Uint8Array, start: number, text: string) =>
  text.length + start <= bytes.length && [...text].every((char, index) => bytes[start + index] === char.charCodeAt(0));

/** يحدد الصيغة من أول البايتات؛ null إن لم تُعرف */
export function sniffAudioFormat(bytes: Uint8Array): keyof typeof ADHAN_FORMATS | null {
  if (ascii(bytes, 0, 'ID3') || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  if (ascii(bytes, 0, 'OggS')) return 'ogg';
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')) return 'wav';
  if (ascii(bytes, 4, 'ftyp')) return 'm4a';
  return null;
}

export type AdhanValidation = {ok: true; format: keyof typeof ADHAN_FORMATS; mime: string} | {ok: false; error: string};

export function validateAdhanFile(file: {name: string; size: number}, head: Uint8Array): AdhanValidation {
  if (!file.size) return {ok: false, error: 'الملف فارغ.'};
  if (file.size > ADHAN_MAX_BYTES) return {ok: false, error: 'حجم الملف أكبر من 10 ميغابايت.'};
  const format = sniffAudioFormat(head);
  if (!format) return {ok: false, error: 'محتوى الملف ليس صوتًا مدعومًا. الصيغ المقبولة: MP3 أو OGG أو WAV أو M4A.'};
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ADHAN_FORMATS[format].extensions.includes(extension)) return {ok: false, error: 'امتداد الملف لا يطابق محتواه الفعلي.'};
  return {ok: true, format, mime: ADHAN_FORMATS[format].mime};
}

export function normalizeAdhanTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 100);
}

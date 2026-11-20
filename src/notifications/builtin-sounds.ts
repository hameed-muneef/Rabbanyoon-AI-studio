// مكتبة الأصوات المدمجة — نغمات مُولَّدة عبر Web Audio API بلا ملفات صوتية،
// فلا تُقيَّد بأي حقوق ملكية. تسجيلات الأذان الملائمة للترخيص تُرفع من المستخدم
// نفسه أو تُضاف لاحقًا بعد اعتماد مصدر مرخَّص ضمن مكتبة السحابة.

export type SoundOption = {
  id: string;
  title: string;
  kind: 'system' | 'tone' | 'adhan' | 'silent' | 'custom';
  /** عنوان URL للصوت المخصص أو تسجيل؛ فارغ للنغمات المولّدة محليًا */
  url?: string;
  description?: string;
};

export const BUILTIN_SOUNDS: SoundOption[] = [
  {
    id: 'builtin:chime',
    title: 'نغمة جرس هادئة',
    kind: 'tone',
    description: 'ورتان متساويان، مناسبة للتنبيه اللطيف.',
  },
  {
    id: 'builtin:asc',
    title: 'نغمة تنبيه صاعدة',
    kind: 'tone',
    description: 'ثلاث نغمات متصاعدة، مناسبة للتذكير قبْل الأذان.',
  },
  {
    id: 'builtin:soft',
    title: 'نغمة خفيفة',
    kind: 'tone',
    description: 'نغمة واحدة قصيرة، جيدة للتذكير اللافت دون ازعاج.',
  },
  {
    id: 'builtin:silent',
    title: 'صامت',
    kind: 'silent',
    description: 'إشعار داخل التطبيق بدون صوت.',
  },
];

export function soundTitle(id: string | undefined): string {
  const found = BUILTIN_SOUNDS.find(sound => sound.id === id);
  return found?.title ?? (id ? 'صوت مخصص' : 'افتراضي');
}

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

type Tone = {frequency: number; start: number; duration: number};

const melodies: Record<string, Tone[]> = {
  'builtin:chime': [
    {frequency: 523.25, start: 0, duration: 0.45},
    {frequency: 392.00, start: 0.5, duration: 0.45},
  ],
  'builtin:asc': [
    {frequency: 392.00, start: 0, duration: 0.18},
    {frequency: 493.88, start: 0.2, duration: 0.18},
    {frequency: 587.33, start: 0.4, duration: 0.25},
  ],
  'builtin:soft': [
    {frequency: 440.00, start: 0, duration: 0.22},
  ],
};

/** يشغّل نغمة مدمجة مُولَّدة. تعيد false إذا لم يكن الصوت مدمجًا بنغمة مُولَّدة */
export function playBuiltInTone(id: string): boolean {
  const melody = melodies[id];
  const ctx = audioContext();
  if (!melody || !ctx) return false;
  let offset = 0;
  for (const tone of melody) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = tone.frequency;
    gain.gain.setValueAtTime(0, ctx.currentTime + tone.start + offset);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + tone.start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + tone.start + offset + tone.duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(ctx.currentTime + tone.start + offset);
    oscillator.stop(ctx.currentTime + tone.start + offset + tone.duration + 0.05);
    offset = 0;
  }
  return true;
}

/** معاينة أي صوت: نغمة مدمجة أو رابط (مرفوع محليًا أو من مكتبة السحابة) */
export function previewSound(sound: SoundOption): void {
  if (sound.id === 'builtin:silent') return;
  if (playBuiltInTone(sound.id)) return;
  if (!sound.url) return;
  try {
    const audio = new Audio(sound.url);
    audio.volume = 0.9;
    void audio.play().catch(() => {/* المتصفح قد يمنع التشغيل قبل تفاعل المستخدم */});
  } catch {/* تجاهل */}
}

/** إيقاف أي تسجيل جارٍ (النغمات المولّدة تنتهي وحد ذاتها) */
export function stopSoundPreview(active: HTMLAudioElement | null): void {
  if (active) try {active.pause()} catch {}
}

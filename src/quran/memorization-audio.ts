// محرك تلاوة للحفظ (Memorization Recitation Engine)
// يدير تشغيل آيات محددة بمستويات تكرار (آية × N، مقطع × M).
// لا يعتمد على React — منطق خالص + Audio element.

export type MemorizationConfig = {
  surah: number;
  startAyah: number;
  endAyah: number;
  ayahRepeat: number; // تكرار كل آية (1-10)
  passageRepeat: number; // تكرار المقطع كاملاً (1-10)
  reciterId: number;
};

export type MemorizationProgress = {
  currentAyah: number;
  ayahIndex: number; // 0-based within passage
  ayahRepeatCurrent: number; // 1-based
  ayahRepeatTotal: number;
  passageRepeatCurrent: number; // 1-based
  passageRepeatTotal: number;
  totalAyahs: number;
  isPlaying: boolean;
  isPaused: boolean;
  isComplete: boolean;
};

export type MemorizationState = 'idle' | 'playing' | 'paused' | 'complete';

// Generate the list of ayahs in the passage
export function passageAyahs(start: number, end: number): number[] {
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  const result: number[] = [];
  for (let a = s; a <= e; a++) result.push(a);
  return result;
}

// Total number of ayah plays
export function totalPlays(config: MemorizationConfig): number {
  const ayahCount = passageAyahs(config.startAyah, config.endAyah).length;
  return ayahCount * config.ayahRepeat * config.passageRepeat;
}

// Progress label
export function progressLabel(p: MemorizationProgress): string {
  if (p.isComplete) return 'اكتمل التلاوة';
  if (p.isPaused) return 'متوقف مؤقتًا';
  return `الآية ${p.currentAyah} · تكرار ${p.ayahRepeatCurrent}/${p.ayahRepeatTotal} · مقطع ${p.passageRepeatCurrent}/${p.passageRepeatTotal}`;
}

// Clamp repeat values
export function clampRepeat(value: number, min = 1, max = 10): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

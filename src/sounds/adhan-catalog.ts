// src/sounds/adhan-catalog.ts
// Authoritative local catalog of bundled Adhan MP3 recordings from Azan/.
// Eid Takbeerat is kept explicitly separate so it is never used as an ordinary prayer Adhan.

export interface AdhanCatalogEntry {
  id: string;
  soundId: string;
  name: string;
  rawName: string;
  fileName: string;
  url: string;
  isEidTakbeer: boolean;
}

export const ADHAN_SELECTION_STORAGE_KEY = 'rabbani-adhan-id';
export const DEFAULT_ADHAN_ID = 'almulla';

export const BUNDLED_ADHAN_SOUNDS: readonly AdhanCatalogEntry[] = [
  {
    id: 'almulla',
    soundId: 'adhan:almulla',
    name: 'الملا',
    rawName: 'adhan_almulla',
    fileName: 'adhan_almulla.mp3',
    url: '/sounds/adhan/adhan_almulla.mp3',
    isEidTakbeer: false,
  },
  {
    id: 'ahmad',
    soundId: 'adhan:ahmad',
    name: 'أحمد العمادي',
    rawName: 'adhan_ahmad',
    fileName: 'adhan_ahmad.mp3',
    url: '/sounds/adhan/adhan_ahmad.mp3',
    isEidTakbeer: false,
  },
  {
    id: 'madinah',
    soundId: 'adhan:madinah',
    name: 'أذان الحرم المدني',
    rawName: 'adhan_madinah',
    fileName: 'adhan_madinah.mp3',
    url: '/sounds/adhan/adhan_madinah.mp3',
    isEidTakbeer: false,
  },
  {
    id: 'madinah2',
    soundId: 'adhan:madinah2',
    name: 'أذان الحرم المدني 2',
    rawName: 'adhan_madinah2',
    fileName: 'adhan_madinah2.mp3',
    url: '/sounds/adhan/adhan_madinah2.mp3',
    isEidTakbeer: false,
  },
  {
    id: 'mohammed',
    soundId: 'adhan:mohammed',
    name: 'أذان محمد رمضان (الحرم)',
    rawName: 'adhan_mohammed',
    fileName: 'adhan_mohammed.mp3',
    url: '/sounds/adhan/adhan_mohammed.mp3',
    isEidTakbeer: false,
  },
  {
    id: 'hamad',
    soundId: 'adhan:hamad',
    name: 'حمد الدغريري',
    rawName: 'adhan_hamad',
    fileName: 'adhan_hamad.mp3',
    url: '/sounds/adhan/adhan_hamad.mp3',
    isEidTakbeer: false,
  },
];

export const EID_TAKBEERAT_SOUND: AdhanCatalogEntry = {
  id: 'eid',
  soundId: 'takbeer:eid',
  name: 'تكبيرات العيد',
  rawName: 'takbeerat_eid',
  fileName: 'takbeerat_eid.mp3',
  url: '/sounds/adhan/takbeerat_eid.mp3',
  isEidTakbeer: true,
};

/**
 * Resolves only ordinary prayer Adhan recordings (explicitly excludes Eid Takbeerat).
 */
export function findOrdinaryAdhan(idOrSoundId?: string): AdhanCatalogEntry | undefined {
  if (!idOrSoundId) return undefined;
  const trimmed = idOrSoundId.trim();
  if (!trimmed || trimmed === 'eid' || trimmed === 'takbeer:eid' || trimmed === 'takbeerat_eid') {
    return undefined;
  }
  const normalized = trimmed.startsWith('adhan:') ? trimmed.slice('adhan:'.length) : trimmed;
  return BUNDLED_ADHAN_SOUNDS.find(
    (entry) => entry.id === normalized || entry.soundId === trimmed || entry.rawName === normalized,
  );
}

export function getSelectedDefaultAdhanId(): string {
  try {
    if (typeof window === 'undefined') return DEFAULT_ADHAN_ID;
    const saved = window.localStorage.getItem(ADHAN_SELECTION_STORAGE_KEY);
    const match = findOrdinaryAdhan(saved ?? undefined);
    return match ? match.id : DEFAULT_ADHAN_ID;
  } catch {
    return DEFAULT_ADHAN_ID;
  }
}

export function resolvePrayerAdhan(prayerSoundId?: string, selectedDefaultId?: string): AdhanCatalogEntry {
  return (
    findOrdinaryAdhan(prayerSoundId) ??
    findOrdinaryAdhan(selectedDefaultId ?? getSelectedDefaultAdhanId()) ??
    BUNDLED_ADHAN_SOUNDS[0]
  );
}

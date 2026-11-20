// أنواع بيانات القرآن والسنة. النص القرآني نفسه لا يُعدّل هنا؛ هذه الأنواع
// تصف الأصل الثابت وبيانات تعلّم المستخدم فقط.
export type ContentType = 'quran' | 'hadith';
export type PassageState = 'new' | 'learning' | 'needs_revision' | 'good' | 'mastered';
export type TargetUnit = 'verses' | 'hadith' | 'pages' | 'half_pages';
export type PlanStatus = 'active' | 'paused' | 'completed';
export type RoutineKind = 'quran_reading' | 'quran_memorization' | 'quran_revision' | 'hadith_reading' | 'hadith_memorization' | 'reflection';
export type RoutineSlot = 'fajr' | 'duha' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | 'any';

export type QuranVerse = {s: number; a: number; j: number; p: number; h: number; t: string; e: string};
export type QuranSurah = {n: number; name: string; ename: string; type: string; ayahs: number; order: number};
export type QuranAsset = {
  version: string;
  narration: string;
  script: string;
  source: string;
  sourceUrl: string;
  generatedAt: string;
  counts: {surahs: number; verses: number; juz: number; hizbs: number; pages: number};
  surahs: QuranSurah[];
  juzStarts: {juz: number; surah: number; ayah: number; global: number}[];
  hizbStarts: {hizb: number; surah: number; ayah: number; global: number}[];
  sajdas: string[];
  verses: QuranVerse[];
};

export type QuranSettings = {fontSize: number; theme: 'light' | 'dark'};
export type ReadingPosition = {surah: number; ayah: number; juz?: number; page?: number; updatedAt: string};
export type QuranBookmark = {id: string; surah: number; ayah: number; label: string; name?: string; page?: number; createdAt: string};
export type QuranNote = {id: string; surah: number; ayahStart: number; ayahEnd: number; body: string; createdAt: string; updatedAt: string};
export type QuranHistory = {id: string; surah: number; ayahStart: number; ayahEnd: number; readAt: string};

export type MemorizationPlan = {
  id: string;
  contentType: ContentType;
  title: string;
  startSurah?: number;
  startAyah?: number;
  endSurah?: number;
  endAyah?: number;
  collectionKey?: string;
  hadithStart?: number;
  hadithEnd?: number;
  dailyTarget: number;
  targetUnit: TargetUnit;
  schedule: {days: number[]; targetDate?: string};
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type MemorizationPassage = {
  id: string;
  planId?: string;
  contentType: ContentType;
  surah?: number;
  ayahStart?: number;
  ayahEnd?: number;
  collectionKey?: string;
  hadithNumber?: number;
  state: PassageState;
  ease: number;
  intervalDays: number;
  dueDate?: string;
  lastReviewedAt?: string;
  reviewCount: number;
  lapses: number;
  createdAt: string;
  updatedAt: string;
};

export type RevisionEvent = {
  id: string;
  passageId: string;
  reviewedAt: string;
  quality: number;
  outcome: 'failed' | 'passed';
  nextDueDate?: string;
  intervalDays: number;
};

export type QuranReflection = {
  id: string;
  sourceType: ContentType;
  surah?: number;
  ayahStart?: number;
  ayahEnd?: number;
  collectionKey?: string;
  hadithNumber?: number;
  learned: string;
  meaning: string;
  action: string;
  trait: string;
  intention: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoutineActivity = {
  id: string;
  kind: RoutineKind;
  slot: RoutineSlot;
  days: number[];
  enabled: boolean;
  config: {surah?: number; ayahFrom?: number; ayahTo?: number; planId?: string; collectionKey?: string};
  linkedTaskId?: string;
  createdAt: string;
  updatedAt: string;
};

export type HadithBookmark = {id: string; collectionKey: string; hadithNumber: number; label: string; createdAt: string};
export type RoutineLogEntry = {activityId: string; date: string; kind: RoutineKind};

export type QuranLearningState = {
  settings: QuranSettings;
  readingPosition?: ReadingPosition;
  bookmarks: QuranBookmark[];
  notes: QuranNote[];
  history: QuranHistory[];
  plans: MemorizationPlan[];
  passages: MemorizationPassage[];
  revisionEvents: RevisionEvent[];
  reflections: QuranReflection[];
  routine: RoutineActivity[];
  hadithBookmarks: HadithBookmark[];
  activityLog: RoutineLogEntry[];
  updatedAt: string;
};

export type HadithCollectionStatus = {
  id?: string;
  collection_key: string;
  title: string;
  author: string;
  edition: string;
  numbering_system: string;
  source_name: string;
  source_url: string;
  license_status: 'blocked' | 'pending' | 'approved';
  import_status: 'not_imported' | 'partial' | 'complete';
  total_narrations: number | null;
  imported_narrations: number;
  attribution: string;
  notes: string;
};

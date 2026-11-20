// «المصحف الشريف» بترتيب صفحات المصحف (٦٠٤ صفحة): تمرير رأسي متصل،
// بحدود الصفحات وأرقامها وأسماء السور ومواضع الأجزاء والأحزاب.
// النص من أصل معتمد محلي، ولا يُعدّل حرف منه.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Bookmark, BookmarkCheck, ChevronLeft, Copy, Loader2, Pause, Play, Search,
  Share2, Square, StickyNote, Trash2, X, WifiOff, BookOpen, TrendingUp
} from 'lucide-react';
import type {QuranAsset, QuranLearningState, QuranVerse} from '../../quran/types';
import {
  showsBasmala, surahInfo, toArabicNumber, verseBody, verseMarker,
  searchVerses, basmalaText
} from '../../quran/content';
import {TRANSLATIONS, TAFSIRS, fetchTafsir, fetchTranslation, type FetchState} from '../../quran/content-api';
import {fetchAyahAudioUrl, fetchChapterAudioUrl, DEFAULT_RECITATION_ID, QURAN_COM_RECITERS} from '../../quran/ayah-audio';
import {InternetBadge, useOnline} from '../../online';
import {copyText, shareText} from './ui';
import QuranReader from './QuranReader';

const AUTO_SCROLL_SPEEDS = [
  {value: 90, label: 'بطيء جدًا'},
  {value: 180, label: 'بطيء'},
  {value: 360, label: 'متوسط'},
  {value: 700, label: 'سريع'},
  {value: 1200, label: 'الأسرع'},
];

const TOOLBAR_OFFSET = 92;

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
};

type PageBlock = {page: number; verses: QuranVerse[]};

export default function MushafPages({asset, state, onState, notify}: Props) {
  const online = useOnline();
  const [mode, setMode] = useState<'pages' | 'reflow'>(() => {
    try { return localStorage.getItem('mushaf-mode') === 'reflow' ? 'reflow' : 'pages'; } catch { return 'pages'; }
  });
  useEffect(() => {
    try { localStorage.setItem('mushaf-mode', mode); } catch { /* تجاهل */ }
  }, [mode]);

  // تجميع الآيات في صفحات المصحف المعتمدة (٦٠٤ صفحة) مرة واحدة.
  const pages = useMemo<PageBlock[]>(() => {
    const map = new Map<number, QuranVerse[]>();
    for (const verse of asset.verses) {
      const list = map.get(verse.p);
      if (list) list.push(verse); else map.set(verse.p, [verse]);
    }
    const total = asset.counts.pages || 604;
    return Array.from({length: total}, (_, index) => ({page: index + 1, verses: map.get(index + 1) ?? []}));
  }, [asset]);

  const surahFirstPage = useMemo(() => {
    const map = new Map<number, number>();
    for (const verse of asset.verses) if (!map.has(verse.s)) map.set(verse.s, verse.p);
    return map;
  }, [asset]);

  const pageMeta = useMemo(() => {
    const map = new Map<number, {juz: number; hizb: number}>();
    for (const block of pages) {
      const first = block.verses[0];
      if (first) map.set(block.page, {juz: first.j, hizb: first.h});
    }
    return map;
  }, [pages]);

  // السور التي تبدأ داخل كل صفحة (لأشرطة أسماء السور والبسملة).
  const surahStarts = useMemo(() => {
    const map = new Map<number, Set<number>>();
    let lastSurah = 0;
    for (const verse of asset.verses) {
      if (verse.s !== lastSurah) {
        lastSurah = verse.s;
        const set = map.get(verse.p);
        if (set) set.add(verse.s); else map.set(verse.p, new Set([verse.s]));
      }
    }
    return map;
  }, [asset]);

  const sajdaKeys = useMemo(() => new Set(asset.sajdas ?? []), [asset]);
  const basmala = useMemo(() => basmalaText(asset), [asset]);

  const savedPage = state.readingPosition?.page;
  const [page, setPage] = useState<number>(() =>
    savedPage && savedPage >= 1 && savedPage <= pages.length ? savedPage : 1);
  const [jumpKind, setJumpKind] = useState<'surah' | 'juz' | 'hizb' | 'page'>('surah');
  const [jumpValue, setJumpValue] = useState<string>('1');
  const [fontSize, setFontSize] = useState<number>(() => state.settings?.fontSize ?? 26);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<QuranVerse | null>(null);
  const [sheetTab, setSheetTab] = useState<'actions' | 'tafsir' | 'translation'>('tafsir');
  const [popoverPos, setPopoverPos] = useState<{top: number; left: number; placement: 'below' | 'above'}>({top: 0, left: 0, placement: 'below'});
  const [isMobileSheet, setIsMobileSheet] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth <= 767 : false));
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const ayahRef = useRef<QuranVerse | null>(null);
  const [tafsirId, setTafsirId] = useState<number>(TAFSIRS[0].id);
  const [translationId, setTranslationId] = useState<number>(TRANSLATIONS[0].id);
  const [content, setContent] = useState<FetchState<string>>({status: 'idle', data: null});
  const [noteText, setNoteText] = useState('');
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-autoscroll-speed')); return Number.isFinite(v) && v > 0 ? v : 240; } catch { return 240; }
  });
  const [playingKey, setPlayingKey] = useState<string>('');
  const [audioLoading, setAudioLoading] = useState(false);
  const [reciterId, setReciterId] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-reciter-id')); return QURAN_COM_RECITERS.some(r => r.id === v) ? v : DEFAULT_RECITATION_ID; } catch { return DEFAULT_RECITATION_ID; }
  });
  const [playScope, setPlayScope] = useState<'surah' | 'fromHere' | 'all'>(() => {
    try { const v = localStorage.getItem('quran-play-scope'); return (v === 'surah' || v === 'fromHere' || v === 'all') ? v : 'surah'; } catch { return 'surah'; }
  });
  const continuousRef = useRef<{running: boolean}>({running: false});
  const playStateRef = useRef<'idle' | 'playing' | 'paused'>('idle');
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const currentKeyRef = useRef<string>('');
  const [currentKey, setCurrentKey] = useState<string>('');
  const currentIndexRef = useRef<number>(0);
  const currentStopSurahRef = useRef<number | undefined>(undefined);
  const currentResolveRef = useRef<(() => void) | null>(null);
  const restartRef = useRef<boolean>(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [khatmahOpen, setKhatmahOpen] = useState(false);
  const [khatmahPace, setKhatmahPace] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-khatmah-pace')); return Number.isFinite(v) && v > 0 ? v : 10; } catch { return 10; }
  });
  const [maxPage, setMaxPage] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-khatmah-maxpage')); return Number.isFinite(v) && v >= 1 ? v : 1; } catch { return 1; }
  });

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoScrollingRef = useRef<boolean>(false);
  const speedRef = useRef(autoSpeed);
  const stateRef = useRef(state);
  const onStateRef = useRef(onState);
  stateRef.current = state;
  onStateRef.current = onState;

  useEffect(() => { speedRef.current = autoSpeed; }, [autoSpeed]);
  useEffect(() => {
    try { localStorage.setItem('quran-autoscroll-speed', String(autoSpeed)); } catch { /* تجاهل */ }
  }, [autoSpeed]);

  const patch = useCallback((partial: Partial<QuranLearningState>) => {
    // دمج على أحدث حالة معروفة حتى لا تفقد إجراءات متتابعة (علامة ثم ملاحظة) بعضها.
    const next = {...stateRef.current, ...partial, updatedAt: new Date().toISOString()};
    stateRef.current = next;
    onStateRef.current(next);
  }, []);

  const registerPage = useCallback((index: number, el: HTMLDivElement | null) => {
    pageRefs.current[index] = el;
  }, []);

  const scrollToPage = useCallback((target: number) => {
    const el = pageRefs.current[target - 1];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - TOOLBAR_OFFSET;
    window.scrollTo({top: Math.max(0, top), behavior: 'auto'});
    setPage(target);
  }, []);

  // استعادة موضع القراءة المحفوظ بعد أول رسم.
  useEffect(() => {
    const target = savedPage && savedPage >= 1 && savedPage <= pages.length ? savedPage : 1;
    if (target <= 1) return;
    const timer = window.setTimeout(() => scrollToPage(target), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تتبّع الصفحة الظاهرة أثناء التمرير (بحث ثنائي: الصفحات مرتبة رأسيًا).
  useEffect(() => {
    let last = 0;
    const onScroll = () => {
      if (autoScrollingRef.current) return;
      const now = performance.now();
      if (now - last < 200) return;
      last = now;
      const els = pageRefs.current;
      let low = 0;
      let high = els.length - 1;
      let found = 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const el = els[mid];
        if (!el) { low = mid + 1; continue; }
        const rect = el.getBoundingClientRect();
        if (rect.bottom > TOOLBAR_OFFSET + 8) { found = mid + 1; high = mid - 1; } else { low = mid + 1; }
      }
      setPage(current => current === found ? current : found);
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // حفظ موضع القراءة على الجهاز بعد استقرار التمرير.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const first = pages[page - 1]?.verses[0];
      if (!first) return;
      const current = stateRef.current.readingPosition;
      if (current && current.page === page) return;
      patch({readingPosition: {surah: first.s, ayah: first.a, juz: first.j, page, updatedAt: new Date().toISOString()}});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [page, pages, patch]);

  // حفظ حجم الخط في حالة القرآن (ولا يُكتب عند أول رسم).
  const fontReady = useRef(false);
  useEffect(() => {
    if (!fontReady.current) { fontReady.current = true; return; }
    patch({settings: {...(stateRef.current.settings ?? {fontSize, theme: 'light'}), fontSize}});
  }, [fontSize, patch]);

  const bookmarks = state.bookmarks ?? [];
  const isBookmarked = (verse: QuranVerse) => bookmarks.some(item => item.surah === verse.s && item.ayah === verse.a);

  const toggleBookmark = (verse: QuranVerse) => {
    const list = stateRef.current.bookmarks ?? [];
    if (list.some(item => item.surah === verse.s && item.ayah === verse.a)) {
      patch({bookmarks: list.filter(item => !(item.surah === verse.s && item.ayah === verse.a))});
      notify('أُزيلت العلامة.');
      return;
    }
    const name = surahInfo(asset, verse.s)?.name ?? `سورة ${verse.s}`;
    patch({bookmarks: [{id: `bm-${verse.s}-${verse.a}`, surah: verse.s, ayah: verse.a, label: `${name}: ${toArabicNumber(verse.a)}`, name: `${name} · ${toArabicNumber(verse.a)}`, page: verse.p, createdAt: new Date().toISOString()}, ...list]});
    notify('حُفظت علامة الآية على هذا الجهاز.');
  };

  const addNote = () => {
    if (!active || noteText.trim().length < 2) { notify('اكتب ملاحظة أطول قليلًا.'); return; }
    const stamp = new Date().toISOString();
    patch({notes: [{id: `nt-${active.s}-${active.a}-${Date.now()}`, surah: active.s, ayahStart: active.a, ayahEnd: active.a, body: noteText.trim().slice(0, 4000), createdAt: stamp, updatedAt: stamp}, ...(stateRef.current.notes ?? [])]});
    setNoteText('');
    notify('حُفظت الملاحظة على هذا الجهاز.');
  };

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingKey('');
  }, []);

  const closePopover = useCallback(() => {
    continuousRef.current.running = false;
    restartRef.current = false;
    const r = currentResolveRef.current;
    currentResolveRef.current = null;
    if (r) r();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    playStateRef.current = 'idle';
    setPlayState('idle');
    setCurrentKey('');
    setPlayingKey('');
    setActive(null);
  }, []);

  const pauseContinuous = useCallback(() => {
    if (playStateRef.current !== 'playing') return;
    playStateRef.current = 'paused';
    setPlayState('paused');
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const resumeContinuous = useCallback(() => {
    if (playStateRef.current !== 'paused') return;
    playStateRef.current = 'playing';
    setPlayState('playing');
    if (audioRef.current) audioRef.current.play().catch(() => {});
  }, []);

  const playContinuousFrom = useCallback(async (startIndex: number, stopSurah?: number) => {
    const cur = audioRef.current;
    if (cur) { cur.pause(); audioRef.current = null; }
    if (playStateRef.current !== 'idle') {
      continuousRef.current.running = false;
      const r = currentResolveRef.current;
      currentResolveRef.current = null;
      if (r) r();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    }
    continuousRef.current.running = true;
    playStateRef.current = 'playing';
    setPlayState('playing');
    const verses = asset.verses;
    const startVerse = verses[Math.max(0, Math.min(startIndex, verses.length - 1))];
    let surah = stopSurah !== undefined ? stopSurah : (startVerse?.s ?? 1);
    const lastSurah = stopSurah !== undefined ? stopSurah : (playScope === 'surah' ? surah : 114);
    while (continuousRef.current.running && surah <= lastSurah) {
      const key = `${surah}:1`;
      currentIndexRef.current = verses.findIndex(v => v.s === surah && v.a === 1);
      currentKeyRef.current = key;
      setCurrentKey(key);
      setPlayingKey(key);
      const firstVerse = asset.verses.find(v => v.s === surah && v.a === 1);
      if (firstVerse) {
        const el = pageRefs.current[firstVerse.p - 1];
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - TOOLBAR_OFFSET;
          window.scrollTo({top: Math.max(0, top), behavior: 'auto'});
        }
      }
      while ((playStateRef.current as string) === 'paused' && continuousRef.current.running) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (!continuousRef.current.running) break;
      if ((playStateRef.current as string) === 'idle') break;
      const url = await fetchChapterAudioUrl(reciterIdRef.current ?? reciterId, surah);
      if (!continuousRef.current.running) break;
      if (restartRef.current) { restartRef.current = false; continue; }
      if (!url) { surah += 1; continue; }
      await new Promise<void>(resolve => {
        const audio = new Audio(url);
        audioRef.current = audio;
        currentResolveRef.current = resolve;
        const finish = () => { currentResolveRef.current = null; audioRef.current = null; resolve(); };
        audio.addEventListener('ended', finish, {once: true});
        audio.addEventListener('error', finish, {once: true});
        audio.play().catch(finish);
      });
      if (!continuousRef.current.running) break;
      if (restartRef.current) { restartRef.current = false; continue; }
      surah += 1;
    }
    continuousRef.current.running = false;
    playStateRef.current = 'idle';
    setPlayState('idle');
    setCurrentKey('');
    setPlayingKey('');
    currentResolveRef.current = null;
  }, [asset, reciterId]);

  // reciterIdRef sync
  const reciterIdRef = useRef<number>(reciterId);
  useEffect(() => { reciterIdRef.current = reciterId; }, [reciterId]);

  const playAyah = async (verse: QuranVerse) => {
    if (continuousRef.current.running) {
      continuousRef.current.running = false;
      const r = currentResolveRef.current;
      currentResolveRef.current = null;
      if (r) r();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      playStateRef.current = 'idle';
      setPlayState('idle');
    }
    if (playingKey === `${verse.s}:${verse.a}`) { stopAudio(); return; }
    if (!online) { notify('تلاوة الآيات تحتاج اتصالًا بالإنترنت. النص والتفسير المحفوظ يعملان بلا اتصال.'); return; }
    setAudioLoading(true);
    const url = await fetchAyahAudioUrl(reciterId, verse.s, verse.a);
    setAudioLoading(false);
    if (!url) { notify('تعذر جلب تلاوة هذه الآية.'); return; }
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.addEventListener('ended', () => setPlayingKey(''), {once: true});
    audio.addEventListener('error', () => { setPlayingKey(''); notify('تعذر تشغيل التلاوة.'); });
    setPlayingKey(`${verse.s}:${verse.a}`);
    audio.play().catch(() => { setPlayingKey(''); notify('تعذر تشغيل التلاوة.'); });
  };

  useEffect(() => () => { continuousRef.current.running = false; audioRef.current?.pause(); audioRef.current = null; }, []);

  // جلب التفسير أو الترجمة عند اختيار الآية (يُخزَّن محليًا بعد أول فتح).
  useEffect(() => {
    if (!active || sheetTab === 'actions') { setContent({status: 'idle', data: null}); return; }
    const controller = new AbortController();
    setContent({status: 'loading', data: null});
    const key = `${active.s}:${active.a}`;
    const request = sheetTab === 'tafsir'
      ? fetchTafsir(key, tafsirId, controller.signal)
      : fetchTranslation(key, translationId, controller.signal);
    request.then(text => {
      if (controller.signal.aborted) return;
      setContent(text ? {status: 'success', data: text} : {status: 'empty', data: null});
    }).catch(() => {
      if (!controller.signal.aborted) setContent({status: 'error', data: null, error: 'تعذّر جلب المحتوى.'});
    });
    return () => controller.abort();
  }, [active, sheetTab, tafsirId, translationId]);

  // التمرير التلقائي: سلس، قابل للإيقاف، ويُبقي الشاشة مستيقظة إن أمكن.
  useEffect(() => {
    if (!autoScroll) {
      autoScrollingRef.current = false;
      // update page state once when stopping
      const els = pageRefs.current;
      let low = 0, high = els.length - 1, found = 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const el = els[mid];
        if (!el) { low = mid + 1; continue; }
        const rect = el.getBoundingClientRect();
        if (rect.bottom > TOOLBAR_OFFSET + 8) { found = mid + 1; high = mid - 1; } else { low = mid + 1; }
      }
      setPage(found);
      return;
    }
    autoScrollingRef.current = true;
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    let wakeLock: {release: () => Promise<void>} | null = null;
    const acquire = async () => {
      try {
        const api = (navigator as unknown as {wakeLock?: {request: (kind: string) => Promise<{release: () => Promise<void>}>}}).wakeLock;
        if (api) wakeLock = await api.request('screen');
      } catch { /* غير مدعوم */ }
    };
    void acquire();
    let frame = 0;
    let last = performance.now();
    let acc = root.scrollTop;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const speed = speedRef.current;
      acc += speed * dt;
      const maxScroll = root.scrollHeight - window.innerHeight;
      if (acc >= maxScroll - 2) {
        acc = maxScroll;
        root.scrollTop = acc;
        setAutoScroll(false);
        return;
      }
      root.scrollTop = acc;
      frame = requestAnimationFrame(tick);
    };
    const pause = () => setAutoScroll(false);
    window.addEventListener('wheel', pause, {passive: true});
    window.addEventListener('touchstart', pause, {passive: true});
    frame = requestAnimationFrame(tick);
    return () => {
      autoScrollingRef.current = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', pause);
      window.removeEventListener('touchstart', pause);
      root.style.scrollBehavior = prevBehavior;
      if (wakeLock) void wakeLock.release().catch(() => undefined);
    };
  }, [autoScroll]);

  // تتبّع أقصى صفحة وصل إليها القارئ (لتقدم الختمة).
  useEffect(() => {
    setMaxPage(current => {
      if (page <= current) return current;
      try { localStorage.setItem('quran-khatmah-maxpage', String(page)); } catch { /* تجاهل */ }
      return page;
    });
  }, [page]);

  useEffect(() => {
    try { localStorage.setItem('quran-khatmah-pace', String(khatmahPace)); } catch { /* تجاهل */ }
  }, [khatmahPace]);

  useEffect(() => {
    try { localStorage.setItem('quran-reciter-id', String(reciterId)); } catch { /* تجاهل */ }
  }, [reciterId]);

  useEffect(() => {
    try { localStorage.setItem('quran-play-scope', playScope); } catch { /* تجاهل */ }
  }, [playScope]);

  // أثناء فتح لوحة: منع تمرير الصفحة (لتوسيط صحيح وتجنب شريط التمرير).
  useEffect(() => {
    const open = Boolean(active) || bookmarksOpen || khatmahOpen;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    if (open) { document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'; }
    return () => { document.body.style.overflow = prevBody; document.documentElement.style.overflow = prevHtml; };
  }, [active, bookmarksOpen, khatmahOpen]);

  const jump = () => {
    if (jumpKind === 'surah') {
      const target = surahFirstPage.get(Number(jumpValue));
      if (target) scrollToPage(target);
      return;
    }
    if (jumpKind === 'page') {
      const target = Number(jumpValue);
      if (target >= 1 && target <= pages.length) scrollToPage(target);
      return;
    }
    const value = Number(jumpValue);
    const verse = asset.verses.find(item => jumpKind === 'juz' ? item.j === value : item.h === value);
    if (verse) scrollToPage(verse.p);
  };

  const jumpOptions = useMemo(() => {
    if (jumpKind === 'surah') return asset.surahs.map(surah => ({value: String(surah.n), label: `${toArabicNumber(surah.n)} · ${surah.name}`}));
    if (jumpKind === 'page') return Array.from({length: pages.length}, (_, index) => ({value: String(index + 1), label: `صفحة ${toArabicNumber(index + 1)}`}));
    const total = jumpKind === 'juz' ? 30 : 60;
    return Array.from({length: total}, (_, index) => ({value: String(index + 1), label: `${jumpKind === 'juz' ? 'الجزء' : 'الحزب'} ${toArabicNumber(index + 1)}`}));
  }, [asset, jumpKind, pages.length]);

  useEffect(() => { setJumpValue('1'); }, [jumpKind]);

  // تغيير القارئ/النطاق أثناء التشغيل: تحديث المصدر في المكان (إعادة تشغيل من الموضع الحالي).
  useEffect(() => {
    if (playStateRef.current === 'idle') return;
    restartRef.current = false;
    // restart from current index with new reciter
    const idx = currentIndexRef.current;
    const ss = currentStopSurahRef.current;
    // stop current audio
    const r = currentResolveRef.current;
    currentResolveRef.current = null;
    if (r) r();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    // re-trigger playContinuousFrom from idx (it will handle idle check)
    // Use a microtask to avoid setState during render
    const t = setTimeout(() => { void playContinuousFrom(idx, ss); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciterId]);

  useEffect(() => {
    if (playStateRef.current === 'idle') return;
    // scope changed: restart from new scope start
    let startIndex = 0;
    const startSurah = pages[page - 1]?.verses[0]?.s ?? 1;
    if (playScope === 'surah') {
      const idx = asset.verses.findIndex(v => v.s === startSurah && v.a === 1);
      if (idx >= 0) startIndex = idx;
    } else if (playScope === 'fromHere') {
      const first = pages[page - 1]?.verses[0];
      const idx = first ? asset.verses.findIndex(v => v.s === first.s && v.a === first.a) : 0;
      if (idx >= 0) startIndex = idx;
    } else {
      startIndex = 0;
    }
    const stopSurah = playScope === 'surah' ? startSurah : undefined;
    currentStopSurahRef.current = stopSurah;
    const r = currentResolveRef.current;
    currentResolveRef.current = null;
    if (r) r();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    playStateRef.current = 'idle';
    setPlayState('idle');
    const t = setTimeout(() => { void playContinuousFrom(startIndex, stopSurah); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playScope]);

  // Handler for the single Play/Pause button (shared by desktop & mobile).
  const togglePlay = () => {
    if (playState === 'idle') {
      let startIndex = 0;
      const startSurah = pages[page - 1]?.verses[0]?.s ?? 1;
      if (playScope === 'surah') {
        const idx = asset.verses.findIndex(v => v.s === startSurah && v.a === 1);
        if (idx >= 0) startIndex = idx;
      } else if (playScope === 'fromHere') {
        const first = pages[page - 1]?.verses[0];
        const idx = first ? asset.verses.findIndex(v => v.s === first.s && v.a === first.a) : 0;
        if (idx >= 0) startIndex = idx;
      } else {
        startIndex = 0;
      }
      const stopSurah = playScope === 'surah' ? startSurah : undefined;
      setActive(null);
      void playContinuousFrom(startIndex, stopSurah);
    } else if (playState === 'playing') {
      pauseContinuous();
    } else {
      resumeContinuous();
    }
  };

  // Track mobile breakpoint for sheet vs popover.
  useEffect(() => {
    const onResize = () => setIsMobileSheet(window.innerWidth <= 767);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Outside click / Esc / focus / swipe for ayah popover.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePopover(); }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (isMobileSheet) return;
      const pop = popoverRef.current;
      if (pop && !pop.contains(e.target as Node)) { closePopover(); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    // focus first focusable
    const t = setTimeout(() => {
      const pop = popoverRef.current;
      if (pop) {
        const focusable = pop.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
      }
    }, 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
      clearTimeout(t);
    };
  }, [active, isMobileSheet]);

  // Compute popover position when active ayah changes.
  const computePosition = useCallback(() => {
    if (!active || isMobileSheet) return;
    const ayahEl = document.querySelector(`[data-ayah="${active.s}:${active.a}"]`) as HTMLElement | null;
    if (!ayahEl) return;
    const rect = ayahEl.getBoundingClientRect();
    const popWidth = Math.min(560, window.innerWidth - 32);
    const col = document.querySelector('.mf-pages') as HTMLElement | null;
    const colRect = col ? col.getBoundingClientRect() : {left: 0, width: window.innerWidth};
    const colWidth = colRect.width > 0 ? colRect.width : Math.min(760, window.innerWidth);
    const colLeft = colRect.left > 0 ? colRect.left : (window.innerWidth - colWidth) / 2;
    let left = colLeft + (colWidth - popWidth) / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - popWidth - 16));
    const gap = 12;
    const pop = popoverRef.current;
    const popH = pop ? pop.offsetHeight : 360;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let placement: 'below' | 'above' = 'below';
    let top = rect.bottom + gap;
    if (spaceBelow < popH && spaceAbove >= popH) {
      placement = 'above';
      top = rect.top - popH - gap;
    } else if (spaceBelow < popH && spaceAbove < popH) {
      placement = 'below';
      top = Math.max(gap, window.innerHeight - popH - 16);
    }
    setPopoverPos({top, left, placement});
  }, [active, isMobileSheet]);

  useEffect(() => {
    if (!active) return;
    ayahRef.current = active;
    if (isMobileSheet) {
      const ayahEl = document.querySelector(`[data-ayah="${active.s}:${active.a}"]`) as HTMLElement | null;
      if (ayahEl) {
        const rect = ayahEl.getBoundingClientRect();
        const target = window.scrollY + rect.top - window.innerHeight / 3;
        window.scrollTo({top: Math.max(0, target), behavior: 'smooth'});
      }
      return;
    }
    const t = setTimeout(computePosition, 0);
    return () => clearTimeout(t);
  }, [active, isMobileSheet, computePosition]);

  useEffect(() => {
    if (!active || isMobileSheet) return;
    const onScrollResize = () => {
      computePosition();
    };
    window.addEventListener('scroll', onScrollResize, {passive: true});
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [active, isMobileSheet, computePosition]);

  // Track mobile breakpoint
  useEffect(() => {
    const onResize = () => setIsMobileSheet(window.innerWidth <= 767);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const results = useMemo(() => (search.trim().length >= 2 ? searchVerses(asset, search, 30) : []), [asset, search]);

  // Outside click / Esc / focus / swipe for ayah popover.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePopover(); }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (isMobileSheet) return;
      const pop = popoverRef.current;
      if (pop && !pop.contains(e.target as Node)) { closePopover(); }
    };
    document.addEventListener('keydown', onKey);
    if (!isMobileSheet) document.addEventListener('mousedown', onClickOutside);
    const t = setTimeout(() => {
      const pop = popoverRef.current;
      if (pop) {
        const focusable = pop.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
      }
    }, 50);
    let startY = 0;
    const handle = popoverRef.current?.querySelector('.mf-drag-handle');
    const onTouchStart = (e: Event) => { startY = (e as TouchEvent).touches[0].clientY; };
    const onTouchEnd = (e: Event) => {
      const endY = (e as TouchEvent).changedTouches[0].clientY;
      if (endY - startY > 60) { closePopover(); }
    };
    if (isMobileSheet && handle) {
      handle.addEventListener('touchstart', onTouchStart, {passive: true});
      handle.addEventListener('touchend', onTouchEnd, {passive: true});
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
      clearTimeout(t);
      if (isMobileSheet && handle) {
        handle.removeEventListener('touchstart', onTouchStart);
        handle.removeEventListener('touchend', onTouchEnd);
      }
    };
  }, [active, isMobileSheet]);

  const meta = pageMeta.get(page);
  const progress = Math.round((page / pages.length) * 100);

  const selectVerse = useCallback((verse: QuranVerse) => {
    if (active && active.s === verse.s && active.a === verse.a) {
      setActive(null);
      stopAudio();
      return;
    }
    setActive(verse);
    setSheetTab('tafsir');
    setNoteText('');
  }, [active]);

  if (mode === 'reflow') {
    return <div className="mf-reflow-wrap">
      <div className="mf-mode-switch">
        <button type="button" className="soft-btn" onClick={() => setMode('pages')}>← عرض صفحات المصحف</button>
        <span className="muted small">الوضع الحالي: قراءة مرنة آية بآية</span>
      </div>
      <QuranReader asset={asset} state={state} onState={onState} notify={notify}/>
    </div>;
  }

  return <div className="mf-shell">
    <div className="mf-toolbar" role="toolbar" aria-label="أدوات المصحف">
      <div className="mf-toolbar-head">
        <h1 className="mf-toolbar-title">المصحف الشريف</h1>
        <p className="mf-toolbar-desc">تمرير رأسي متصل — قراءة على هدي الكتاب والسنة.</p>
      </div>
      <div className="mf-grid mf-grid-3">
        <section className="mf-section mf-sec-nav">
          <h3 className="mf-sec-title"><Search size={17}/> التنقل والبحث</h3>
          <div className="mf-row mf-row-nav">
            <div className="mf-field">
              <label className="mf-field-label">النوع</label>
              <div className="mf-select-wrap">
                <select value={jumpKind} onChange={event => setJumpKind(event.target.value as typeof jumpKind)} aria-label="نوع الانتقال">
                  <option value="surah">سورة</option><option value="juz">جزء</option><option value="hizb">حزب</option><option value="page">صفحة</option>
                </select>
              </div>
            </div>
            <div className="mf-field mf-field-grow">
              <label className="mf-field-label">الانتقال إلى</label>
              <div className="mf-select-wrap">
                <select value={jumpValue} onChange={event => setJumpValue(event.target.value)} aria-label="الانتقال إلى">
                  {jumpOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <button type="button" className="mf-btn primary" onClick={jump} aria-label="انتقال"><ChevronLeft size={17}/>انتقال</button>
            <button type="button" className={`mf-btn ${searchOpen ? 'primary' : 'soft'}`} onClick={() => setSearchOpen(value => !value)} aria-pressed={searchOpen} aria-label="بحث"><Search size={17}/>بحث</button>
          </div>
        </section>
        <section className="mf-section mf-sec-audio">
          <h3 className="mf-sec-title"><Play size={17}/> الاستماع</h3>
          <div className="mf-row mf-row-audio">
            <div className="mf-field mf-field-grow">
              <label className="mf-field-label">القارئ</label>
              <div className="mf-select-wrap">
                <select value={reciterId} onChange={event => setReciterId(Number(event.target.value))} aria-label="القارئ">
                  {QURAN_COM_RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mf-field mf-field-grow">
              <label className="mf-field-label">النطاق</label>
              <div className="mf-select-wrap">
                <select value={playScope} onChange={event => setPlayScope(event.target.value as 'surah' | 'fromHere' | 'all')} aria-label="نطاق التشغيل">
                  <option value="surah">هذه السورة</option><option value="fromHere">من هنا</option><option value="all">المصحف كاملًا</option>
                </select>
              </div>
            </div>
            <button type="button" className="mf-btn primary" onClick={togglePlay} aria-pressed={playState === 'playing'}>
              {playState === 'idle' ? <><Play size={17}/>تشغيل</> : playState === 'playing' ? <><Pause size={17}/>إيقاف مؤقت</> : <><Play size={17}/>تشغيل</>}
            </button>
          </div>
          {(playState !== 'idle' || currentKey) && <div className="mf-nowplaying">
            <Play size={13}/> الآن يُشغَّل: {currentKey ? `${surahInfo(asset, Number(currentKey.split(':')[0]))?.name ?? ''} — ${QURAN_COM_RECITERS.find(r => r.id === reciterId)?.name ?? ''}` : '—'}
          </div>}
        </section>
        <section className="mf-section mf-sec-reading">
          <h3 className="mf-sec-title"><BookOpen size={17}/> القراءة</h3>
          <div className="mf-reading-grid">
            <div className="mf-group">
              <span className="mf-group-label">تمرير تلقائي</span>
              <button type="button" className={autoScroll ? 'mf-btn soft selected' : 'mf-btn soft'} aria-pressed={autoScroll} onClick={() => setAutoScroll(value => !value)}>{autoScroll ? <Pause size={16}/> : <Play size={16}/>}{autoScroll ? 'إيقاف التمرير' : 'تمرير تلقائي'}</button>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">سرعة التمرير</span>
              <div className="mf-speed">
                <div className="mf-speed-head">
                  <span className="mf-speed-val">{AUTO_SCROLL_SPEEDS.find(s => s.value === autoSpeed)?.label ?? 'متوسط'}</span>
                </div>
                <input type="range" min={40} max={1400} step={20} value={autoSpeed} onChange={event => setAutoSpeed(Number(event.target.value))} aria-label="سرعة التمرير التلقائي" className="mf-slider"/>
              </div>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">حجم الخط</span>
              <div className="mf-font">
                <button type="button" className="mf-btn sm" aria-label="تصغير الخط" onClick={() => setFontSize(value => Math.max(18, value - 1))}>−</button>
                <span className="mf-font-val">{toArabicNumber(fontSize)}</span>
                <button type="button" className="mf-btn sm" aria-label="تكبير الخط" onClick={() => setFontSize(value => Math.min(42, value + 1))}>+</button>
              </div>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">قراءة مرنة</span>
              <button type="button" className="mf-btn soft" onClick={() => setMode('reflow')}><BookOpen size={16}/>قراءة مرنة</button>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">علاماتي</span>
              <button type="button" className="mf-btn soft" onClick={() => setBookmarksOpen(true)}><Bookmark size={16}/>علاماتي <span className="mf-badge">{toArabicNumber(bookmarks.length)}</span></button>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">تقدم الختمة</span>
              <button type="button" className="mf-btn soft" onClick={() => setKhatmahOpen(true)}><TrendingUp size={16}/>تقدم الختمة</button>
            </div>
          </div>
        </section>
      </div>
      {searchOpen && <div className="mf-search">
        <label><Search size={15}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالكلمة (بحث إملائي منفصل عن نص المصحف)"/></label>
        {search.trim().length >= 2 && <p className="muted small">{toArabicNumber(results.length)} نتيجة{results.length >= 30 ? ' (أول ٣٠)' : ''}</p>}
        <ul>{results.map(result => (
          <li key={`${result.verse.s}:${result.verse.a}`}>
            <button type="button" onClick={() => { setSearchOpen(false); setSearch(''); scrollToPage(result.verse.p); selectVerse(result.verse); }}>
              <strong>{result.surahName} · آية {toArabicNumber(result.verse.a)} · صفحة {toArabicNumber(result.verse.p)}</strong>
              <span>{result.body.length > 140 ? `${result.body.slice(0, 140)}…` : result.body}</span>
            </button>
          </li>
        ))}</ul>
        {search.trim().length >= 2 && results.length === 0 && <p className="muted small">لا توجد نتائج مطابقة.</p>}
      </div>}
      <div className="mf-statusbar">
        <span className="mf-status-text">{meta ? `صفحة ${toArabicNumber(page)} من ${toArabicNumber(pages.length)} · الجزء ${toArabicNumber(meta.juz)} · الحزب ${toArabicNumber(meta.hizb)}` : `صفحة ${toArabicNumber(page)}`}</span>
        <div className="mf-progress" aria-hidden="true"><span style={{width: `${progress}%`}}/></div>
      </div>
    </div>
    <div className="mf-bottom-bar">
      <button type="button" className={`mf-btn sm ${playState === 'playing' ? 'primary' : 'primary'}`} onClick={togglePlay} aria-pressed={playState === 'playing'} aria-label="تشغيل أو إيقاف القراءة">
        {playState === 'playing' ? <Pause size={17}/> : <Play size={17}/>} {playState === 'playing' ? 'إيقاف مؤقت' : 'تشغيل'}
      </button>
      <button type="button" className={autoScroll ? 'mf-btn sm soft selected' : 'mf-btn sm soft'} onClick={() => setAutoScroll(value => !value)} aria-pressed={autoScroll} aria-label="تمرير تلقائي">
        {autoScroll ? <Pause size={15}/> : <Play size={15}/>} {autoScroll ? 'إيقاف التمرير' : 'تمرير تلقائي'}
      </button>
      <button type="button" className={`mf-btn sm ${searchOpen ? 'primary' : 'soft'}`} onClick={() => setSearchOpen(value => !value)} aria-pressed={searchOpen} aria-label="بحث">
        <Search size={16}/> بحث
      </button>
      <button type="button" className="mf-btn sm soft" onClick={() => setBookmarksOpen(true)} aria-label="علاماتي">
        <Bookmark size={16}/> علاماتي
      </button>
    </div>

    {/* Mobile sticky bottom bar */}
    <div className="mf-bottom-bar">
      <button type="button" className={`mf-btn sm ${playState === 'playing' ? 'primary' : 'primary'}`} onClick={togglePlay} aria-pressed={playState === 'playing'} aria-label="تشغيل أو إيقاف القراءة">
        {playState === 'playing' ? <Pause size={17}/> : <Play size={17}/>} {playState === 'playing' ? 'إيقاف مؤقت' : 'تشغيل'}
      </button>
      <button type="button" className={autoScroll ? 'mf-btn sm soft selected' : 'mf-btn sm soft'} onClick={() => setAutoScroll(value => !value)} aria-pressed={autoScroll} aria-label="تمرير تلقائي">
        {autoScroll ? <Pause size={15}/> : <Play size={15}/>} {autoScroll ? 'إيقاف التمرير' : 'تمرير تلقائي'}
      </button>
      <button type="button" className={`mf-btn sm ${searchOpen ? 'primary' : 'soft'}`} onClick={() => setSearchOpen(value => !value)} aria-pressed={searchOpen} aria-label="بحث">
        <Search size={16}/> بحث
      </button>
      <button type="button" className="mf-btn sm soft" onClick={() => setBookmarksOpen(true)} aria-label="علاماتي">
        <Bookmark size={16}/> علاماتي
      </button>
    </div>

    <MushafPageList
      asset={asset}
      pages={pages}
      surahStarts={surahStarts}
      sajdaKeys={sajdaKeys}
      basmala={basmala}
      fontSize={fontSize}
      activeKey={active ? `${active.s}:${active.a}` : ''}
      playingKey={playingKey}
      onSelect={selectVerse}
      registerPage={registerPage}
    />

    {active && <div
      className={isMobileSheet ? 'mf-sheet-backdrop mf-scrim-light' : 'mf-popover-anchor'}
      onClick={isMobileSheet ? (e => { if (e.target === e.currentTarget) { closePopover(); } }) : undefined}
    >
      <div
        ref={popoverRef}
        className={isMobileSheet ? 'mf-sheet mf-sheet-mobile' : 'mf-popover'}
        role="dialog"
        aria-modal={isMobileSheet ? 'true' : 'false'}
        aria-label={`${surahInfo(asset, active.s)?.name ?? `سورة ${active.s}`}: ${toArabicNumber(active.a)}`}
        style={isMobileSheet ? undefined : { top: popoverPos.top, left: popoverPos.left, width: Math.min(560, (typeof window !== 'undefined' ? window.innerWidth : 560) - 32), maxWidth: 560 }}
        onClick={event => event.stopPropagation()}
      >
        {isMobileSheet && <div className="mf-drag-handle" aria-hidden="true"/>}
        <div className="mf-sheet-head">
          <div>
            <strong>{surahInfo(asset, active.s)?.name ?? `سورة ${active.s}`}: {toArabicNumber(active.a)}</strong>
            <small className="muted">صفحة {toArabicNumber(active.p)} · الجزء {toArabicNumber(active.j)}</small>
          </div>
          <button type="button" className="mf-icon-btn" onClick={() => { closePopover(); }} aria-label="إغلاق"><X size={18}/></button>
        </div>

        <div className="mf-sheet-actions">
          <button type="button" className={sheetTab === 'tafsir' ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => setSheetTab('tafsir')}>تفسير</button>
          <button type="button" className={sheetTab === 'translation' ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => setSheetTab('translation')}>ترجمة</button>
          <button type="button" className={playingKey === `${active.s}:${active.a}` ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => void playAyah(active)}>
            {audioLoading ? <Loader2 size={18} className="spin"/> : playingKey === `${active.s}:${active.a}` ? <Square size={18}/> : <Play size={18}/>} تشغيل
          </button>
          <button type="button" className="mf-btn soft" onClick={() => { if (active) { const idx = asset.verses.findIndex(v => v.s === active.s && v.a === active.a); if (idx >= 0) { setActive(null); void playContinuousFrom(idx, undefined); } } }}><Play size={18}/> متواصل من هنا</button>
          <button type="button" className="mf-btn soft" onClick={async () => { await copyText(`${verseBody(active.t)} (${surahInfo(asset, active.s)?.name ?? active.s}: ${toArabicNumber(active.a)})`); notify('نُسخت الآية مع مرجعها.'); }}><Copy size={18}/> نسخ</button>
          <button type="button" className="mf-btn soft" onClick={async () => { const result = await shareText(`${verseBody(active.t)} (${surahInfo(asset, active.s)?.name ?? active.s}: ${toArabicNumber(active.a)})`); notify(result === 'shared' ? 'فُتحت المشاركة.' : 'نُسخت الآية للمشاركة.'); }}><Share2 size={18}/> مشاركة</button>
          <button type="button" className={isBookmarked(active) ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => toggleBookmark(active)}>
            {isBookmarked(active) ? <BookmarkCheck size={18}/> : <Bookmark size={18}/>} علامة
          </button>
        </div>

        {sheetTab !== 'actions' && <div className="mf-sheet-content">
          <label className="mf-content-select">{sheetTab === 'tafsir' ? 'التفسير' : 'الترجمة'}
            <select value={sheetTab === 'tafsir' ? tafsirId : translationId} onChange={event => sheetTab === 'tafsir' ? setTafsirId(Number(event.target.value)) : setTranslationId(Number(event.target.value))}>
              {(sheetTab === 'tafsir' ? TAFSIRS : TRANSLATIONS).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {!online && <p className="mf-content-note"><WifiOff size={13}/> لا يوجد اتصال: ما فُتح سابقًا من تفسير وترجمة محفوظ على الجهاز، وغيره يحتاج إنترنت.</p>}
          {content.status === 'loading' && <p className="muted small">جارٍ التحميل…</p>}
          {content.status === 'error' && <p className="muted small" role="alert">{online ? content.error : 'غير متاح دون اتصال.'}</p>}
          {content.status === 'empty' && <p className="muted small">{sheetTab === 'tafsir' ? 'لا يوجد تفسير لهذه الآية في هذا المصدر.' : 'لا توجد ترجمة لهذه الآية في هذا المصدر.'}</p>}
          {content.status === 'success' && <p className="mf-content-text">{content.data}</p>}
        </div>}

        <div className="mf-sheet-note">
          <label>ملاحظة شخصية على هذه الآية
            <textarea value={noteText} onChange={event => setNoteText(event.target.value)} maxLength={4000} placeholder="تأمل أو فائدة خاصة بك… تبقى على هذا الجهاز."/>
          </label>
          <button type="button" className="mf-btn primary mf-btn-full" onClick={addNote}><StickyNote size={18}/> حفظ الملاحظة</button>
        </div>
        <p className="mf-sheet-foot"><InternetBadge compact/> التلاوة: {QURAN_COM_RECITERS.find(r => r.id === reciterId)?.name ?? 'مشاري راشد العفاسي'} — تحتاج إنترنت؛ النص والتفسير المحفوظ لا يحتاجان.</p>
      </div>
    </div>}

    {bookmarksOpen && <div className="mf-sheet-backdrop" onClick={() => setBookmarksOpen(false)}>
      <div className="mf-sheet" role="dialog" aria-label="علاماتي" onClick={event => event.stopPropagation()}>
        <div className="mf-sheet-head">
          <div><strong>علاماتي</strong><small className="muted"> {toArabicNumber(bookmarks.length)} علامة — محفوظة على هذا الجهاز</small></div>
          <button type="button" className="icon-btn" onClick={() => setBookmarksOpen(false)} aria-label="إغلاق"><X size={18}/></button>
        </div>
        {bookmarks.length === 0 ? <p className="muted">لا توجد علامات بعد. افتح آية ثم اضغط «علامة».</p> : <ul className="mf-bookmark-list">
          {bookmarks.map(bm => (
            <li key={bm.id}>
              <div className="mf-bm-row">
                <input className="mf-bm-name" value={bm.name ?? bm.label} onChange={event => {
                  const value = event.target.value;
                  patch({bookmarks: (stateRef.current.bookmarks ?? []).map(item => item.id === bm.id ? {...item, name: value} : item)});
                }} aria-label="اسم العلامة"/>
                <small className="muted">{surahInfo(asset, bm.surah)?.name ?? `سورة ${bm.surah}`} · آية {toArabicNumber(bm.ayah)} · صفحة {toArabicNumber(bm.page ?? (asset.verses.find(v => v.s === bm.surah && v.a === bm.ayah)?.p ?? 1))}</small>
              </div>
              <div className="mf-bm-actions">
                <button type="button" className="soft-btn" onClick={() => { const target = bm.page ?? (asset.verses.find(v => v.s === bm.surah && v.a === bm.ayah)?.p ?? 1); setBookmarksOpen(false); scrollToPage(target); const v = asset.verses.find(x => x.s === bm.surah && x.a === bm.ayah); if (v) { setActive(v); setSheetTab('actions'); } }}>انتقال</button>
                <button type="button" className="icon-btn" aria-label="حذف العلامة" onClick={() => { patch({bookmarks: (stateRef.current.bookmarks ?? []).filter(item => item.id !== bm.id)}); notify('أُزيلت العلامة.'); }}><Trash2 size={15}/></button>
              </div>
            </li>
          ))}
        </ul>}
      </div>
    </div>}

    {khatmahOpen && <div className="mf-sheet-backdrop" onClick={() => setKhatmahOpen(false)}>
      <div className="mf-sheet" role="dialog" aria-label="تقدم الختمة" onClick={event => event.stopPropagation()}>
        <div className="mf-sheet-head">
          <div><strong>تقدم الختمة</strong><small className="muted"> تتبّع تقدمك في المصحف (٦٠٤ صفحة)</small></div>
          <button type="button" className="icon-btn" onClick={() => setKhatmahOpen(false)} aria-label="إغلاق"><X size={18}/></button>
        </div>
        <div className="mf-khatmah">
          <div className="mf-khatmah-bar" role="progressbar" aria-valuenow={Math.round(maxPage / 604 * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{width: `${Math.max(2, Math.round(maxPage / 604 * 100))}%`}}/>
          </div>
          <p className="mf-khatmah-stat">أقصى صفحة وصلت إليها: <strong>{toArabicNumber(maxPage)}</strong> من {toArabicNumber(604)} ({toArabicNumber(Math.round(maxPage / 604 * 100))}٪)</p>
          <p className="muted small">الصفحة الحالية: {toArabicNumber(page)} · الجزء {toArabicNumber(pageMeta.get(page)?.juz ?? 1)} · الحزب {toArabicNumber(pageMeta.get(page)?.hizb ?? 1)}</p>
          <label className="mf-khatmah-pace">وتيرة القراءة (صفحات/يوم)
            <select value={khatmahPace} onChange={event => setKhatmahPace(Number(event.target.value))}>
              {[3, 5, 10, 15, 20].map(value => <option key={value} value={value}>{toArabicNumber(value)}</option>)}
            </select>
          </label>
          {maxPage < 604 && <p className="muted small">المتبقي {toArabicNumber(604 - maxPage)} صفحة ≈ {toArabicNumber(Math.ceil((604 - maxPage) / khatmahPace))} يومًا بوتيرتك.</p>}
          {maxPage >= 604 && <p className="mf-khatmah-done">أتممت ختمة — تهانينا. أعد الضبط لبدء ختمة جديدة.</p>}
          <button type="button" className="soft-btn" onClick={() => { if (window.confirm('إعادة ضبط تقدم الختمة؟')) { setMaxPage(1); try { localStorage.setItem('quran-khatmah-maxpage', '1'); } catch { /* تجاهل */ } notify('أُعيد ضبط التقدم.'); } }}>إعادة ضبط</button>
        </div>
      </div>
    </div>}

  </div>;
}

type ListProps = {
  asset: QuranAsset;
  pages: PageBlock[];
  surahStarts: Map<number, Set<number>>;
  sajdaKeys: Set<string>;
  basmala: string;
  fontSize: number;
  activeKey: string;
  playingKey: string;
  onSelect: (verse: QuranVerse) => void;
  registerPage: (index: number, el: HTMLDivElement | null) => void;
};

// قائمة الصفحات معزولة عن تحديثات التمرير: لا تُعاد إلا عند تغيّر محتوى فعلي،
// وكل صفحة خارج الشاشة تُستبعد من التخطيط والرسم عبر content-visibility.
const MushafPageList = function MushafPageList({asset, pages, surahStarts, sajdaKeys, basmala, fontSize, activeKey, playingKey, onSelect, registerPage}: ListProps) {
  return <div className="mf-pages" style={{fontSize: `${fontSize}px`}} dir="rtl">
    {pages.map(block => {
      const starts = surahStarts.get(block.page);
      return <div key={block.page} className="mf-page" data-page={block.page} ref={el => registerPage(block.page - 1, el)}>
        <div className="mf-page-head">
          <span>الجزء {toArabicNumber(block.verses[0]?.j ?? 1)}</span>
          <span className="mf-page-juz">صفحة {toArabicNumber(block.page)}</span>
          <span>الحزب {toArabicNumber(block.verses[0]?.h ?? 1)}</span>
        </div>
        <p className="mf-page-text">
          {block.verses.map(verse => {
            const key = `${verse.s}:${verse.a}`;
            const startsSurah = Boolean(starts?.has(verse.s) && verse.a === 1);
            return <span key={key}>
              {startsSurah && <span className="mf-surah-band"><span className="mf-surah-band-inner">سُورَةُ {surahInfo(asset, verse.s)?.name ?? ''}</span></span>}
              {startsSurah && showsBasmala(verse.s) && <span className="mf-basmala">{basmala}</span>}
              <span
                role="button"
                tabIndex={0}
                className={`mf-ayah ${activeKey === key ? 'active' : ''} ${playingKey === key ? 'playing' : ''}`}
                data-ayah={key}
                onClick={() => onSelect(verse)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(verse); } }}
                aria-label={`الآية ${toArabicNumber(verse.a)} من سورة ${surahInfo(asset, verse.s)?.name ?? verse.s}`}
              >
                {verseBody(verse.t)}
                <span className="mf-marker">{verseMarker(verse.t) || `﴿${toArabicNumber(verse.a)}﴾`}</span>
                {sajdaKeys.has(key) && <span className="mf-sajda" title="موضع سجدة">۩</span>}
              </span>
            </span>;
          })}
        </p>
        <div className="mf-page-foot">{toArabicNumber(block.page)}</div>
      </div>;
    })}
    <p className="mf-source">النص العثماني من {asset.source} · رواية {asset.narration}. حدود الصفحات والأجزاء والأحزاب كما في مصدر المجمع. التلاوات الصوتية والبث المباشر يعملان عبر الإنترنت فقط.</p>
  </div>;
}

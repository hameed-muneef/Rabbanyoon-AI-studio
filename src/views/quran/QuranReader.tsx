import {useEffect,useMemo,useRef,useState} from 'react';
import {
  Bookmark, BookmarkCheck, Copy, Share2, Search, StickyNote, Plus, Trash2,
  ChevronRight, ChevronLeft, Save, ListChecks, Play, Pause, Square, Loader2,
  Repeat, RotateCcw
} from 'lucide-react';
import type {QuranAsset} from '../../quran/types';
import type {QuranLearningState, QuranReflection} from '../../quran/types';
import {
  basmalaText, findVerse, navigationTarget, referenceLabel, searchVerses,
  showsBasmala, surahInfo, surahVerses, toArabicNumber, verseBody, verseMarker
} from '../../quran/content';
import {dateKey} from '../../quran/learning';
import {uid} from '../../id';
import {EmptyNote, QuranVerseText, ReferenceBadge, copyText, shareText} from './ui';
import {fetchTranslation, fetchTafsir, fetchAsbabNuzul, TRANSLATIONS, TAFSIRS, type FetchState} from '../../quran/content-api';
import {loadReciters, audioUrl, defaultMoshaf, type Reciter} from '../../quran/audio';
import {fetchAyahAudioUrl, fetchSurahAyahAudioUrls} from '../../quran/ayah-audio';
import {InternetBadge, useOnline} from '../../online';
import {passageAyahs, progressLabel, clampRepeat, type MemorizationProgress} from '../../quran/memorization-audio';

const AUTO_SCROLL_SPEEDS = [
  {value: 120, label: 'بطيء جدًا'},
  {value: 240, label: 'بطيء'},
  {value: 450, label: 'متوسط'},
  {value: 800, label: 'سريع'},
  {value: 1400, label: 'الأسرع'},
];

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
};

const emptyReflection = (): Omit<QuranReflection, 'id' | 'createdAt' | 'updatedAt'> => ({
  sourceType: 'quran', learned: '', meaning: '', action: '', trait: '', intention: '', isPrivate: true
});

export default function QuranReader({asset, state, onState, notify}: Props) {
  const online = useOnline();
  const start = state.readingPosition;
  const [surahNumber, setSurahNumber] = useState(start?.surah ?? 1);
  const [focusAyah, setFocusAyah] = useState(start?.ayah ?? 1);
  const [surahFilter, setSurahFilter] = useState('');
  const [readingMode, setReadingMode] = useState<'continuous' | 'verse'>(() => {
    try { return localStorage.getItem('quran-reading-mode') === 'continuous' ? 'continuous' : 'verse'; } catch { return 'verse'; }
  });
  useEffect(() => {
    try { localStorage.setItem('quran-reading-mode', readingMode); } catch { /* ignore */ }
  }, [readingMode]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [noteText, setNoteText] = useState('');
  const [noteAyah, setNoteAyah] = useState<number | null>(null);
  const [contentAyah, setContentAyah] = useState<number | null>(null);
  const [contentTab, setContentTab] = useState<'translation' | 'tafsir' | 'asbab'>('tafsir');
  const [translationId, setTranslationId] = useState<number>(TRANSLATIONS[0].id);
  const [tafsirId, setTafsirId] = useState<number>(TAFSIRS[0].id);
  const [contentState, setContentState] = useState<FetchState<string>>({ status: 'idle', data: null });

  useEffect(() => {
    if (contentAyah == null) { setContentState({ status: 'idle', data: null }); return; }
    const key = `${surahNumber}:${contentAyah}`;
    const controller = new AbortController();
    setContentState({ status: 'loading', data: null });
    const run = async () => {
      try {
        let text: string | null = null;
        if (contentTab === 'translation') text = await fetchTranslation(key, translationId, controller.signal);
        else if (contentTab === 'tafsir') text = await fetchTafsir(key, tafsirId, controller.signal);
        else text = await fetchAsbabNuzul(key, controller.signal);
        if (controller.signal.aborted) return;
        setContentState(text ? { status: 'success', data: text } : { status: 'empty', data: null });
      } catch (e) {
        if (controller.signal.aborted) return;
        setContentState({ status: 'error', data: null, error: 'تعذّر جلب البيانات. تحقق من الاتصال.' });
      }
    };
    void run();
    return () => controller.abort();
  }, [contentAyah, contentTab, translationId, tafsirId, surahNumber]);
  const [reflectAyah, setReflectAyah] = useState<number | null>(null);
  const [reflection, setReflection] = useState(emptyReflection);
  const [jumpKind, setJumpKind] = useState<'juz' | 'hizb' | 'page'>('juz');
  const [jumpValue, setJumpValue] = useState(1);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-autoscroll-speed')); return Number.isFinite(v) && v > 0 ? v : 240; } catch { return 240; }
  });
  const [scrollMenu, setScrollMenu] = useState<{x:number;y:number}|null>(null);
  const autoScrollSpeedRef = useRef(autoScrollSpeed);

  // Audio recitation
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [reciterId, setReciterId] = useState<number | null>(null);
  const [moshafId, setMoshafId] = useState<number | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>('');

  useEffect(() => {
    let active = true;
    loadReciters().then(list => {
      if (!active) return;
      setReciters(list);
      // Pick a default reciter (Abdul Basit or first available)
      const defaultReciter = list.find(r => r.name.includes('عبد الباسط')) || list[0];
      if (defaultReciter) {
        setReciterId(defaultReciter.id);
        const m = defaultMoshaf(defaultReciter);
        if (m) setMoshafId(m.id);
      }
    }).catch(() => { if (active) setAudioError('تعذر تحميل قائمة القراء.'); });
    return () => { active = false; };
  }, []);

  const currentReciter = reciters.find(r => r.id === reciterId);
  const currentMoshaf = currentReciter?.moshaf.find(m => m.id === moshafId);

  const playSurah = () => {
    if (!currentMoshaf) return;
    const url = audioUrl(currentMoshaf, surahNumber);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioLoading(true);
    setAudioError('');
    const audio = new Audio(url);
    audioRef.current = audio;
    audioUrlRef.current = url;
    audio.addEventListener('canplay', () => setAudioLoading(false), {once: true});
    audio.addEventListener('playing', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('ended', () => setIsPlaying(false));
    audio.addEventListener('error', () => { setAudioLoading(false); setAudioError('تعذر تشغيل التلاوة.'); });
    audio.play().catch(() => { setAudioLoading(false); setAudioError('تعذر تشغيل التلاوة.'); });
  };

  const togglePlay = () => {
    if (memoStatus === 'playing' || memoStatus === 'paused') stopMemo();
    // تلاوة السورة تُوقف صوت الآية المنفردة — صوت واحد فقط في كل لحظة.
    stopAyahAudio();
    if (!audioRef.current) { playSurah(); return; }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => setAudioError('تعذر تشغيل التلاوة.'));
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setAudioLoading(false);
  };

  // Per-ayah audio (Quran.com)
  const [ayahReciterId] = useState<number>(7); // Mishary Alafasy default
  const [ayahAudioUrls, setAyahAudioUrls] = useState<Map<number, string>>(new Map());
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const ayahAudioRef = useRef<HTMLAudioElement | null>(null);
  // يضمن أن صوت آية واحدة فقط يعمل في أي لحظة: كل تشغيل جديد يُبطل الطلبات السابقة.
  const ayahPlayTokenRef = useRef(0);

  const stopAyahAudio = () => {
    ayahPlayTokenRef.current += 1;
    if (ayahAudioRef.current) {
      ayahAudioRef.current.pause();
      ayahAudioRef.current = null;
    }
    setPlayingAyah(null);
  };

  const playAyah = async (ayah: number) => {
    // Stop memo if running
    if (memoStatus === 'playing' || memoStatus === 'paused') stopMemo();
    // Stop surah-level audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
    // Stop the currently playing ayah — only one ayah voice runs at a time
    if (ayahAudioRef.current) {
      ayahAudioRef.current.pause();
      ayahAudioRef.current = null;
    }
    const token = ++ayahPlayTokenRef.current;
    setPlayingAyah(ayah);
    let url: string | null = ayahAudioUrls.get(ayah) ?? null;
    if (!url) {
      url = await fetchAyahAudioUrl(ayahReciterId, surahNumber, ayah);
      // تم تشغيل آية أخرى أثناء جلب الرابط — لا تُشغّل هذه.
      if (token !== ayahPlayTokenRef.current) return;
      if (url) setAyahAudioUrls(prev => new Map(prev).set(ayah, url!));
    }
    if (!url) { if (token === ayahPlayTokenRef.current) setPlayingAyah(null); return; }
    const audio = new Audio(url);
    ayahAudioRef.current = audio;
    audio.addEventListener('ended', () => {
      // Auto-play next ayah
      const idx = verses.findIndex(v => v.a === ayah);
      if (token === ayahPlayTokenRef.current) {
        if (idx >= 0 && idx < verses.length - 1) playAyah(verses[idx + 1].a);
        else setPlayingAyah(null);
      }
    });
    audio.addEventListener('error', () => { if (token === ayahPlayTokenRef.current) setPlayingAyah(null); });
    audio.play().catch(() => { if (token === ayahPlayTokenRef.current) setPlayingAyah(null); });
  };

  // Stop audio when surah changes
  useEffect(() => { stopAudio(); stopAyahAudio(); stopMemo(); }, [surahNumber]);

  // Cleanup on unmount
  useEffect(() => { return () => { stopAudio(); stopAyahAudio(); }; }, []);

  useEffect(()=>{autoScrollSpeedRef.current=autoScrollSpeed},[autoScrollSpeed]);
useEffect(() => { try { localStorage.setItem('quran-autoscroll-speed', String(autoScrollSpeed)); } catch { /* ignore */ } }, [autoScrollSpeed]);
  useEffect(()=>{
    if(!autoScroll) return;
    let frame=0;
    let last=performance.now();
    const root=document.documentElement;
    root.style.scrollBehavior='auto';
    // Keep screen awake while auto-scrolling (best-effort, supported browsers only).
    let wakeLock: any = null;
    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch { /* ignore unsupported / denied */ }
    };
    void acquireWakeLock();
    const tick=(now:number)=>{
      const delta=Math.max(0,(now-last)/1000);
      last=now;
      root.scrollTop += autoScrollSpeedRef.current*delta;
      const maxScroll=document.documentElement.scrollHeight-window.innerHeight;
      if(window.scrollY>=maxScroll-4){setAutoScroll(false);return}
      frame=requestAnimationFrame(tick);
    };
    const pauseOnManualScroll=()=>setAutoScroll(false);
    window.addEventListener('wheel',pauseOnManualScroll,{passive:true});
    window.addEventListener('touchstart',pauseOnManualScroll,{passive:true});
    frame=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('wheel',pauseOnManualScroll);window.removeEventListener('touchstart',pauseOnManualScroll);root.style.scrollBehavior='smooth'; if (wakeLock) try { wakeLock.release(); } catch {}};
  },[autoScroll]);
  useEffect(()=>{setAutoScroll(false)},[surahNumber]);

  // ---- Memorization mode state ----
  const [memoMode, setMemoMode] = useState(false);
  const [memoStart, setMemoStart] = useState(1);
  const [memoEnd, setMemoEnd] = useState(1);
  const [memoAyahRepeat, setMemoAyahRepeat] = useState(3);
  const [memoPassageRepeat, setMemoPassageRepeat] = useState(1);
  const [memoStatus, setMemoStatus] = useState<'idle' | 'playing' | 'paused' | 'complete'>('idle');
  const [memoProgress, setMemoProgress] = useState<MemorizationProgress | null>(null);
  const memoAbortRef = useRef(false);
  const memoPausedRef = useRef(false);
  const memoAudioRef = useRef<HTMLAudioElement | null>(null);

  const memoAyahs = useMemo(() => passageAyahs(memoStart, memoEnd), [memoStart, memoEnd]);

  const runMemo = async () => {
    // وضع الحفظ يوقف أي تلاوة جارية — صوت واحد فقط في كل لحظة.
    stopAyahAudio();
    stopAudio();
    memoAbortRef.current = false;
    memoPausedRef.current = false;
    setMemoStatus('playing');
    const totalAyahs = memoAyahs.length;
    for (let pr = 0; pr < memoPassageRepeat; pr++) {
      if (memoAbortRef.current) break;
      for (let ai = 0; ai < totalAyahs; ai++) {
        if (memoAbortRef.current) break;
        const ayah = memoAyahs[ai];
        for (let ar = 0; ar < memoAyahRepeat; ar++) {
          if (memoAbortRef.current) break;
          // Wait if paused
          while (memoPausedRef.current && !memoAbortRef.current) {
            await new Promise(r => setTimeout(r, 200));
          }
          if (memoAbortRef.current) break;
          setMemoProgress({
            currentAyah: ayah,
            ayahIndex: ai,
            ayahRepeatCurrent: ar + 1,
            ayahRepeatTotal: memoAyahRepeat,
            passageRepeatCurrent: pr + 1,
            passageRepeatTotal: memoPassageRepeat,
            totalAyahs,
            isPlaying: true,
            isPaused: false,
            isComplete: false
          });
          // Play the ayah
          let url: string | null = ayahAudioUrls.get(ayah) ?? null;
          if (!url) {
            url = await fetchAyahAudioUrl(ayahReciterId, surahNumber, ayah);
            if (url) setAyahAudioUrls(prev => new Map(prev).set(ayah, url!));
          }
          if (!url) {
            // Skip this ayah if audio unavailable, but continue
            continue;
          }
          if (memoAbortRef.current) break;
          await new Promise<void>((resolve) => {
            const audio = new Audio(url!);
            memoAudioRef.current = audio;
            audio.addEventListener('ended', () => resolve());
            audio.addEventListener('error', () => resolve());
            audio.play().catch(() => resolve());
          });
        }
      }
    }
    if (!memoAbortRef.current) {
      setMemoStatus('complete');
      setMemoProgress(prev => prev ? {...prev, isPlaying: false, isComplete: true} : null);
    } else {
      setMemoStatus('idle');
      setMemoProgress(null);
    }
  };

  const pauseMemo = () => {
    memoPausedRef.current = true;
    if (memoAudioRef.current) memoAudioRef.current.pause();
    setMemoStatus('paused');
    setMemoProgress(prev => prev ? {...prev, isPlaying: false, isPaused: true} : null);
  };

  const resumeMemo = () => {
    memoPausedRef.current = false;
    if (memoAudioRef.current) memoAudioRef.current.play().catch(() => {});
    setMemoStatus('playing');
    setMemoProgress(prev => prev ? {...prev, isPlaying: true, isPaused: false} : null);
  };

  const stopMemo = () => {
    memoAbortRef.current = true;
    memoPausedRef.current = false;
    if (memoAudioRef.current) {
      memoAudioRef.current.pause();
      memoAudioRef.current = null;
    }
    setMemoStatus('idle');
    setMemoProgress(null);
  };

  const surah = surahInfo(asset, surahNumber);
  const verses = useMemo(() => surahVerses(asset, surahNumber), [asset, surahNumber]);
  const results = useMemo(() => searchVerses(asset, search), [asset, search]);
  const surahBookmarks = state.bookmarks.filter(bookmark => bookmark.surah === surahNumber);
  const surahNotes = state.notes.filter(note => note.surah === surahNumber);

  // Load per-ayah audio URLs when surah changes
  useEffect(() => {
    let active = true;
    setAyahAudioUrls(new Map());
    fetchSurahAyahAudioUrls(ayahReciterId, surahNumber, verses.map(v => v.a)).then(urls => {
      if (active) setAyahAudioUrls(urls);
    });
    return () => { active = false; };
  }, [surahNumber, ayahReciterId, verses]);

  const patch = (partial: Partial<QuranLearningState>) =>
    onState({...state, ...partial, updatedAt: new Date().toISOString()});

  const savePosition = (ayah: number) => {
    const verse = findVerse(asset, surahNumber, ayah);
    patch({readingPosition: {surah: surahNumber, ayah, juz: verse?.j, page: verse?.p, updatedAt: new Date().toISOString()}});
  };

  useEffect(() => {
    if (!surah) return;
    setRangeStart(1);
    setRangeEnd(surah.ayahs);
    setNoteAyah(null);
    setReflectAyah(null);
    savePosition(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahNumber]);

  if (!surah) return <EmptyNote>السورة غير موجودة.</EmptyNote>;

  const goTo = (surahTarget: number, ayahTarget: number) => {
    setSurahNumber(surahTarget);
    setFocusAyah(ayahTarget);
    const verse = findVerse(asset, surahTarget, ayahTarget);
    if (verse) {
      setJumpKind('juz');
      setJumpValue(verse.j);
    }
    window.setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-surah="${surahTarget}"][data-ayah="${ayahTarget}"]`);
      node?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }, 60);
  };

  const jump = () => {
    const target = navigationTarget(asset, jumpKind, jumpValue);
    if (target) goTo(target.s, target.a);
    else notify('لم يُعثر على الموضع المطلوب.');
  };

  const toggleBookmark = (ayah: number) => {
    const existing = state.bookmarks.find(item => item.surah === surahNumber && item.ayah === ayah);
    if (existing) {
      patch({bookmarks: state.bookmarks.filter(item => item.id !== existing.id)});
      notify('أُزيلت العلامة.');
      return;
    }
    patch({bookmarks: [{id: uid(), surah: surahNumber, ayah, label: 'علامة قراءة', createdAt: new Date().toISOString()}, ...state.bookmarks]});
    notify('حُفظت العلامة.');
  };

  const recordRange = (ayahStart: number, ayahEnd: number, label: string) => {
    const from = Math.min(ayahStart, ayahEnd);
    const to = Math.max(ayahStart, ayahEnd);
    patch({history: [{id: uid(), surah: surahNumber, ayahStart: from, ayahEnd: to, readAt: new Date().toISOString()}, ...state.history].slice(0, 500)});
    notify(label);
  };

  const rangeText = () => {
    const from = Math.min(rangeStart, rangeEnd);
    const to = Math.max(rangeStart, rangeEnd);
    return verses.filter(verse => verse.a >= from && verse.a <= to)
      .map(verse => `${verseBody(verse.t)} (${referenceLabel(asset, surahNumber, verse.a)})`)
      .join('\n');
  };

  const addNote = () => {
    if (!noteAyah || noteText.trim().length < 2) { notify('اكتب ملاحظة قبل الحفظ.'); return; }
    const stamp = new Date().toISOString();
    patch({notes: [{id: uid(), surah: surahNumber, ayahStart: noteAyah, ayahEnd: noteAyah, body: noteText.trim().slice(0, 4000), createdAt: stamp, updatedAt: stamp}, ...state.notes]});
    setNoteText('');
    setNoteAyah(null);
    notify('حُفظت الملاحظة الشخصية.');
  };

  const saveReflection = () => {
    if (!reflectAyah) return;
    if (!reflection.learned.trim() && !reflection.action.trim()) { notify('اكتب ما تعلمته أو العمل الذي ستطبقه.'); return; }
    const stamp = new Date().toISOString();
    patch({reflections: [{
      ...reflection, id: uid(), sourceType: 'quran', surah: surahNumber, ayahStart: reflectAyah, ayahEnd: reflectAyah,
      learned: reflection.learned.slice(0, 2000), meaning: reflection.meaning.slice(0, 2000),
      action: reflection.action.slice(0, 2000), trait: reflection.trait.slice(0, 500), intention: reflection.intention.slice(0, 500),
      createdAt: stamp, updatedAt: stamp
    }, ...state.reflections]});
    setReflection(emptyReflection());
    setReflectAyah(null);
    notify('حُفظ تأملك بشكل خاص.');
  };

  const filteredSurahs = asset.surahs.filter(item => !surahFilter.trim() || item.name.includes(surahFilter.trim()) || String(item.n) === surahFilter.trim());
  const basmala = basmalaText(asset);

  return <div className="quran-reader">
    <div className="quran-reader-toolbar panel">
      <div className="quran-toolbar-column quran-nav-column">
        <div className="quran-section-label">التنقل</div>
        <label className="quran-toolbar-group quran-surah-group">السورة
          <select value={surahNumber} onChange={event => setSurahNumber(Number(event.target.value))}>
            {asset.surahs.map(item => <option key={item.n} value={item.n}>{item.n}. {item.name}</option>)}
          </select>
        </label>
        <div className="quran-jump quran-toolbar-group">
          <label>الانتقال
            <select value={jumpKind} onChange={event => { setJumpKind(event.target.value as typeof jumpKind); setJumpValue(1); }}>
              <option value="juz">جزء</option>
              <option value="hizb">حزب</option>
              <option value="page">صفحة</option>
            </select>
          </label>
          <label>الرقم
            <select value={jumpValue} onChange={event => setJumpValue(Number(event.target.value))}>
              {Array.from({length: jumpKind === 'juz' ? 30 : jumpKind === 'hizb' ? 60 : 604}, (_, index) => index + 1)
                .map(value => <option key={value} value={value}>{toArabicNumber(value)}</option>)}
            </select>
          </label>
          <button className="soft-btn quran-jump-go" onClick={jump}>انتقال</button>
        </div>
        <div className="quran-section-label">القراءة</div>
        <div className="quran-reading-mode-group quran-toolbar-group" aria-label="وضع القراءة">
          <span className="quran-toolbar-title">وضع القراءة</span>
          <div className="quran-reading-mode">
            <button type="button" className={readingMode === 'continuous' ? 'selected' : ''} onClick={() => setReadingMode('continuous')}>متواصل</button>
            <button type="button" className={readingMode === 'verse' ? 'selected' : ''} onClick={() => setReadingMode('verse')}>آية بآية</button>
          </div>
        </div>
        <div className="quran-scroll-controls quran-toolbar-group">
          <span className="quran-toolbar-title">سرعة التمرير</span>
          <div className="quran-scroll-actions">
            <button type="button" className={autoScroll?'soft-btn selected':'soft-btn'} aria-pressed={autoScroll} onClick={() => setAutoScroll(value=>!value)}>
              {autoScroll ? <Pause size={16}/> : <Play size={16}/>} {autoScroll ? 'إيقاف' : 'تمرير تلقائي'}
            </button>
            <select value={autoScrollSpeed} onChange={event=>setAutoScrollSpeed(Number(event.target.value))} aria-label="سرعة التمرير التلقائي">
              {AUTO_SCROLL_SPEEDS.map(speed=><option key={speed.value} value={speed.value}>{speed.label}</option>)}
            </select>
            <input type="range" min={60} max={1600} step={30} value={autoScrollSpeed} onChange={event=>setAutoScrollSpeed(Number(event.target.value))} aria-label="ضبط دقيق لسرعة التمرير" className="quran-scroll-slider" />
          </div>
        </div>
      </div>
      <div className="quran-toolbar-column quran-options-column">
        <div className="quran-section-label">القراءة</div>
      <div className="quran-font-controls quran-toolbar-group" aria-label="حجم الخط">
        <span className="quran-toolbar-title">حجم الخط</span>
        <div className="quran-font-actions">
          <button type="button" className="quran-font-step" aria-label="تصغير الخط" title="تصغير الخط" onClick={() => patch({settings: {...state.settings, fontSize: Math.max(18, state.settings.fontSize - 2)}})}>A−</button>
          <span className="quran-font-size" aria-label="حجم الخط الحالي">{toArabicNumber(state.settings.fontSize)}</span>
          <button type="button" className="quran-font-step" aria-label="تكبير الخط" title="تكبير الخط" onClick={() => patch({settings: {...state.settings, fontSize: Math.min(64, state.settings.fontSize + 2)}})}>A+</button>
        </div>
      </div>
      <div className="quran-section-label">الصوت <InternetBadge compact/></div>
      <div className="quran-audio-controls">
        <label>القارئ
          <select value={reciterId ?? ''} onChange={event => {
            const id = Number(event.target.value);
            setReciterId(id);
            const r = reciters.find(x => x.id === id);
            if (r) { const m = defaultMoshaf(r); if (m) setMoshafId(m.id); }
            stopAudio();
          }} disabled={audioLoading}>
            {reciters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        {currentReciter && currentReciter.moshaf.length > 1 && (
          <label>الرواية
            <select value={moshafId ?? ''} onChange={event => { setMoshafId(Number(event.target.value)); stopAudio(); }} disabled={audioLoading}>
              {currentReciter.moshaf.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="soft-btn" onClick={togglePlay} disabled={audioLoading || !currentMoshaf || !currentMoshaf.surahList.includes(surahNumber)} aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}>
          {audioLoading ? <Loader2 size={16} className="spin"/> : isPlaying ? <Pause size={16}/> : <Play size={16}/>}
          {audioLoading ? 'جارٍ التحميل…' : isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
        </button>
        <button type="button" className="icon-btn" onClick={stopAudio} disabled={!audioRef.current} aria-label="إيقاف"><Square size={16}/></button>
        {audioError && <span className="muted small" role="alert">{audioError}</span>}
      </div>

      <div className="quran-section-label">الحفظ</div>
      {/* Memorization mode */}
      <div className="quran-memo-controls">
        <button type="button" className={`soft-btn ${memoMode ? 'active' : ''}`} onClick={() => { if (memoMode) stopMemo(); setMemoMode(v => !v); }} aria-pressed={memoMode}>
          <Repeat size={16}/> {memoMode ? 'إغلاق وضع الحفظ' : 'وضع الحفظ'}
        </button>
        {memoMode && <>
          <div className="quran-memo-range">
            <label>من آية
              <select value={memoStart} onChange={e => setMemoStart(Number(e.target.value))}>
                {verses.map(v => <option key={v.a} value={v.a}>{toArabicNumber(v.a)}</option>)}
              </select>
            </label>
            <label>إلى آية
              <select value={memoEnd} onChange={e => setMemoEnd(Number(e.target.value))}>
                {verses.map(v => <option key={v.a} value={v.a}>{toArabicNumber(v.a)}</option>)}
              </select>
            </label>
          </div>
          <div className="quran-memo-steppers">
            <label>تكرار كل آية
              <div className="stepper">
                <button type="button" onClick={() => setMemoAyahRepeat(v => clampRepeat(v - 1))}>−</button>
                <span>{toArabicNumber(memoAyahRepeat)}</span>
                <button type="button" onClick={() => setMemoAyahRepeat(v => clampRepeat(v + 1))}>+</button>
              </div>
            </label>
            <label>تكرار المقطع
              <div className="stepper">
                <button type="button" onClick={() => setMemoPassageRepeat(v => clampRepeat(v - 1))}>−</button>
                <span>{toArabicNumber(memoPassageRepeat)}</span>
                <button type="button" onClick={() => setMemoPassageRepeat(v => clampRepeat(v + 1))}>+</button>
              </div>
            </label>
          </div>
          <div className="quran-memo-actions">
            {memoStatus !== 'playing' && memoStatus !== 'paused' && (
              <button type="button" className="primary" onClick={() => void runMemo()}>
                <Play size={16}/> بدء التلاوة
              </button>
            )}
            {memoStatus === 'playing' && (
              <button type="button" className="soft-btn" onClick={pauseMemo}>
                <Pause size={16}/> إيقاف مؤقت
              </button>
            )}
            {memoStatus === 'paused' && (
              <button type="button" className="primary" onClick={resumeMemo}>
                <Play size={16}/> استئناف
              </button>
            )}
            {(memoStatus === 'playing' || memoStatus === 'paused') && (
              <button type="button" className="icon-btn" onClick={stopMemo} aria-label="إيقاف"><Square size={16}/></button>
            )}
            {memoStatus === 'complete' && (
              <button type="button" className="soft-btn" onClick={() => { setMemoStatus('idle'); setMemoProgress(null); }}>
                <RotateCcw size={16}/> إعادة
              </button>
            )}
          </div>
          {memoProgress && (
            <div className="quran-memo-progress">
              <div className="quran-memo-progress-bar">
                <div style={{width: `${Math.round((memoProgress.passageRepeatCurrent - 1 + (memoProgress.ayahIndex + (memoProgress.ayahRepeatCurrent - 1) / memoProgress.ayahRepeatTotal) / memoProgress.totalAyahs) / memoProgress.passageRepeatTotal * 100)}%`}}/>
              </div>
              <span className="muted small">{progressLabel(memoProgress)}</span>
            </div>
          )}
        </>}
      </div>
      </div>
    </div>

    {scrollMenu && <div className="quran-scroll-menu-backdrop" onClick={()=>setScrollMenu(null)}>
      <div className="quran-scroll-menu" role="menu" aria-label="خيارات التمرير التلقائي" style={{left:scrollMenu.x,top:scrollMenu.y}} onClick={event=>event.stopPropagation()}>
        <div className="quran-scroll-menu-title">تمرير تلقائي</div>
        {AUTO_SCROLL_SPEEDS.map(speed=><button key={speed.value} type="button" role="menuitem" className={autoScroll&&autoScrollSpeed===speed.value?'active':''} onClick={()=>{setAutoScrollSpeed(speed.value);setAutoScroll(true);setScrollMenu(null)}}>
          {autoScroll&&autoScrollSpeed===speed.value?<Pause size={15}/>:<Play size={15}/>} {speed.label}
        </button>)}
        {autoScroll && <button type="button" role="menuitem" className="quran-scroll-menu-stop" onClick={()=>{setAutoScroll(false);setScrollMenu(null)}}><Square size={15}/> إيقاف التمرير</button>}
      </div>
    </div>}

    <div className="quran-reader-grid">
      <aside className="panel quran-surah-list">
        <div className="quran-list-head"><h3>السور</h3><span>{toArabicNumber(114)} سورة</span></div>
        <label className="quran-surah-filter"><Search size={15}/><input value={surahFilter} onChange={event => setSurahFilter(event.target.value)} placeholder="ابحث باسم السورة أو رقمها"/></label>
        <div className="quran-surah-scroll">
          {filteredSurahs.map(item => <button key={item.n} className={item.n === surahNumber ? 'active' : ''} onClick={() => setSurahNumber(item.n)}>
            <span className="quran-surah-number">{toArabicNumber(item.n)}</span>
            <span><strong>{item.name}</strong><small>{item.type} · {toArabicNumber(item.ayahs)} آية</small></span>
            <ChevronLeft size={15}/>
          </button>)}
        </div>
      </aside>

      <section className="quran-mushaf panel" style={{fontSize: `${state.settings.fontSize}px`}} onContextMenu={event=>{
        event.preventDefault();
        setScrollMenu({
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 254)),
        });
      }}>
        <header className="quran-surah-header">
          <div>
            <span className="eyebrow">المصحف الشريف · {asset.narration}</span>
            <h2>سورة {surah.name}</h2>
            <p className="muted small">{surah.type} · {toArabicNumber(surah.ayahs)} آية · ترتيب النزول {toArabicNumber(surah.order)}</p>
          </div>
          <div className="quran-header-actions">
            <button className="soft-btn" onClick={() => setSearchOpen(value => !value)}><Search size={16}/> بحث</button>
            <button className="soft-btn" onClick={() => recordRange(1, surah.ayahs, 'سُجّلت قراءة السورة في سجل القراءة.')}><ListChecks size={16}/> سجّل قراءتي</button>
          </div>
        </header>

        {searchOpen && <div className="quran-search panel">
          <label><Search size={16}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالكلمة أو جزء منها (بحث إملائي منفصل عن نص المصحف)"/></label>
          {search.trim().length >= 2 && <p className="muted small">نتائج البحث: {toArabicNumber(results.length)}{results.length >= 60 ? ' (أول ٦٠ نتيجة)' : ''}</p>}
          <ul>{results.map(result => <li key={`${result.verse.s}:${result.verse.a}`}>
            <button onClick={() => { setSearchOpen(false); goTo(result.verse.s, result.verse.a); }}>
              <strong>{result.surahName} · آية {toArabicNumber(result.verse.a)}</strong>
              <span>{result.body.length > 150 ? `${result.body.slice(0, 150)}…` : result.body}</span>
            </button>
          </li>)}</ul>
          {search.trim().length >= 2 && results.length === 0 && <EmptyNote>لا توجد نتائج مطابقة.</EmptyNote>}
        </div>}

        {showsBasmala(surahNumber) && basmala && <p className="quran-basmala">{basmala}</p>}
        <p className="quran-source-note">النص العثماني من {asset.source} · رواية {asset.narration}. العرض آية بآية، وليس صورة صفحة مطابقة للمصحف المطبوع.</p>

        {readingMode === 'verse' ? <div className="quran-verses">
          {verses.map(verse => {
            const bookmarked = surahBookmarks.some(item => item.ayah === verse.a);
            return <div key={verse.a} id={`ayah-${verse.a}`} className={`quran-verse ${focusAyah === verse.a ? 'focused' : ''}`} data-surah={verse.s} data-ayah={verse.a}>
              <div className="quran-verse-body">
                <QuranVerseText surah={verse.s} ayah={verse.a} text={verse.t}/>
              </div>
              <div className="quran-verse-actions">
                <ReferenceBadge>{referenceLabel(asset, surahNumber, verse.a)}</ReferenceBadge>
                <button className={`icon-btn ${playingAyah === verse.a ? "active" : ""}`} aria-label={playingAyah === verse.a ? "إيقاف" : "تشغيل الآية"} onClick={() => playingAyah === verse.a ? stopAyahAudio() : playAyah(verse.a)}>{playingAyah === verse.a ? <Pause size={15}/> : <Play size={15}/>}</button>
                <button className="icon-btn" aria-label={bookmarked ? 'إزالة العلامة' : 'حفظ علامة'} onClick={() => toggleBookmark(verse.a)}>{bookmarked ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}</button>
                <button className="icon-btn" aria-label="نسخ الآية" onClick={async () => { await copyText(`${verseBody(verse.t)} (${referenceLabel(asset, surahNumber, verse.a)})`); notify('نُسخت الآية مع مرجعها.'); }}><Copy size={15}/></button>
                <button className="icon-btn" aria-label="مشاركة الآية" onClick={async () => { const result = await shareText(`${verseBody(verse.t)} (${referenceLabel(asset, surahNumber, verse.a)})`); notify(result === 'shared' ? 'فُتحت المشاركة.' : 'نُسخت الآية للمشاركة.'); }}><Share2 size={15}/></button>
                <button className={noteAyah === verse.a ? 'icon-btn active' : 'icon-btn'} aria-label="ملاحظة شخصية" onClick={() => setNoteAyah(noteAyah === verse.a ? null : verse.a)}><StickyNote size={15}/></button>
                <button className={reflectAyah === verse.a ? 'icon-btn active' : 'icon-btn'} aria-label="تأمل وتطبيق" onClick={() => { setReflectAyah(reflectAyah === verse.a ? null : verse.a); setReflection(emptyReflection()); }}>تأمل</button>
              </div>
              <div className="quran-content-tabs">
                <button type="button" className={contentAyah === verse.a && contentTab === 'tafsir' ? 'active' : ''} onClick={() => { if (contentAyah === verse.a && contentTab === 'tafsir') setContentAyah(null); else { setContentAyah(verse.a); setContentTab('tafsir'); } }}>تفسير</button>
                <button type="button" className={contentAyah === verse.a && contentTab === 'translation' ? 'active' : ''} onClick={() => { if (contentAyah === verse.a && contentTab === 'translation') setContentAyah(null); else { setContentAyah(verse.a); setContentTab('translation'); } }}>ترجمة</button>
                <button type="button" className={contentAyah === verse.a && contentTab === 'asbab' ? 'active' : ''} onClick={() => { if (contentAyah === verse.a && contentTab === 'asbab') setContentAyah(null); else { setContentAyah(verse.a); setContentTab('asbab'); } }}>سبب النزول</button>
              </div>
              {contentAyah === verse.a && (
                <div className="quran-content-panel">
                  {contentTab === 'translation' && (
                    <label className="quran-content-select">الترجمة
                      <select value={translationId} onChange={e => setTranslationId(Number(e.target.value))}>
                        {TRANSLATIONS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                  )}
                  {contentTab === 'tafsir' && (
                    <label className="quran-content-select">التفسير
                      <select value={tafsirId} onChange={e => setTafsirId(Number(e.target.value))}>
                        {TAFSIRS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                  )}
                  {!online && <p className="quran-online-note"><InternetBadge compact/> التفسير والترجمة يُجلبان عبر الإنترنت؛ ما فتحته سابقًا محفوظ على الجهاز.</p>}
                  {contentState.status === 'loading' && <p className="muted small">جارٍ التحميل…</p>}
                  {contentState.status === 'error' && <p className="muted small" role="alert">{online ? contentState.error : 'لا يوجد اتصال، ولم يُحفظ هذا المحتوى على الجهاز بعد.'}</p>}
                  {contentState.status === 'empty' && <p className="muted small">{online ? 'لا توجد بيانات متاحة.' : 'غير متاح دون اتصال.'}</p>}
                  {contentState.status === 'success' && <p className="quran-content-text">{contentState.data}</p>}
                </div>
              )}
              {noteAyah === verse.a && <div className="quran-inline-form">
                <textarea value={noteText} onChange={event => setNoteText(event.target.value)} maxLength={4000} placeholder="ملاحظة شخصية خاصة بك على هذه الآية…"/>
                <div><button className="primary" onClick={addNote}><Save size={15}/> حفظ الملاحظة</button><button className="soft-btn" onClick={() => { setNoteAyah(null); setNoteText(''); }}>إلغاء</button></div>
              </div>}
              {reflectAyah === verse.a && <div className="quran-inline-form quran-reflection-form">
                <p className="small muted">تأمل شخصي خاص، وليس تفسيرًا معتمدًا. لا يُعرض على أحد.</p>
                <label>ماذا تعلمت؟<textarea value={reflection.learned} onChange={event => setReflection({...reflection, learned: event.target.value})} maxLength={2000}/></label>
                <label>ما المعنى الذي أتأمله؟<textarea value={reflection.meaning} onChange={event => setReflection({...reflection, meaning: event.target.value})} maxLength={2000}/></label>
                <label>ما العمل الذي سأطبقه؟<textarea value={reflection.action} onChange={event => setReflection({...reflection, action: event.target.value})} maxLength={2000}/></label>
                <div className="quran-form-row">
                  <label>الخلق الذي أُحسّنه<input value={reflection.trait} onChange={event => setReflection({...reflection, trait: event.target.value})} maxLength={500}/></label>
                  <label>النية التي أُجددها<input value={reflection.intention} onChange={event => setReflection({...reflection, intention: event.target.value})} maxLength={500}/></label>
                </div>
                <div><button className="primary" onClick={saveReflection}><Save size={15}/> حفظ التأمل</button><button className="soft-btn" onClick={() => setReflectAyah(null)}>إلغاء</button></div>
              </div>}
            </div>;
          })}
        </div> : <p className="quran-continuous-flow">
          {verses.map(verse => (
            <span key={verse.a} className={`quran-flow-ayah ${playingAyah === verse.a ? 'is-playing' : ''} ${focusAyah === verse.a ? 'focused' : ''}`} id={`ayah-${verse.a}`} data-ayah={verse.a} onClick={() => setFocusAyah(verse.a)}>
              {verseBody(verse.t)} <span className="quran-flow-marker">{verseMarker(verse.t) || `۝${toArabicNumber(verse.a)}`}</span>{' '}
            </span>
          ))}
        </p>}

        <div className="quran-verse-footer">
          <button className="soft-btn" disabled={surahNumber === 1} onClick={() => goTo(surahNumber - 1, 1)}><ChevronRight size={16}/> السورة السابقة</button>
          <button className="soft-btn" disabled={surahNumber === 114} onClick={() => goTo(surahNumber + 1, 1)}>السورة التالية <ChevronLeft size={16}/></button>
        </div>
      </section>

      <aside className="quran-side">
        <div className="panel">
          <h3><ListChecks size={18}/> مقطع للقراءة والحفظ</h3>
          <div className="quran-form-row">
            <label>من الآية<input type="number" min={1} max={surah.ayahs} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))}/></label>
            <label>إلى الآية<input type="number" min={1} max={surah.ayahs} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))}/></label>
          </div>
          <p className="muted small">{referenceLabel(asset, surahNumber, Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd))} · {toArabicNumber(Math.min(surah.ayahs, Math.abs(rangeEnd - rangeStart) + 1))} آية</p>
          <div className="quran-side-actions">
            <button className="soft-btn" onClick={() => recordRange(rangeStart, rangeEnd, 'سُجّل المقطع في سجل القراءة.')}>حفظ في السجل</button>
            <button className="soft-btn" onClick={async () => { await copyText(rangeText()); notify('نُسخ المقطع مع المراجع.'); }}><Copy size={15}/> نسخ</button>
            <button className="soft-btn" onClick={async () => { const result = await shareText(rangeText()); notify(result === 'shared' ? 'فُتحت المشاركة.' : 'نُسخ المقطع للمشاركة.'); }}><Share2 size={15}/> مشاركة</button>
          </div>
        </div>

        <div className="panel">
          <h3><Bookmark size={18}/> علامات هذه السورة</h3>
          {surahBookmarks.length === 0 ? <EmptyNote>لا توجد علامات محفوظة في هذه السورة.</EmptyNote> : <ul className="quran-mini-list">
            {surahBookmarks.map(bookmark => <li key={bookmark.id}>
              <button onClick={() => goTo(bookmark.surah, bookmark.ayah)}>{bookmark.label} · آية {toArabicNumber(bookmark.ayah)}</button>
              <button className="icon-btn" aria-label="حذف العلامة" onClick={() => patch({bookmarks: state.bookmarks.filter(item => item.id !== bookmark.id)})}><Trash2 size={14}/></button>
            </li>)}
          </ul>}
        </div>

        <div className="panel">
          <h3><StickyNote size={18}/> ملاحظاتي على هذه السورة</h3>
          {surahNotes.length === 0 ? <EmptyNote>لا ملاحظات بعد. اضغط أيقونة الملاحظة عند أي آية.</EmptyNote> : <ul className="quran-notes-list">
            {surahNotes.map(note => <li key={note.id}>
              <div><strong>آية {toArabicNumber(note.ayahStart)}{note.ayahEnd !== note.ayahStart ? `–${toArabicNumber(note.ayahEnd)}` : ''}</strong><p>{note.body}</p><small>{dateKey(new Date(note.updatedAt))}</small></div>
              <button className="icon-btn" aria-label="حذف الملاحظة" onClick={() => patch({notes: state.notes.filter(item => item.id !== note.id)})}><Trash2 size={14}/></button>
            </li>)}
          </ul>}
        </div>

        <div className="panel quran-state-note">
          <p><strong>الموضع الأخير:</strong> {surah.name} · آية {toArabicNumber(focusAyah)}</p>
          <p className="muted small">حفظ الموضع والقراءة لا يعني حفظ الآيات ولا إتقانها.</p>
          <button className="soft-btn" onClick={() => setNoteAyah(focusAyah)}><Plus size={15}/> ملاحظة على الآية الحالية</button>
        </div>
      </aside>
    </div>
  </div>;
}

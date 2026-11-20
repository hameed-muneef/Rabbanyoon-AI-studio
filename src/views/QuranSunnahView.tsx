import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {
  BookOpen, Brain, RotateCcw, Library, ScrollText, CalendarClock, TrendingUp,
  Flower2, BookType, Languages
} from 'lucide-react';
import '../quran.css';
import type {QuranAsset, QuranLearningState} from '../quran/types';
import type {Task} from '../app-state';
import {loadQuran} from '../quran/content';
import MushafPages from './quran/MushafPages';
import OfflineLibrary from './quran/OfflineLibrary';
import QuranMemorization from './quran/QuranMemorization';
import QuranRevision from './quran/QuranRevision';
import HadithLibrary from './quran/HadithLibrary';
import QuranRoutine from './quran/QuranRoutine';
import QuranProgress from './quran/QuranProgress';
import QuranJourney from './quran/QuranJourney';
import AzkarLibrary from './AzkarLibrary';
import {EmptyNote} from './quran/ui';

export type QuranSection = 'mushaf' | 'tafsir' | 'translations' | 'hifz' | 'revision' | 'bukhari' | 'muslim' | 'sunnah' | 'routine' | 'progress' | 'azkar';

type Props = {
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  tasks: Task[];
  onTasks: (tasks: Task[]) => void;
  notify: (text: string) => void;
  onOpenTasks: () => void;
  initialSection?: QuranSection;
};

const SECTIONS: {id: QuranSection; title: string; description: string; icon: typeof BookOpen}[] = [
  {id: 'mushaf', title: 'المصحف الشريف', description: 'تمرير رأسي متصل على صفحات المصحف (٦٠٤)، مع انتقال بالسورة والجزء والحزب والصفحة والآية، وتفسير وترجمة وعلامات وملاحظات.', icon: BookOpen},
  {id: 'tafsir', title: 'مكتبة التفسير', description: 'نزّل التفاسير على جهازك مرة واحدة، ثم اقرأها كاملة دون إنترنت.', icon: BookType},
  {id: 'translations', title: 'مكتبة الترجمات', description: 'ترجمات معتمدة قابلة للتنزيل والقراءة دون اتصال، مع حفظ المصدر.', icon: Languages},
  {id: 'hifz', title: 'حفظ القرآن', description: 'خطط مرنة وتمارين إخفاء وإكمال وترتيب واسترجاع.', icon: Brain},
  {id: 'revision', title: 'مراجعة القرآن', description: 'مراجعة متباعدة تحفظ ما حفظته وتعيد المتعثر.', icon: RotateCcw},
  {id: 'bukhari', title: 'صحيح البخاري', description: '', icon: Library},
  {id: 'muslim', title: 'صحيح مسلم', description: '', icon: Library},
  {id: 'sunnah', title: 'حفظ السنة', description: '', icon: ScrollText},
  {id: 'routine', title: 'وردي اليومي', description: 'جدولة القرآن والسنة داخل مهام اليوم نفسها.', icon: CalendarClock},
  {id: 'progress', title: 'سجل الإنجاز', description: 'قراءة وحفظ وإتقان وانتظام وتأملات خاصة.', icon: TrendingUp},
  {id: 'azkar', title: 'أذكار', description: 'حصن Muslim — أذكار الصباح والمساء وسائر الأوقات، مع عداد تكرار وصوت.', icon: Flower2}
];

export default function QuranSunnahView({state, onState, tasks, onTasks, notify, onOpenTasks, initialSection}: Props) {
  const [section, setSection] = useState<QuranSection>(initialSection ?? 'mushaf');
  const sectionHeaderRef = useRef<HTMLDivElement>(null);
  const [asset, setAsset] = useState<QuranAsset | null>(null);
  const [error, setError] = useState('');
  const firstRender = useRef(true);
  const [navToken, setNavToken] = useState(0);

  const handleSectionChange = (id: QuranSection) => {
    setSection(id);
    setNavToken(value => value + 1);
  };

  useLayoutEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const frame = requestAnimationFrame(() => {
      if (sectionHeaderRef.current) {
        const top = sectionHeaderRef.current.offsetTop - 80;
        document.documentElement.scrollTo({top, behavior: 'auto'});
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [navToken]);

  useEffect(() => {
    if (initialSection) {
      setSection(initialSection);
      setNavToken(value => value + 1);
    }
  }, [initialSection]);

  useEffect(() => {
    let active = true;
    loadQuran().then(value => { if (active) setAsset(value); }).catch(() => { if (active) setError('تعذر تحميل أصل المصحف المعتمد. تحقق من الاتصال ثم أعد المحاولة؛ لا يُعرض نص بديل.'); });
    return () => { active = false; };
  }, []);

  const current = SECTIONS.find(item => item.id === section) ?? SECTIONS[0];

  return <div className="quran-page">
    <div className="page-intro quran-intro">
      <span className="eyebrow">القرآن والسنة</span>
      <h1>القرآن والسنة</h1>
    </div>

    <nav className="quran-section-grid" aria-label="أقسام القرآن والسنة">
      {SECTIONS.map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => handleSectionChange(item.id)}>
          <span className="quran-section-icon"><Icon size={22}/></span>
          <strong>{item.title}</strong>
          <small>{item.description}</small>
        </button>;
      })}
    </nav>

    <div className="quran-section-header" ref={sectionHeaderRef}>
      <h2>{current.title}</h2>
      {current.description && <p>{current.description}</p>}
    </div>

    {error ? <section className="panel quran-error" role="alert"><h3>تعذر فتح المصحف</h3><p>{error}</p><button className="soft-btn" onClick={() => { setError(''); loadQuran().then(setAsset).catch(() => setError('تعذر تحميل أصل المصحف المعتمد مرة أخرى.')); }}>إعادة المحاولة</button></section>
      : !asset ? <section className="panel"><EmptyNote>جارٍ تحميل النص العثماني والبيانات الوصفية…</EmptyNote></section>
      : <>
        {section === 'mushaf' && <MushafPages asset={asset} state={state} onState={onState} notify={notify}/>}
        {section === 'tafsir' && <OfflineLibrary kind="tafsir" asset={asset} notify={notify}/>}
        {section === 'translations' && <OfflineLibrary kind="translation" asset={asset} notify={notify}/>}
        {section === 'hifz' && <><QuranJourney asset={asset} state={state} onOpen={handleSectionChange}/><QuranMemorization asset={asset} state={state} onState={onState} notify={notify}/></>}
        {section === 'revision' && <QuranRevision asset={asset} state={state} onState={onState} notify={notify}/>}
        {section === 'bukhari' && <HadithLibrary collectionKey="bukhari" mode="library" state={state} onState={onState} notify={notify}/>}
        {section === 'muslim' && <HadithLibrary collectionKey="muslim" mode="library" state={state} onState={onState} notify={notify}/>}
        {section === 'sunnah' && <HadithLibrary collectionKey="bukhari" mode="memorization" state={state} onState={onState} notify={notify}/>}
        {section === 'routine' && <QuranRoutine asset={asset} state={state} onState={onState} tasks={tasks} onTasks={onTasks} notify={notify} onOpenTasks={onOpenTasks}/>}
        {section === 'progress' && <QuranProgress asset={asset} state={state} onState={onState} notify={notify}/>}
        {section === 'azkar' && <AzkarLibrary/>}
      </>}

  </div>;
}

import {useEffect, useRef, useState} from 'react';
import {Bookmark, BookmarkCheck, ExternalLink, Search, ShieldAlert} from 'lucide-react';
import type {QuranLearningState} from '../../quran/types';
import {utcStamp} from '../../quran/learning';
import {uid} from '../../id';
import {EmptyNote} from './ui';
import type {HadithAsset, HadithNarration} from '../../hadith/types';
import {loadHadith} from '../../hadith/content';

type Props = {
  collectionKey: 'bukhari' | 'muslim';
  mode: 'library' | 'memorization';
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
};

const normalizeArabic = (value: string) => value
  .normalize('NFD')
  .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
  .replace(/\u0640/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .trim();

const parseLocalizedNumber = (value: string) => Number(value
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0)));

const RESULTS_PAGE_SIZE = 20;

export default function HadithLibrary({collectionKey, mode, state, onState, notify}: Props) {
  const [asset, setAsset] = useState<HadithAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [number, setNumber] = useState('');
  const [book, setBook] = useState('');
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const bookGridRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [narrations, setNarrations] = useState<HadithNarration[]>([]);
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);
  const [matchingCount, setMatchingCount] = useState(0);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setAsset(null);
    setNarrations([]);
    setMatchingCount(0);
    setSearched(false);
    setQuery('');
    setNumber('');
    setBook('');
    setSelectedBook(null);
    loadHadith(collectionKey)
      .then(data => {
        if (!active) return;
        setAsset(data);
        setNarrations(data.hadiths);
        setMatchingCount(data.hadiths.length);
        setVisibleCount(RESULTS_PAGE_SIZE);
        setSearched(false);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الأحاديث.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [collectionKey]);

  const patch = (partial: Partial<QuranLearningState>) =>
    onState({...state, ...partial, updatedAt: utcStamp()});

  const toggleBookmark = (item: HadithNarration) => {
    const existing = state.hadithBookmarks.find(b => b.collectionKey === collectionKey && b.hadithNumber === item.number_in_collection);
    if (existing) {
      patch({hadithBookmarks: state.hadithBookmarks.filter(b => b.id !== existing.id)});
      notify('أُزيلت علامة الحديث.');
    } else {
      patch({hadithBookmarks: [{id: uid(), collectionKey, hadithNumber: item.number_in_collection, label: '', createdAt: utcStamp()}, ...state.hadithBookmarks]});
      notify('حُفظت علامة الحديث.');
    }
  };

  const addReflection = (item: HadithNarration) => {
    const text = window.prompt('تأمل شخصي خاص (ما العمل الذي ستطبقه؟)')?.trim();
    if (!text) return;
    const stamp = utcStamp();
    patch({reflections: [{
      id: uid(), sourceType: 'hadith', collectionKey, hadithNumber: item.number_in_collection,
      learned: '', meaning: '', action: text.slice(0, 2000), trait: '', intention: '', isPrivate: true,
      createdAt: stamp, updatedAt: stamp
    }, ...state.reflections]});
    notify('حُفظ التأمل بشكل خاص.');
  };

  const runSearch = (bookOverride?: number | null) => {
    if (!asset) return;
    let list = asset.hadiths;
    const bookFilter = bookOverride !== undefined
      ? bookOverride
      : (book.trim() ? parseLocalizedNumber(book) : null);
    if (bookFilter != null) list = list.filter(h => h.book === bookFilter);
    if (number.trim()) {
      const requestedNumber = parseLocalizedNumber(number);
      list = Number.isFinite(requestedNumber)
        ? list.filter(h => h.number_in_collection === requestedNumber || h.arabicnumber === requestedNumber)
        : [];
    }
    if (query.trim()) {
      const q = normalizeArabic(query);
      list = list.filter(h => normalizeArabic(h.text_arabic).includes(q));
    }
    setNarrations(list);
    setMatchingCount(list.length);
    setVisibleCount(RESULTS_PAGE_SIZE);
    setSearched(true);
  };

  const clearSearch = () => {
    setQuery('');
    setNumber('');
    setBook('');
    setSelectedBook(null);
    setNarrations(asset?.hadiths ?? []);
    setMatchingCount(asset?.hadiths.length ?? 0);
    setVisibleCount(RESULTS_PAGE_SIZE);
    setSearched(false);
  };
  const bookCounts = asset?.hadiths.reduce<Record<number, number>>((counts, hadith) => {
    if (hadith.book != null) counts[hadith.book] = (counts[hadith.book] ?? 0) + 1;
    return counts;
  }, {}) ?? {};

  if (loading) return <section className="panel"><EmptyNote>جارٍ تحميل الأحاديث…</EmptyNote></section>;
  if (error) return <section className="panel quran-error" role="alert"><h3>تعذر التحميل</h3><p>{error}</p></section>;

  return <div className="quran-hadith">
    <div className="quran-section-head">
      <div>
        <span className="eyebrow">{mode === 'library' ? 'مكتبة الحديث' : 'حفظ السنة'}</span>
        <p>{mode === 'library' ? 'ابحث في المتون أو الأرقام، وتصفح أبواب الكتاب.' : 'اختر حديثًا للقراءة والحفظ والمراجعة.'}</p>
        <div className="quran-hadith-summary" aria-label="ملخص المجموعة">
          <span><strong>{asset?.counts.hadiths.toLocaleString('ar')}</strong> متن متاح</span>
          <span><strong>{asset?.counts.books.toLocaleString('ar')}</strong> كتابًا</span>
        </div>
      </div>
    </div>

    {mode === 'library' && <>
      <section className="panel quran-hadith-books">
        <div className="quran-hadith-books-head">
          <div><h3>أبواب الكتاب</h3><span>{Object.keys(asset?.sections || {}).filter(k => Number(k) > 0).length} كتابًا</span></div>
          {selectedBook != null && <button className="soft-btn" onClick={clearSearch}>مسح التصفية</button>}
        </div>
        <div className="quran-hadith-book-grid" ref={bookGridRef}>
          {Object.entries(asset?.sections || {}).filter(([k]) => Number(k) > 0).map(([k, title]) => {
            const num = Number(k);
            const count = bookCounts[num] ?? 0;
            const arTitle = asset?.bookTitlesAr?.[k];
            return <button
              key={k}
              type="button"
              className={selectedBook === num ? 'active' : ''}
              aria-pressed={selectedBook === num}
              onClick={(e) => { e.currentTarget.blur(); setSelectedBook(num); setBook(String(num)); runSearch(num); setTimeout(() => resultsRef.current?.scrollIntoView({block:'start',behavior:'smooth'}), 100); }}
            >
              <strong>{num}</strong>
              <span>{arTitle || title}</span>
              {arTitle && arTitle !== title && <small className="muted">{title}</small>}
              <small>{count.toLocaleString('ar')} حديث</small>
            </button>;
          })}
        </div>
      </section>

      <section className="panel quran-hadith-results" ref={resultsRef}>
        <form className="quran-hadith-search" onSubmit={event => { event.preventDefault(); runSearch(); }}>
          <label><Search size={15}/> بحث في المتن<input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث دون الحاجة إلى التشكيل"/></label>
          <label>رقم الكتاب<input value={book} onChange={event => { setBook(event.target.value); setSelectedBook(null); }} inputMode="numeric"/></label>
          <label>رقم الحديث<input value={number} onChange={event => setNumber(event.target.value)} inputMode="decimal"/></label>
          <div className="quran-hadith-search-actions">
            <button className="primary" type="submit">بحث</button>
            <button className="soft-btn" type="button" onClick={clearSearch}>مسح البحث</button>
          </div>
        </form>
        <div className="quran-hadith-results-head" aria-live="polite">
          <h3>{searched ? 'نتائج البحث' : 'أحاديث الكتاب'}</h3>
          <span>{matchingCount.toLocaleString('ar')} حديث</span>
        </div>
        {narrations.length === 0 && searched ? <EmptyNote>لا توجد نتائج مطابقة. جرّب رقمًا أو كلمة أخرى.</EmptyNote> : narrations.length === 0 ? <EmptyNote>لا توجد أحاديث مطابقة في هذا القسم.</EmptyNote> : <ul className="quran-hadith-list">
          {narrations.slice(0, visibleCount).map(item => {
            const bookmarked = state.hadithBookmarks.some(b => b.collectionKey === collectionKey && b.hadithNumber === item.number_in_collection);
            return <li key={item.id}>
              <header>
                <span className="quran-hadith-number">حديث {item.number_in_collection}</span>
                {item.book != null && <span className="quran-hadith-book-name">{asset?.bookTitlesAr?.[String(item.book)] || `كتاب ${item.book}`}</span>}
                {item.arabicnumber !== item.number_in_collection && <span className="quran-hadith-reference">المرجع {item.arabicnumber}</span>}
              </header>
              <p className="quran-hadith-text" dir="rtl" lang="ar">{item.text_arabic}</p>
              {item.grading_text && <p className="small muted">الحكم: {item.grading_text} {item.grading_source && `— ${item.grading_source}`}</p>}
              <div className="quran-hadith-actions">
                <button className="soft-btn" type="button" onClick={() => toggleBookmark(item)}>{bookmarked ? <BookmarkCheck size={15}/> : <Bookmark size={15}/>} {bookmarked ? 'إزالة العلامة' : 'حفظ علامة'}</button>
                <button className="soft-btn" type="button" onClick={() => addReflection(item)}>تأمل خاص</button>
                <a className="soft-btn" href={item.reference_url} target="_blank" rel="noreferrer">المصدر <ExternalLink size={14}/></a>
              </div>
            </li>;
          })}
        </ul>}
        {narrations.length > visibleCount && <button className="soft-btn quran-hadith-more" type="button" onClick={() => setVisibleCount(count => count + RESULTS_PAGE_SIZE)}>
          عرض المزيد ({(narrations.length - visibleCount).toLocaleString('ar')} متبقٍ)
        </button>}
      </section>
    </>}

    {mode === 'memorization' && <section className="panel quran-blocked" role="status">
      <ShieldAlert size={24}/>
      <div>
        <strong>حفظ السنة متاح لهذه النسخة التجريبية.</strong>
        <p>يمكن إضافة أحاديث إلى خطة حفظ واختبار الإخفاء والإكمال والمراجعة. النص عربي فقط (لا ترجمة).</p>
      </div>
    </section>}
  </div>;
}

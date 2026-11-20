import {useMemo} from 'react';
import {BookOpen, Brain, Clock3, Sparkles, Trash2, TrendingUp} from 'lucide-react';
import type {QuranAsset, QuranLearningState} from '../../quran/types';
import {
  consistency, masteredJuzCount, memorizationStats, planProgress, readingStats, dateKey, ROUTINE_KINDS
} from '../../quran/learning';
import {referenceLabel, toArabicNumber} from '../../quran/content';
import {EmptyNote, ProgressBar} from './ui';

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
};

export default function QuranProgress({asset, state, onState, notify}: Props) {
  const surahCounts = useMemo(() => new Map(asset.surahs.map(surah => [surah.n, surah.ayahs])), [asset]);
  const reading = readingStats(state.history);
  const memorization = memorizationStats(state.passages, state.revisionEvents, surahCounts);
  const juz = masteredJuzCount(asset, state.passages);
  const streak = consistency(state.activityLog);
  const plans = state.plans.filter(plan => plan.contentType === 'quran');
  const recentLog = [...state.activityLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const recentEvents = [...state.revisionEvents].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).slice(0, 12);

  const patch = (partial: Partial<QuranLearningState>) =>
    onState({...state, ...partial, updatedAt: new Date().toISOString()});

  return <div className="quran-progress-view">
    <div className="quran-section-head">
      <div><span className="eyebrow">سجل الإنجاز</span><h2>تقدمك في القرآن والسنة</h2><p>القراءة والحفظ مساران منفصلان: إتمام القراءة لا يُحتسب حفظًا، والحفظ لا يصبح إتقانًا إلا بمراجعة ناجحة متتابعة.</p></div>
    </div>

    <div className="quran-stat-grid">
      <div className="panel"><BookOpen size={20}/><span>جلسات القراءة</span><strong>{toArabicNumber(reading.sessions)}</strong><small>{toArabicNumber(reading.surahs)} سورة · {toArabicNumber(reading.verses)} آية مقروءة</small></div>
      <div className="panel"><Brain size={20}/><span>آيات قيد الحفظ</span><strong>{toArabicNumber(memorization.memorizedVerses)}</strong><small>{toArabicNumber(memorization.masteredVerses)} راسخة</small></div>
      <div className="panel"><TrendingUp size={20}/><span>الأجزاء المكتملة إتقانًا</span><strong>{toArabicNumber(juz)}</strong><small>من {toArabicNumber(30)} جزءًا</small></div>
      <div className="panel"><Clock3 size={20}/><span>الانتظام</span><strong>{toArabicNumber(streak.last7)}/{toArabicNumber(7)}</strong><small>آخر ٣٠ يومًا: {toArabicNumber(streak.last30)} يومًا</small></div>
    </div>

    <section className="panel quran-separation">
      <div><h3>الفرق بين القراءة والإتقان</h3><p>عدد الآيات المقروءة يُحسب من سجل القراءة الذي تسجّله بنفسك. أما «الراسخ» فلا يُمنح إلا بعد نجاح المراجعة عبر الفواصل ١ ثم ٣ ثم ٧ ثم ١٤ ثم ٣٠ يومًا. فتح السورة أو إنجاز مهمة قراءة لا يجعل أي آية محفوظة.</p></div>
      <div className="quran-separation-columns">
        <div><strong>قراءة</strong><span>{toArabicNumber(reading.verses)} آية</span><small>سجل قراءة شخصي</small></div>
        <div><strong>حفظ</strong><span>{toArabicNumber(memorization.memorizedVerses)} آية</span><small>مقاطع بدأت حفظها</small></div>
        <div><strong>إتقان</strong><span>{toArabicNumber(memorization.masteredVerses)} آية</span><small>مراجعة ناجحة متتابعة</small></div>
      </div>
    </section>

    <div className="quran-two-col">
      <section className="panel">
        <h3>خطط الحفظ</h3>
        {plans.length === 0 ? <EmptyNote>لا خطط حفظ بعد.</EmptyNote> : <ul className="quran-plan-progress">
          {plans.map(plan => {
            const progress = planProgress(plan, state.passages);
            return <li key={plan.id}>
              <div><strong>{plan.title}</strong><small>{plan.status === 'active' ? 'نشطة' : plan.status === 'paused' ? 'موقوفة' : 'مكتملة'} · {toArabicNumber(progress.mastered)}/{toArabicNumber(progress.total)} مقطعًا راسخًا</small></div>
              <ProgressBar value={progress.ratio} label={`إتقان ${plan.title}`}/>
            </li>;
          })}
        </ul>}
      </section>

      <section className="panel">
        <h3>سجل المراجعة</h3>
        {recentEvents.length === 0 ? <EmptyNote>لا مراجعات مسجلة بعد.</EmptyNote> : <ul className="quran-mini-list">
          {recentEvents.map(event => {
            const passage = state.passages.find(item => item.id === event.passageId);
            return <li key={event.id}>
              <span>{passage?.surah != null && passage.ayahStart != null ? referenceLabel(asset, passage.surah, passage.ayahStart, passage.ayahEnd) : 'مقطع'}</span>
              <small className={event.outcome}>{event.outcome === 'passed' ? 'ناجحة' : 'متعثرة'} · {dateKey(new Date(event.reviewedAt))} · التالي بعد {toArabicNumber(event.intervalDays)} يومًا</small>
            </li>;
          })}
        </ul>}
      </section>
    </div>

    <div className="quran-two-col">
      <section className="panel">
        <h3><Sparkles size={18}/> تأملاتي الخاصة</h3>
        <p className="muted small">تأملات شخصية لا تُعرض على أحد، وليست تفسيرًا معتمدًا.</p>
        {state.reflections.length === 0 ? <EmptyNote>لا تأملات محفوظة.</EmptyNote> : <ul className="quran-reflection-list">
          {state.reflections.map(reflection => <li key={reflection.id}>
            <header>
              <strong>{reflection.sourceType === 'quran' && reflection.surah != null && reflection.ayahStart != null
                ? referenceLabel(asset, reflection.surah, reflection.ayahStart, reflection.ayahEnd)
                : reflection.collectionKey === 'bukhari' ? `صحيح البخاري · حديث ${reflection.hadithNumber ?? ''}` : `صحيح مسلم · حديث ${reflection.hadithNumber ?? ''}`}</strong>
              <span className="quran-private">خاص</span>
            </header>
            {reflection.learned && <p><b>تعلمت:</b> {reflection.learned}</p>}
            {reflection.meaning && <p><b>المعنى:</b> {reflection.meaning}</p>}
            {reflection.action && <p><b>العمل:</b> {reflection.action}</p>}
            {reflection.trait && <p><b>الخلق:</b> {reflection.trait}</p>}
            {reflection.intention && <p><b>النية:</b> {reflection.intention}</p>}
            <button className="icon-btn" aria-label="حذف التأمل" onClick={() => { patch({reflections: state.reflections.filter(item => item.id !== reflection.id)}); notify('حُذف التأمل.'); }}><Trash2 size={14}/></button>
          </li>)}
        </ul>}
      </section>

      <section className="panel">
        <h3>سجل الورد</h3>
        {recentLog.length === 0 ? <EmptyNote>لا إنجازات ورد مسجلة بعد.</EmptyNote> : <ul className="quran-mini-list">
          {recentLog.map(entry => <li key={`${entry.activityId}:${entry.date}`}>
            <span>{ROUTINE_KINDS.find(kind => kind.value === entry.kind)?.label ?? entry.kind}</span>
            <small>{entry.date}</small>
          </li>)}
        </ul>}
      </section>
    </div>

    {state.hadithBookmarks.length > 0 && <section className="panel">
      <h3>علامات الحديث</h3>
      <ul className="quran-mini-list">{state.hadithBookmarks.map(bookmark => <li key={bookmark.id}>
        <span>{bookmark.collectionKey === 'bukhari' ? 'صحيح البخاري' : 'صحيح مسلم'} · حديث {toArabicNumber(bookmark.hadithNumber)}</span>
        <button className="icon-btn" aria-label="حذف علامة الحديث" onClick={() => patch({hadithBookmarks: state.hadithBookmarks.filter(item => item.id !== bookmark.id)})}><Trash2 size={14}/></button>
      </li>)}</ul>
    </section>}
  </div>;
}

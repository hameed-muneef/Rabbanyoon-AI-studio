import {useMemo,useState} from 'react';
import {CalendarClock, CheckCircle2, RotateCcw, BookOpen, Shield, Target} from 'lucide-react';
import type {QuranAsset, QuranLearningState} from '../../quran/types';
import {applyReview, dateKey, duePassages, memorizationStats, WEEK_DAYS} from '../../quran/learning';
import {referenceLabel, toArabicNumber} from '../../quran/content';
import {uid} from '../../id';
import PassagePractice from './PassagePractice';

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
};

export default function QuranRevision({asset, state, onState, notify}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const passes = useMemo(() => state.passages.filter(passage => passage.contentType === 'quran' && (passage.reviewCount > 0 || passage.state !== 'new')), [state.passages]);
  const due = duePassages(passes);
  const upcoming = passes.filter(passage => passage.state !== 'mastered' && passage.dueDate && passage.dueDate > dateKey())
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 20);
  const stats = memorizationStats(passes, state.revisionEvents);
  const active = passes.find(passage => passage.id === selected) ?? due[0];

  const rate = (quality: number) => {
    if (!active) return;
    const result = applyReview(active, quality);
    onState({
      ...state,
      passages: state.passages.map(passage => passage.id === active.id ? result.passage : passage),
      revisionEvents: [{...result.event, id: uid()}, ...state.revisionEvents].slice(0, 1000),
      updatedAt: new Date().toISOString()
    });
    setSelected(null);
    notify(result.event.outcome === 'failed'
      ? 'أُعيد المقطع إلى قائمة المراجعة اليوم.'
      : `نجح الاسترجاع؛ المراجعة القادمة بعد ${toArabicNumber(result.passage.intervalDays)} يومًا.`);
  };

  const markAgain = (passageId: string) => {
    onState({
      ...state,
      passages: state.passages.map(passage => passage.id === passageId ? {...passage, state: 'needs_revision', dueDate: dateKey(), updatedAt: new Date().toISOString()} : passage),
      updatedAt: new Date().toISOString()
    });
    notify('أُعيد المقطع إلى قائمة المراجعة.');
  };

  const successRate = stats.totalEvents ? stats.successRate : 0;
  const hasPlans = passes.length > 0;

  return <div className="quran-revision">
    <div className="quran-section-head">
      <div><span className="eyebrow">مراجعة القرآن</span><h2>المراجعة المتباعدة</h2><p>فور الحفظ، ثم بعد يوم و٣ و٧ و١٤ و٣٠ يومًا. تعثر المقطع يعيده إلى قائمة اليوم، والنجاح المتتابع وحده يجعله راسخًا.</p></div>
    </div>

    <div className="rev-schedule-strip" aria-label="جدول المراجعة">
      {['فور الحفظ','يوم','٣ أيام','٧','١٤','٣٠'].map((step, index, arr) => (
        <div className="rev-schedule-step" key={step}>
          <span className="rev-schedule-dot" aria-hidden="true"/>
          <span className="rev-schedule-label">{step}</span>
          {index < arr.length - 1 && <span className="rev-schedule-line" aria-hidden="true"/>}
        </div>
      ))}
    </div>

    <div className="quran-stat-grid rev-stat-grid">
      <div className="panel rev-stat-card">
        <div className="rev-stat-icon" aria-hidden="true"><CalendarClock size={20}/></div>
        <span className="rev-stat-label">مستحق اليوم</span>
        <strong className="rev-stat-value">{toArabicNumber(due.length)}</strong>
        <small className="rev-stat-caption">مقطعًا</small>
      </div>
      <div className="panel rev-stat-card">
        <div className="rev-stat-icon" aria-hidden="true"><BookOpen size={20}/></div>
        <span className="rev-stat-label">آيات محفوظة</span>
        <strong className="rev-stat-value">{toArabicNumber(stats.memorizedVerses)}</strong>
        <small className="rev-stat-caption">آية</small>
      </div>
      <div className="panel rev-stat-card">
        <div className="rev-stat-icon" aria-hidden="true"><Shield size={20}/></div>
        <span className="rev-stat-label">راسخ</span>
        <strong className="rev-stat-value">{toArabicNumber(stats.masteredVerses)}</strong>
        <small className="rev-stat-caption">آية</small>
        {stats.memorizedVerses > 0 && (
          <div className="rev-progress-bar" aria-hidden="true">
            <div className="rev-progress-fill" style={{width: `${Math.round((stats.masteredVerses / stats.memorizedVerses) * 100)}%`}}/>
          </div>
        )}
      </div>
      <div className="panel rev-stat-card">
        <div className="rev-stat-icon" aria-hidden="true"><Target size={20}/></div>
        <span className="rev-stat-label">نسبة نجاح المراجعة</span>
        <div className="rev-ring-wrap">
          <svg className="rev-ring" viewBox="0 0 64 64" aria-hidden="true">
            <circle className="rev-ring-track" cx="32" cy="32" r="26"/>
            <circle className="rev-ring-fill" cx="32" cy="32" r="26" style={{strokeDasharray: `${2 * Math.PI * 26}`, strokeDashoffset: `${2 * Math.PI * 26 * (1 - successRate / 100)}`}}/>
          </svg>
          <strong className="rev-ring-value">{toArabicNumber(successRate)}٪</strong>
        </div>
        <small className="rev-stat-caption">{stats.totalEvents ? `${toArabicNumber(stats.totalEvents)} محاولة` : 'لا توجد محاولات بعد'}</small>
      </div>
    </div>

    <div className="quran-two-col">
      <section className="panel">
        <h3><CalendarClock size={18}/> قائمة اليوم</h3>
        {due.length === 0 ? (
          <div className="rev-empty-state">
            <div className="rev-empty-icon" aria-hidden="true"><CheckCircle2 size={28}/></div>
            <p>لا مقاطع مستحقة اليوم</p>
            <small>تابع خطة الحفظ أو راجع ما هو قادم أدناه.</small>
          </div>
        ) : <ul className="quran-passage-list">
          {due.map(passage => <li key={passage.id}>
            <button className={active?.id === passage.id ? 'active' : ''} onClick={() => setSelected(passage.id)}>
              <span><strong>{passage.surah != null && passage.ayahStart != null ? referenceLabel(asset, passage.surah, passage.ayahStart, passage.ayahEnd) : 'مقطع'}</strong>
                <small>{passage.state === 'needs_revision' ? 'يحتاج مراجعة' : passage.state === 'learning' ? 'مراجعة أولى' : 'مراجعة'} · تكرر {toArabicNumber(passage.reviewCount)} مرة · تعثر {toArabicNumber(passage.lapses)}</small></span>
            </button>
            <div className="rev-row-actions">
              <button className="rev-btn-success" onClick={() => rate(4)}><CheckCircle2 size={15}/> راجعته</button>
              <button className="rev-btn-fail" onClick={() => markAgain(passage.id)}><RotateCcw size={15}/> أعد</button>
            </div>
          </li>)}
        </ul>}
      </section>

      <section className="panel">
        <h3>القادم</h3>
        {upcoming.length === 0 ? (
          <div className="rev-empty-state">
            <div className="rev-empty-icon" aria-hidden="true"><CalendarClock size={28}/></div>
            <p>لا مراجعات مجدولة قادمة</p>
            <small>ستظهر هنا المراجعات بعد حفظ مقاطع جديدة.</small>
          </div>
        ) : <ul className="quran-mini-list">
          {upcoming.map(passage => <li key={passage.id}>
            <span>{passage.surah != null && passage.ayahStart != null ? referenceLabel(asset, passage.surah, passage.ayahStart, passage.ayahEnd) : 'مقطع'}</span>
            <small>{passage.dueDate} · {WEEK_DAYS[new Date(`${passage.dueDate}T12:00:00`).getDay()]}</small>
          </li>)}
        </ul>}
      </section>
    </div>

    {!hasPlans && <section className="panel rev-cta-banner">
      <div className="rev-cta-icon" aria-hidden="true"><BookOpen size={22}/></div>
      <div className="rev-cta-text">
        <strong>أنشئ خطة حفظ</strong>
        <p>ابدأ بحفظ مقاطع قصيرة وتابعها بنظام المراجعة المتباعدة.</p>
      </div>
      <button className="primary rev-cta-btn">إنشاء خطة حفظ</button>
    </section>}

    {active ? <section className="panel">
      <PassagePractice asset={asset} passage={active} notify={notify} onRate={rate}/>
    </section> : <section className="panel quran-revision-empty">
      <CheckCircle2 size={26}/><p>أنشئ خطة حفظ وأتمّ مقطعًا ليظهر هنا في موعده.</p>
    </section>}
  </div>;
}
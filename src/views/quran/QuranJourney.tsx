import {ArrowLeft, BookOpenCheck, Sprout} from 'lucide-react';
import type {QuranAsset, QuranLearningState} from '../../quran/types';
import {journeySummary, type JourneySection} from '../../quran/journey';
import {toArabicNumber} from '../../quran/content';

type Props = {asset: QuranAsset | null; state: QuranLearningState; onOpen: (section: JourneySection) => void};

const dayLabel = (index: number) => index === 0 ? 'اليوم' : index === 1 ? 'غدًا' : `بعد ${toArabicNumber(index)} أيام`;

export default function QuranJourney({asset, state, onOpen}: Props) {
  const summary = journeySummary(state, asset ?? undefined);
  const {step} = summary;
  const lastActivity = state.revisionEvents[0]?.reviewedAt ?? state.history[0]?.readAt;
  const position = state.readingPosition;

  return <section className="quran-journey" aria-label="رحلتي مع القرآن">
    <div className="quran-journey-head">
      <span className="quran-journey-icon"><Sprout size={22}/></span>
      <div><span className="eyebrow">رحلتي مع القرآن</span><h2>{step.title}</h2><p>{step.hint}</p></div>
      <button className="quran-journey-cta" onClick={() => onOpen(step.section)}>{step.title}<ArrowLeft size={18}/></button>
    </div>
    <dl className="quran-journey-stats">
      <div><dt>المحفوظ</dt><dd>{toArabicNumber(summary.memorizedVerses)} آية</dd></div>
      <div><dt>الراسخ</dt><dd>{toArabicNumber(summary.masteredVerses)} آية</dd></div>
      <div><dt>مراجعات اليوم</dt><dd>{toArabicNumber(summary.dueCount)}{summary.overdueCount > 0 && <small> · متأخر {toArabicNumber(summary.overdueCount)}</small>}</dd></div>
      <div><dt>يحتاج تثبيتًا</dt><dd>{toArabicNumber(summary.weakCount)}</dd></div>
      <div><dt>آخر نشاط</dt><dd>{lastActivity ? new Intl.DateTimeFormat('ar-EG', {day: 'numeric', month: 'long'}).format(new Date(lastActivity)) : 'لم يبدأ بعد'}</dd></div>
      {position && asset && <div><dt>آخر قراءة</dt><dd>{asset.surahs.find(surah => surah.n === position.surah)?.name} · {toArabicNumber(position.ayah)}</dd></div>}
    </dl>
    {summary.backlogPlan.length > 0 && <p className="quran-journey-backlog"><BookOpenCheck size={16}/> اقتراح هادئ لتوزيع المراجعات: {summary.backlogPlan.map((count, index) => `${dayLabel(index)} ${toArabicNumber(count)}`).join(' · ')}. ابدأ بما تستطيع، والباقي لا يضيع.</p>}
  </section>;
}

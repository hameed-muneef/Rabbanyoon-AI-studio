// رحلة المستخدم في القرآن: يحدد الإجراء الأبرز التالي من حالته الفعلية (نطاق عمل خالص).
import {dateKey, duePassages, memorizationStats} from './learning';
import type {QuranAsset, QuranLearningState} from './types';

export type JourneyAction = 'create_plan' | 'first_session' | 'review_today' | 'spread_backlog' | 'continue_hifz';
export type JourneySection = 'hifz' | 'revision';

export type JourneyStep = {
  action: JourneyAction;
  section: JourneySection;
  title: string;
  hint: string;
};

export type JourneySummary = {
  step: JourneyStep;
  dueCount: number;
  overdueCount: number;
  weakCount: number;
  memorizedVerses: number;
  masteredVerses: number;
  hasPlan: boolean;
  /** خطة توزيع المتأخر؛ فارغة إن لم يتراكم شيء */
  backlogPlan: number[];
};

/** عتبة التراكم التي نقترح عندها توزيع المراجعات على أيام */
export const BACKLOG_THRESHOLD = 8;
export const DEFAULT_DAILY_REVIEW = 5;

/** يوزع عددًا من المقاطع على الأيام بحد يومي واقعي: [اليوم، غدًا، …] */
export function spreadBacklog(count: number, perDay = DEFAULT_DAILY_REVIEW): number[] {
  const size = Math.max(1, Math.floor(perDay));
  const days: number[] = [];
  for (let left = Math.max(0, Math.floor(count)); left > 0; left -= size) days.push(Math.min(size, left));
  return days;
}

export function journeySummary(state: QuranLearningState, asset?: QuranAsset, today = dateKey()): JourneySummary {
  const quran = state.passages.filter(passage => passage.contentType === 'quran');
  const started = quran.filter(passage => passage.state !== 'new' || passage.reviewCount > 0);
  const due = duePassages(started, today);
  const overdue = due.filter(passage => passage.dueDate && passage.dueDate < today);
  const weak = started.filter(passage => passage.state === 'needs_revision');
  const counts = asset ? new Map(asset.surahs.map(surah => [surah.n, surah.ayahs])) : undefined;
  const stats = memorizationStats(started, state.revisionEvents, counts);
  const hasPlan = state.plans.some(plan => plan.contentType === 'quran' && plan.status === 'active');

  let step: JourneyStep;
  const backlog = due.length >= BACKLOG_THRESHOLD;
  if (due.length > 0) {
    step = backlog
      ? {action: 'spread_backlog', section: 'revision', title: 'ابدأ مراجعة اليوم', hint: 'تراكمت بعض المراجعات، لا بأس. نقترح توزيعها على أيام قليلة بقدر مريح.'}
      : {action: 'review_today', section: 'revision', title: 'ابدأ مراجعة اليوم', hint: 'مراجعة ما حفظت قبل الجديد تُثبّته.'};
  } else if (!hasPlan && started.length === 0) {
    step = {action: 'create_plan', section: 'hifz', title: 'ابدأ رحلتك مع الحفظ', hint: 'اختر مقدارًا مريحًا ووقتًا ثابتًا، وتقدّم بإتقان لا بسرعة.'};
  } else if (started.length === 0) {
    step = {action: 'first_session', section: 'hifz', title: 'ابدأ جلسة الحفظ الأولى', hint: 'خطتك جاهزة. ابدأ بمقطع صغير.'};
  } else {
    step = {action: 'continue_hifz', section: 'hifz', title: 'أكمل حفظك', hint: 'لا مراجعات مستحقة اليوم. تابع المقطع التالي.'};
  }

  return {
    step,
    dueCount: due.length,
    overdueCount: overdue.length,
    weakCount: weak.length,
    memorizedVerses: stats.memorizedVerses,
    masteredVerses: stats.masteredVerses,
    hasPlan,
    backlogPlan: backlog ? spreadBacklog(due.length) : [],
  };
}

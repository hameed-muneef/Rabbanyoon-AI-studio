import {useMemo,useState} from 'react';
import {BookMarked, Pause, Play, Plus, Trash2} from 'lucide-react';
import type {MemorizationPassage, MemorizationPlan, QuranAsset, QuranLearningState, TargetUnit} from '../../quran/types';
import {buildPlanPassages, markMemorized, planProgress, WEEK_DAYS} from '../../quran/learning';
import {toArabicNumber} from '../../quran/content';
import {uid} from '../../id';
import {EmptyNote, ProgressBar} from './ui';
import PassagePractice from './PassagePractice';

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
};

type Preset = '3' | '5' | '10' | 'half' | 'page' | 'custom';
const PRESETS: {value: Preset; label: string; target: number; unit: TargetUnit}[] = [
  {value: '3', label: '٣ آيات يوميًا', target: 3, unit: 'verses'},
  {value: '5', label: '٥ آيات يوميًا', target: 5, unit: 'verses'},
  {value: '10', label: '١٠ آيات يوميًا', target: 10, unit: 'verses'},
  {value: 'half', label: 'نصف صفحة يوميًا', target: 1, unit: 'half_pages'},
  {value: 'page', label: 'صفحة يوميًا', target: 1, unit: 'pages'},
  {value: 'custom', label: 'هدف مخصص', target: 7, unit: 'verses'}
];

export default function QuranMemorization({asset, state, onState, notify}: Props) {
  const [creating, setCreating] = useState(false);
  const [startSurah, setStartSurah] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [endSurah, setEndSurah] = useState(1);
  const [endAyah, setEndAyah] = useState(7);
  const [preset, setPreset] = useState<Preset>('5');
  const [customTarget, setCustomTarget] = useState(7);
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [targetDate, setTargetDate] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);

  const plans = state.plans.filter(plan => plan.contentType === 'quran');
  const selectedPlanValue = plans.find(plan => plan.id === selectedPlan) ?? plans[0];
  const planPassages = useMemo(() => selectedPlanValue
    ? state.passages.filter(passage => passage.planId === selectedPlanValue.id)
    : [], [state.passages, selectedPlanValue]);
  const passage = planPassages.find(item => item.id === selectedPassage) ?? planPassages[0];

  const patch = (partial: Partial<QuranLearningState>) =>
    onState({...state, ...partial, updatedAt: new Date().toISOString()});

  const startSurahInfo = asset.surahs.find(item => item.n === startSurah);
  const endSurahInfo = asset.surahs.find(item => item.n === endSurah);

  const createPlan = () => {
    const startIndex = asset.verses.findIndex(verse => verse.s === startSurah && verse.a === startAyah);
    const endIndex = asset.verses.findIndex(verse => verse.s === endSurah && verse.a === endAyah);
    if (startIndex === -1 || endIndex === -1) { notify('حدد بداية ونهاية صحيحتين.'); return; }
    if (endIndex < startIndex) { notify('نهاية المقطع قبل بدايته.'); return; }
    if (!days.length) { notify('اختر يومًا واحدًا على الأقل في الجدول الأسبوعي.'); return; }
    const duplicate = plans.some(plan => plan.startSurah === startSurah && plan.startAyah === startAyah
      && plan.endSurah === endSurah && plan.endAyah === endAyah && plan.status !== 'paused');
    if (duplicate) { notify('توجد خطة قائمة بالمقطع نفسه.'); return; }
    const chosen = PRESETS.find(item => item.value === preset)!;
    const dailyTarget = preset === 'custom' ? Math.max(1, customTarget) : chosen.target;
    const now = new Date();
    const planTitle = title.trim() || `حفظ ${startSurahInfo?.name ?? ''} ${toArabicNumber(startAyah)} – ${endSurahInfo?.name ?? ''} ${toArabicNumber(endAyah)}`;
    const plan: MemorizationPlan = {
      id: uid(), contentType: 'quran', title: planTitle.slice(0, 200),
      startSurah, startAyah, endSurah, endAyah,
      dailyTarget, targetUnit: chosen.unit, schedule: {days, targetDate: targetDate || undefined},
      status: 'active', createdAt: now.toISOString(), updatedAt: now.toISOString()
    };
    const slice = asset.verses.slice(startIndex, endIndex + 1).map(verse => ({s: verse.s, a: verse.a, p: verse.p}));
    const passages = buildPlanPassages(plan, slice, uid, now);
    patch({plans: [plan, ...state.plans], passages: [...state.passages, ...passages]});
    setSelectedPlan(plan.id);
    setCreating(false);
    setTitle('');
    notify(`أُنشئت الخطة بـ ${toArabicNumber(passages.length)} مقطعًا. الحفظ يبدأ بالمراجعة المباشرة.`);
  };

  const updatePlan = (plan: MemorizationPlan, status: MemorizationPlan['status']) => {
    patch({plans: state.plans.map(item => item.id === plan.id ? {...item, status, updatedAt: new Date().toISOString()} : item)});
    notify(status === 'paused' ? 'أُوقفت الخطة مع حفظ تقدمك.' : status === 'completed' ? 'أُغلقت الخطة كاملة مع حفظ تقدمك.' : 'استُؤنفت الخطة.');
  };

  const deletePlan = (plan: MemorizationPlan) => {
    if (!window.confirm('حذف الخطة وكل مقاطعها؟ سيُحذف تقدم الحفظ المرتبط بها. الإيقاف يحفظ التقدم.')) return;
    patch({plans: state.plans.filter(item => item.id !== plan.id), passages: state.passages.filter(item => item.planId !== plan.id)});
    setSelectedPlan(null);
    setSelectedPassage(null);
  };

  const memorized = (item: MemorizationPassage) => {
    patch({passages: state.passages.map(passageItem => passageItem.id === item.id ? markMemorized(passageItem) : passageItem)});
    notify('سُجّل حفظ المقطع، وأُضيف إلى مراجعة اليوم. لم يُعتبر راسخًا بعد.');
  };

  return <div className="quran-memorization">
    <div className="quran-section-head">
      <div><span className="eyebrow">حفظ القرآن</span><h2>خطط الحفظ والتدريب</h2><p>خطة مرنة، تمارين إخفاء وإكمال وترتيب، ومراجعة متباعدة. لا تُمنح درجة الإتقان بمجرد القراءة.</p></div>
      <button className="primary" onClick={() => setCreating(value => !value)}><Plus size={16}/> خطة حفظ جديدة</button>
    </div>

    {creating && <section className="panel quran-create-plan">
      <h3>خطة جديدة</h3>
      <div className="quran-form-row">
        <label>اسم الخطة<input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="مثال: حفظ جزء عم"/></label>
        <label>تاريخ مستهدف اختياري<input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)}/></label>
      </div>
      <div className="quran-form-row">
        <label>من السورة<select value={startSurah} onChange={event => { const value = Number(event.target.value); setStartSurah(value); setStartAyah(1); if (value > endSurah) { setEndSurah(value); setEndAyah(asset.surahs.find(item => item.n === value)?.ayahs ?? 1); } }}>
          {asset.surahs.map(item => <option key={item.n} value={item.n}>{item.n}. {item.name}</option>)}
        </select></label>
        <label>من الآية<input type="number" min={1} max={startSurahInfo?.ayahs ?? 1} value={startAyah} onChange={event => setStartAyah(Number(event.target.value))}/></label>
        <label>إلى السورة<select value={endSurah} onChange={event => { const value = Number(event.target.value); setEndSurah(value); setEndAyah(asset.surahs.find(item => item.n === value)?.ayahs ?? 1); }}>
          {asset.surahs.map(item => <option key={item.n} value={item.n}>{item.n}. {item.name}</option>)}
        </select></label>
        <label>إلى الآية<input type="number" min={1} max={endSurahInfo?.ayahs ?? 1} value={endAyah} onChange={event => setEndAyah(Number(event.target.value))}/></label>
      </div>
      <fieldset className="quran-presets"><legend>الهدف اليومي</legend>
        {PRESETS.map(item => <label key={item.value} className={preset === item.value ? 'selected' : ''}>
          <input type="radio" name="preset" checked={preset === item.value} onChange={() => setPreset(item.value)}/>{item.label}
        </label>)}
        {preset === 'custom' && <label className="quran-custom-target">عدد الآيات<input type="number" min={1} max={100} value={customTarget} onChange={event => setCustomTarget(Number(event.target.value))}/></label>}
      </fieldset>
      <fieldset className="quran-days"><legend>أيام الأسبوع</legend>
        {WEEK_DAYS.map((label, index) => <label key={label} className={days.includes(index) ? 'selected' : ''}>
          <input type="checkbox" checked={days.includes(index)} onChange={event => setDays(current => event.target.checked ? [...new Set([...current, index])] : current.filter(day => day !== index))}/>{label}
        </label>)}
      </fieldset>
      <div className="quran-form-actions">
        <button className="primary" onClick={createPlan}>إنشاء الخطة</button>
        <button className="soft-btn" onClick={() => setCreating(false)}>إلغاء</button>
      </div>
    </section>}

    <div className="quran-two-col">
      <section className="panel">
        <h3><BookMarked size={18}/> خططك</h3>
        {plans.length === 0 ? <EmptyNote>لا توجد خطة حفظ بعد. أنشئ خطة وحدد بداية ونهاية وهدفًا يوميًا.</EmptyNote> : <ul className="quran-plan-list">
          {plans.map(plan => {
            const progress = planProgress(plan, state.passages);
            return <li key={plan.id} className={selectedPlanValue?.id === plan.id ? 'active' : ''}>
              <button className="quran-plan-main" onClick={() => { setSelectedPlan(plan.id); setSelectedPassage(null); }}>
                <div><strong>{plan.title}</strong><small>{plan.status === 'active' ? 'نشطة' : plan.status === 'paused' ? 'موقوفة' : 'مكتملة'} · {toArabicNumber(progress.total)} مقطعًا · {toArabicNumber(progress.mastered)} راسخ</small></div>
                <ProgressBar value={progress.ratio} label={`تقدم ${plan.title}`}/>
              </button>
              <div className="quran-plan-actions">
                {plan.status === 'active' ? <button className="icon-btn" aria-label="إيقاف الخطة" onClick={() => updatePlan(plan, 'paused')}><Pause size={15}/></button>
                  : <button className="icon-btn" aria-label="استئناف الخطة" onClick={() => updatePlan(plan, 'active')}><Play size={15}/></button>}
                <button className="icon-btn" aria-label="حذف الخطة" onClick={() => deletePlan(plan)}><Trash2 size={15}/></button>
              </div>
            </li>;
          })}
        </ul>}
      </section>

      <section className="panel">
        <h3>مقاطع الخطة</h3>
        {!selectedPlanValue ? <EmptyNote>اختر خطة لعرض مقاطعها.</EmptyNote> : planPassages.length === 0 ? <EmptyNote>لا مقاطع في هذه الخطة.</EmptyNote> : <ul className="quran-passage-list">
          {planPassages.map((item, index) => <li key={item.id}>
            <button className={passage?.id === item.id ? 'active' : ''} onClick={() => setSelectedPassage(item.id)}>
              <span className="quran-passage-index">{toArabicNumber(index + 1)}</span>
              <span><strong>آية {toArabicNumber(item.ayahStart ?? 0)}{item.ayahEnd !== item.ayahStart ? `–${toArabicNumber(item.ayahEnd ?? 0)}` : ''}</strong><small>{item.state === 'mastered' ? 'راسخ' : item.state === 'good' ? 'جيد' : item.state === 'needs_revision' ? 'يحتاج مراجعة' : item.state === 'learning' ? 'يتعلم' : 'لم يبدأ'}{item.dueDate ? ` · استحقاق ${item.dueDate}` : ''}</small></span>
            </button>
          </li>)}
        </ul>}
      </section>
    </div>

    {passage && selectedPlanValue && <section className="panel">
      <PassagePractice asset={asset} passage={passage} notify={notify} onMemorized={passage.state === 'new' || passage.state === 'learning' ? () => memorized(passage) : undefined}/>
    </section>}

    <p className="muted small quran-footnote">الهدف اليومي يوزّع المقطع عند إنشاء الخطة. تغيير الجدول لا يمحو تقدم المقاطع السابقة؛ يمكنك إيقاف الخطة واستئنافها لاحقًا.</p>
  </div>;
}

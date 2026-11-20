import {useEffect} from 'react';
import {CalendarClock, CheckCircle2, Plus, Trash2} from 'lucide-react';
import type {QuranAsset, QuranLearningState, RoutineActivity, RoutineKind, RoutineSlot} from '../../quran/types';
import {
  ROUTINE_KINDS, ROUTINE_SLOTS, WEEK_DAYS, dateKey, defaultRoutine, logRoutineCompletion,
  syncRoutineTasks
} from '../../quran/learning';
import {isTaskDone, markTaskDone} from '../../task-periods';
import type {Task} from '../../app-state';
import {uid} from '../../id';
import {EmptyNote} from './ui';

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  tasks: Task[];
  onTasks: (tasks: Task[]) => void;
  notify: (text: string) => void;
  onOpenTasks: () => void;
};

export default function QuranRoutine({asset, state, onState, tasks, onTasks, notify, onOpenTasks}: Props) {
  const today = dateKey();
  const patch = (partial: Partial<QuranLearningState>) =>
    onState({...state, ...partial, updatedAt: new Date().toISOString()});

  useEffect(() => {
    const next = syncRoutineTasks(tasks, state.routine, today, state.plans);
    if (JSON.stringify(next.map(task => [task.id, task.title, task.sourceLabel, task.period])) !== JSON.stringify(tasks.map(task => [task.id, task.title, task.sourceLabel, task.period]))) {
      onTasks(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.routine, state.plans, tasks, today]);

  const update = (id: string, partial: Partial<RoutineActivity>) => {
    patch({routine: state.routine.map(activity => activity.id === id ? {...activity, ...partial, updatedAt: new Date().toISOString()} : activity)});
  };

  const add = () => {
    const stamp = new Date().toISOString();
    patch({routine: [...state.routine, {
      id: uid(), kind: 'quran_reading', slot: 'any', days: [0, 1, 2, 3, 4, 5, 6], enabled: true,
      config: {}, createdAt: stamp, updatedAt: stamp
    }]});
  };

  const addSuggested = () => {
    patch({routine: defaultRoutine()});
    notify('أُضيف الورد المقترح. يمكنك تعديل كل نشاط أو تعطيله.');
  };

  const remove = (id: string) => {
    patch({routine: state.routine.filter(activity => activity.id !== id)});
    notify('أُزيل النشاط من الورد. تقدم الحفظ والقراءة محفوظ في سجلاته.');
  };

  const todayTasks = tasks.filter(task => task.id.startsWith('quran:'));
  const complete = (activity: RoutineActivity) => {
    const task = todayTasks.find(item => item.id === `quran:${activity.id}`);
    if (task) onTasks(tasks.map(item => item.id === task.id ? markTaskDone(item, true) : item));
    onState(logRoutineCompletion(state, activity, today));
    notify(activity.kind === 'quran_memorization'
      ? 'سُجّل ورد الحفظ، ونُقل مقطع جديد إلى مراجعة اليوم دون اعتباره راسخًا.'
      : 'سُجّل إنجاز الورد في سجل الإنجاز.');
  };

  return <div className="quran-routine">
    <div className="quran-section-head">
      <div><span className="eyebrow">وردي اليومي</span><h2>ورد القرآن والسنة</h2><p>اختر الأنشطة والأوقات المقترحة حول الصلوات. تُضاف تلقائيًا إلى مهام اليوم نفسها، دون محرك مهام منفصل.</p></div>
      <div className="quran-head-actions"><button className="primary" onClick={add}><Plus size={16}/> نشاط جديد</button><button className="soft-btn" onClick={onOpenTasks}><CalendarClock size={16}/> مركز المهام</button></div>
    </div>

    <section className="panel quran-routine-today">
      <h3>ورد اليوم</h3>
      {todayTasks.length === 0 ? <EmptyNote>لا توجد أنشطة مجدولة اليوم. فعّل نشاطًا أو أضف غيره.</EmptyNote> : <ul className="quran-today-list">
        {todayTasks.map(task => {
          const activity = state.routine.find(item => `quran:${item.id}` === task.id);
          const done = isTaskDone(task);
          return <li key={task.id} className={done ? 'done' : ''}>
            <div><strong>{task.title}</strong><small>{task.sourceLabel}</small></div>
            {done ? <span className="quran-done"><CheckCircle2 size={16}/> منجز اليوم</span>
              : <button className="primary" disabled={!activity} onClick={() => activity && complete(activity)}><CheckCircle2 size={15}/> إنجاز</button>}
          </li>;
        })}
      </ul>}
      <p className="muted small">إنجاز نشاط قراءة لا يسجّل قراءة فعلية إلا إذا حددت السورة والمقطع. وإنجاز نشاط حفظ لا يمنح إتقانًا.</p>
    </section>

    <section className="panel">
      <h3>إعداد الورد</h3>
      {state.routine.length === 0 ? <div className="quran-routine-suggest">
        <EmptyNote>لم تُضف نشاطًا بعد. لا تُضاف مهام إلى قائمتك اليومية إلا بعد أن تختار نشاطًا.</EmptyNote>
        <button className="soft-btn" onClick={addSuggested}><Plus size={15}/> أضف الورد المقترح (قراءة، حفظ، مراجعة، حديث)</button>
      </div> : <ul className="quran-routine-list">
        {state.routine.map(activity => {
          const plan = activity.config.planId ? state.plans.find(item => item.id === activity.config.planId) : undefined;
          const surah = activity.config.surah ? asset.surahs.find(item => item.n === activity.config.surah) : undefined;
          return <li key={activity.id} className={activity.enabled ? '' : 'disabled'}>
            <div className="quran-routine-row">
              <label className="quran-switch"><input type="checkbox" checked={activity.enabled} onChange={event => update(activity.id, {enabled: event.target.checked})}/> <span>مفعّل</span></label>
              <label>النشاط<select value={activity.kind} onChange={event => update(activity.id, {kind: event.target.value as RoutineKind})}>
                {ROUTINE_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select></label>
              <label>الوقت المقترح<select value={activity.slot} onChange={event => update(activity.id, {slot: event.target.value as RoutineSlot})}>
                {ROUTINE_SLOTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select></label>
              <button className="icon-btn" aria-label="حذف النشاط" onClick={() => remove(activity.id)}><Trash2 size={15}/></button>
            </div>

            {(activity.kind === 'quran_reading') && <div className="quran-routine-row quran-routine-config">
              <label>السورة<select value={activity.config.surah ?? ''} onChange={event => update(activity.id, {config: {...activity.config, surah: event.target.value ? Number(event.target.value) : undefined, ayahFrom: 1, ayahTo: event.target.value ? asset.surahs.find(item => item.n === Number(event.target.value))?.ayahs : undefined}})}>
                <option value="">بدون تحديد</option>
                {asset.surahs.map(item => <option key={item.n} value={item.n}>{item.n}. {item.name}</option>)}
              </select></label>
              {surah && <><label>من الآية<input type="number" min={1} max={surah.ayahs} value={activity.config.ayahFrom ?? 1} onChange={event => update(activity.id, {config: {...activity.config, ayahFrom: Number(event.target.value)}})}/></label>
                <label>إلى الآية<input type="number" min={1} max={surah.ayahs} value={activity.config.ayahTo ?? surah.ayahs} onChange={event => update(activity.id, {config: {...activity.config, ayahTo: Number(event.target.value)}})}/></label></>}
            </div>}

            {(activity.kind === 'quran_memorization') && <div className="quran-routine-row quran-routine-config">
              <label>خطة الحفظ<select value={activity.config.planId ?? ''} onChange={event => update(activity.id, {config: {...activity.config, planId: event.target.value || undefined}})}>
                <option value="">أول خطة نشطة</option>
                {state.plans.filter(item => item.contentType === 'quran' && item.status !== 'paused').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select></label>
              {plan && <small>الخطة المختارة: {plan.title}</small>}
            </div>}

            {(activity.kind === 'hadith_reading' || activity.kind === 'hadith_memorization') && <div className="quran-routine-row quran-routine-config">
              <label>المجموعة<select value={activity.config.collectionKey ?? ''} onChange={event => update(activity.id, {config: {...activity.config, collectionKey: event.target.value || undefined}})}>
                <option value="">حسب المصدر المتاح</option>
                <option value="bukhari">صحيح البخاري</option>
                <option value="muslim">صحيح مسلم</option>
              </select></label>
              <small>لا يظهر نشاط الحديث كمحتوى حتى يُستورد المصدر المرخص.</small>
            </div>}

            <fieldset className="quran-days quran-routine-days"><legend>الأيام</legend>
              {WEEK_DAYS.map((label, index) => <label key={label} className={activity.days.includes(index) ? 'selected' : ''}>
                <input type="checkbox" checked={activity.days.includes(index)} onChange={event => update(activity.id, {days: event.target.checked ? [...new Set([...activity.days, index])].sort() : activity.days.filter(day => day !== index)})}/>{label}
              </label>)}
            </fieldset>
          </li>;
        })}
      </ul>}
    </section>

    <p className="muted small quran-footnote">الأوقات المقترحة ليست إلزامًا: بعد الفجر للقراءة، وبعد العصر للحفظ الجديد، وبعد المغرب للمراجعة، وبعد العشاء للحديث. يمكنك تغييرها أو تعطيلها.</p>
  </div>;
}

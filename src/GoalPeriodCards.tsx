import {CalendarDays,CalendarRange,CalendarCheck,CalendarClock} from 'lucide-react';
import {goalPeriodKey,goalPeriodLabel,goalPeriods,goalStepCompleted,goalStepCompletionKey,goalSteps,stepsForPeriod,type Goal,type GoalPeriod} from './goal-plan';

type Props={goals:Goal[];onGoals:(goals:Goal[])=>void};
const config:Record<GoalPeriod,{title:string;empty:string;icon:typeof CalendarDays}>={
  daily:{title:'خطوات اليوم',empty:'لا توجد خطوات يومية بعد.',icon:CalendarDays},
  weekly:{title:'خطوات الأسبوع',empty:'لا توجد خطوات أسبوعية بعد.',icon:CalendarRange},
  monthly:{title:'خطوات الشهر',empty:'لا توجد خطوات شهرية بعد.',icon:CalendarCheck},
  yearly:{title:'خطوات السنة',empty:'لا توجد خطوات سنوية بعد.',icon:CalendarClock},
  custom:{title:'خطوات بتاريخ مخصص',empty:'لا توجد خطوات بموعد مخصص بعد.',icon:CalendarDays},
};
export default function GoalPeriodCards({goals,onGoals}:Props){
  const toggle=(goalId:string,stepId:string,checked:boolean)=>{
    onGoals(goals.map(goal=>goal.id===goalId?{...goal,steps:goalSteps(goal).map(step=>step.id===stepId?{...step,done:{...step.done,[goalStepCompletionKey(step)]:checked}}:step)}:goal));
  };
  return <section className="goal-period-section" aria-label="خطوات الأهداف حسب الفترة"><div className="goal-period-heading"><div><span className="eyebrow">متابعة خطواتك</span><h2>ما الذي تعمل عليه الآن؟</h2><p>الخطوات التي تضيفها لكل هدف تظهر هنا تلقائيًا حسب تكرارها.</p></div></div><div className="goal-period-grid">{goalPeriods.map(period=>{const entries=stepsForPeriod(goals,period);const key=goalPeriodKey(period);const done=entries.filter(entry=>(period==='daily'||period==='custom')?goalStepCompleted(entry.step):entry.step.done[goalPeriodKey(period,new Date(),entry.step.customDate)]).length;const Icon=config[period].icon;return <article className={`goal-period-card goal-period-card-${period}`} key={period}><div className="goal-period-card-head"><span className="goal-period-icon"><Icon size={21}/></span><div className="goal-period-title"><h3>{config[period].title}</h3><small>{period==='custom'?'مواعيد فردية':goalPeriodLabel(period,key)}</small></div><span className="goal-period-count" aria-label={`${done} من ${entries.length} خطوات مكتملة`}>{done.toLocaleString('ar-EG')} <span>من</span> {entries.length.toLocaleString('ar-EG')}</span></div><div className="goal-period-card-list">{entries.length===0?<p className="goal-period-empty">{config[period].empty}</p>:entries.map(({goalId,goalTitle,step})=>{const stepKey=goalPeriodKey(period,new Date(),step.customDate);const checked=goalStepCompleted(step)||!!step.done[stepKey];return <label className="goal-period-item" key={`${goalId}:${step.id}`}><input type="checkbox" aria-label={`إنجاز ${step.title} ضمن ${config[period].title}`} checked={checked} disabled={(period==='daily'||period==='custom')&&checked} onChange={event=>toggle(goalId,step.id,event.target.checked)}/><span><strong className={checked?'completed':''}>{step.title}</strong><small>هدف: {goalTitle}{period==='custom'&&step.customDate?` · موعد التنفيذ: ${new Intl.DateTimeFormat('ar-EG',{calendar:'gregory',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${step.customDate}T12:00:00`))}`:''}</small></span></label>})}</div></article>})}</div></section>;
}

import {useState} from 'react';
import {CheckCircle2,History} from 'lucide-react';
import {goalIsoWeek,goalPeriodKey,goalPeriodLabel,goalPeriods,goalSteps,goalWeekKey,goalWeeksInYear,localGoalDate,type Goal,type GoalPeriod} from './goal-plan';

type Props={goals:Goal[]};
type HistoryEntry={id:string;goalTitle:string;stepTitle:string;period:GoalPeriod;key:string};
const labels:Record<GoalPeriod,string>={daily:'يومي',weekly:'أسبوعي',monthly:'شهري',yearly:'سنوي',custom:'تاريخ مخصص'};

export default function GoalHistory({goals}:Props){
  const [period,setPeriod]=useState<GoalPeriod|'all'>('daily');
  const [keys,setKeys]=useState<Record<GoalPeriod,string>>(()=>({daily:goalPeriodKey('daily'),weekly:goalPeriodKey('weekly'),monthly:goalPeriodKey('monthly'),yearly:goalPeriodKey('yearly'),custom:''}));
  const [limit,setLimit]=useState(12);
  const today=localGoalDate();
  const currentWeek=goalIsoWeek(goalPeriodKey('weekly'));
  const selectedWeek=goalIsoWeek(keys.weekly);
  const changeKey=(value:GoalPeriod,key:string)=>{setKeys(previous=>({...previous,[value]:key}));setLimit(12)};
  const entries:HistoryEntry[]=goals.flatMap(goal=>goalSteps(goal).flatMap(step=>Object.entries(step.done).filter(([,done])=>done).map(([key])=>({id:`${goal.id}:${step.id}:${key}`,goalTitle:goal.title,stepTitle:step.title,period:step.period,key}))));
  const filtered=entries.filter(entry=>period==='all'||entry.period===period&&(period==='custom'||entry.key===keys[period])).sort((a,b)=>b.key.localeCompare(a.key));
  const maxWeek=selectedWeek.year===currentWeek.year?currentWeek.week:goalWeeksInYear(selectedWeek.year);
  const selectWeek=(year:number,week:number)=>changeKey('weekly',goalWeekKey(year,Math.min(week,year===currentWeek.year?currentWeek.week:goalWeeksInYear(year))));
  return <section className="goal-history" aria-labelledby="goal-history-title">
    <div className="goal-history-heading"><span className="goal-history-icon"><History size={22}/></span><div><h2 id="goal-history-title">سجل الإنجاز</h2><p>اختر الفترة التي تريد مراجعة ما أُنجز فيها.</p></div><span className="goal-history-total">{entries.length.toLocaleString('ar-EG')} إنجاز</span></div>
    <div className="goal-history-filters" aria-label="نوع الفترة"><button type="button" className={period==='all'?'active':''} aria-pressed={period==='all'} onClick={()=>{setPeriod('all');setLimit(12)}}>كل السجل</button>{goalPeriods.map(value=><button type="button" key={value} className={period===value?'active':''} aria-pressed={period===value} onClick={()=>{setPeriod(value);setLimit(12)}}>{labels[value]}</button>)}</div>
    {period!=='all'&&<div className="goal-history-period-picker">
      {period==='daily'&&<label>اختر يومًا<input type="date" max={today} value={keys.daily} onChange={event=>changeKey('daily',event.target.value)}/></label>}
      {period==='weekly'&&<><label>السنة<input type="number" min="1970" max={currentWeek.year} value={selectedWeek.year} onChange={event=>{const year=Number(event.target.value);if(year>=1970&&year<=currentWeek.year)selectWeek(year,selectedWeek.week)}}/></label><label>رقم الأسبوع (ISO)<select value={selectedWeek.week} onChange={event=>selectWeek(selectedWeek.year,Number(event.target.value))}>{Array.from({length:maxWeek},(_,index)=><option key={index+1} value={index+1}>الأسبوع {(index+1).toLocaleString('ar-EG')}</option>)}</select></label></>}
      {period==='monthly'&&<label>اختر شهرًا<input type="month" max={today.slice(0,7)} value={keys.monthly} onChange={event=>changeKey('monthly',event.target.value)}/></label>}
      {period==='yearly'&&<label>اختر سنة<input type="number" min="1970" max={today.slice(0,4)} value={keys.yearly} onChange={event=>changeKey('yearly',event.target.value)}/></label>}
      {period==='custom'&&<p className="goal-history-note">يعرض كل إنجازات الخطوات ذات التاريخ المخصص.</p>}
      <strong className="goal-history-selected">{keys[period]?goalPeriodLabel(period,keys[period]):'اختر فترة'}</strong>
    </div>}
    {filtered.length===0?<p className="goal-history-empty">{period==='all'?'لا توجد إنجازات مسجّلة بعد.':`لا توجد خطوات مُنجزة في ${keys[period]?goalPeriodLabel(period,keys[period]):'الفترة المختارة'}.`}</p>:<><ul className="goal-history-list">{filtered.slice(0,limit).map(entry=><li key={entry.id}><CheckCircle2 size={19}/><div><strong>{entry.stepTitle}</strong><small>هدف: {entry.goalTitle}</small></div><span>{goalPeriodLabel(entry.period,entry.key)}</span></li>)}</ul>{filtered.length>limit&&<button type="button" className="soft-btn goal-history-more" onClick={()=>setLimit(limit+12)}>عرض المزيد</button>}</>}
    <p className="goal-history-note">يعرض اختيار اليوم إنجازات الخطوات اليومية، واختيار الأسبوع أو الشهر أو السنة إنجازات الخطوات التابعة لتلك الفترة. يسجل النظام الفترة، وليس ساعة الضغط على علامة الصح.</p>
  </section>;
}

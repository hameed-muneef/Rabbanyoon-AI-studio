import {useState} from 'react';
import {CalendarDays,Plus,Trash2} from 'lucide-react';
import type {Task} from '../app-state';
import {isTaskDone,markTaskDone} from '../task-periods';
import {goalIsoWeek,goalPeriodKey,goalWeekKey,goalWeeksInYear} from '../goal-plan';
import {parseWeek,scheduleTask,weekDays} from '../weekly-planning';
import {hijriDate} from '../hijri';
import {uid} from '../id';
import '../weekly-planning.css';

type Props={tasks:Task[];onTasks:(tasks:Task[])=>void};
const dateLabel=(date:string)=>new Intl.DateTimeFormat('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`));
const weekValue=(start:string)=>{const {year,week}=goalIsoWeek(start);return `${year}-W${String(week).padStart(2,'0')}`};

export default function WeeklyPlanner({tasks,onTasks}:Props){
  const [weekStart,setWeekStart]=useState(()=>goalPeriodKey('weekly'));
  const [title,setTitle]=useState('');
  const [day,setDay]=useState('');
  const selected=goalIsoWeek(weekStart);
  const days=weekDays(weekStart);
  const visible=tasks.filter(task=>task.weekStart===weekStart);
  const unscheduled=tasks.filter(task=>!task.weekStart);
  const changeWeek=(start:string)=>{setWeekStart(start);setDay('')};
  const changeTask=(task:Task)=>onTasks(tasks.map(item=>item.id===task.id?task:item));
  return <div className="weekly-planner">
    <div className="page-intro"><span className="eyebrow">حياتي مع الله</span><h1>أسبوعي مع الله</h1><p>اختر الأسبوع، ثم وزّع مهامك على أيامه بما يناسبك.</p></div>
    <section className="panel" aria-label="اختيار الأسبوع">
      <div className="panel-head"><CalendarDays size={22}/><h2>خطّة الأسبوع</h2></div>
      <div className="week-picker"><label>السنة<input aria-label="سنة الأسبوع" type="number" min="1970" max="9998" value={selected.year} onChange={event=>{const year=Number(event.target.value);if(Number.isInteger(year)&&year>=1970&&year<=9998)changeWeek(goalWeekKey(year,Math.min(selected.week,goalWeeksInYear(year))))}}/></label>
        <label>رقم الأسبوع<select aria-label="رقم الأسبوع" value={selected.week} onChange={event=>changeWeek(goalWeekKey(selected.year,Number(event.target.value)))}>{Array.from({length:goalWeeksInYear(selected.year)},(_,i)=><option key={i+1} value={i+1}>الأسبوع {(i+1).toLocaleString('ar-EG')}</option>)}</select></label>
        <button type="button" className="soft-btn" onClick={()=>changeWeek(goalPeriodKey('weekly'))}>الأسبوع الحالي</button>
      </div>
      <p className="week-range">{dateLabel(days[0])} — {dateLabel(days[6])}</p>
      {hijriDate(days[0])&&<p className="week-hijri">الموافق هجريًا: {hijriDate(days[0])} — {hijriDate(days[6])}</p>}
      <p className="muted small">الترقيم وفق ISO: يبدأ الأسبوع يوم الاثنين وينتهي الأحد. يظهر التاريخ بجوار كل يوم لتختار موعدك بوضوح.</p>
    </section>
    <section className="panel" aria-label="مهام الأسبوع المختار">
      <div className="panel-head"><h2>مهام الأسبوع {selected.week.toLocaleString('ar-EG')}</h2></div>
      <form className="weekly-add" onSubmit={event=>{event.preventDefault();if(!title.trim())return;onTasks([...tasks,scheduleTask({id:uid(),title:title.trim(),period:'weekly',done:false,optional:true},weekStart,day)]);setTitle('')}}>
        <label>المهمة<input required aria-label="المهمة الأسبوعية" placeholder="ما الذي تريد إنجازه؟" value={title} onChange={event=>setTitle(event.target.value)}/></label>
        <label>اليوم (اختياري)<select aria-label="يوم المهمة" value={day} onChange={event=>setDay(event.target.value)}><option value="">خلال الأسبوع دون يوم محدد</option>{days.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
        <button className="primary"><Plus size={18}/> إضافة المهمة</button>
      </form>
      <p className="muted small">عند تحديد يوم، تظهر المهمة وتنبيه بها في «تخطيط يومي» عند حلول ذلك التاريخ.</p>
      {!visible.length&&<p className="muted">لا توجد مهام لهذا الأسبوع بعد.</p>}
      <div className="task-list">{visible.map(task=><div className="weekly-task" key={task.id}>
        <div className="task"><label className="task-main"><input type="checkbox" checked={isTaskDone(task)} onChange={()=>changeTask(markTaskDone(task,!isTaskDone(task)))}/><span className={isTaskDone(task)?'completed':''}>{task.title}</span></label><button className="icon-btn danger" aria-label={`حذف ${task.title}`} onClick={()=>onTasks(tasks.filter(item=>item.id!==task.id))}><Trash2 size={17}/></button></div>
        <div className="week-task-schedule"><label>اليوم<select aria-label={`يوم ${task.title}`} value={task.scheduledDate??''} onChange={event=>changeTask(scheduleTask(task,weekStart,event.target.value))}><option value="">دون يوم محدد</option>{days.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
          <label>نقل إلى أسبوع<input aria-label={`أسبوع ${task.title}`} type="week" min="1970-W01" max="9998-W52" value={weekValue(weekStart)} onChange={event=>{const start=parseWeek(event.target.value);if(start){const index=days.indexOf(task.scheduledDate??'');changeTask(scheduleTask(task,start,index>=0?weekDays(start)[index]:undefined))}}}/></label></div>
      </div>)}</div>
    </section>
    {unscheduled.length>0&&<section className="panel"><h2>مهام سابقة دون أسبوع محدد</h2><p className="muted">مهامك القديمة محفوظة؛ حدّد الأسبوع أعلاه ثم انقل المهمة إليه.</p>{unscheduled.map(task=><div className="task" key={task.id}><span className={isTaskDone(task)?'completed':''}>{task.title}</span><button type="button" className="soft-btn" onClick={()=>changeTask(scheduleTask(task,weekStart))}>إلى الأسبوع المختار</button><button className="icon-btn danger" aria-label={`حذف ${task.title}`} onClick={()=>onTasks(tasks.filter(item=>item.id!==task.id))}><Trash2 size={17}/></button></div>)}</section>}
  </div>;
}

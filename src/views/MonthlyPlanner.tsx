import {useState} from 'react';
import {CalendarDays,Plus,Trash2} from 'lucide-react';
import type {Task} from '../app-state';
import {isTaskDone,markTaskDone} from '../task-periods';
import {goalPeriodKey} from '../goal-plan';
import {monthDays,scheduleMonthlyTask,moveMonthlyTask} from '../weekly-planning';
import {hijriDate} from '../hijri';
import {uid} from '../id';
import '../weekly-planning.css';

type Props={tasks:Task[];onTasks:(tasks:Task[])=>void};
const dateLabel=(date:string)=>new Intl.DateTimeFormat('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`));

export default function MonthlyPlanner({tasks,onTasks}:Props){
  const [monthKey,setMonthKey]=useState(()=>goalPeriodKey('monthly'));
  const [title,setTitle]=useState('');
  const [day,setDay]=useState('');
  const [year,month]=monthKey.split('-').map(Number);
  const monthNames=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('ar-EG',{month:'long',calendar:'gregory'}).format(new Date(2026,i,1))); 
  const days=monthDays(monthKey);
  const visible=tasks.filter(task=>task.monthKey===monthKey);
  const unscheduled=tasks.filter(task=>!task.monthKey);
  const changeMonth=(start:string)=>{setMonthKey(start);setDay('')};
  const changeTask=(task:Task)=>onTasks(tasks.map(item=>item.id===task.id?task:item));
  return <div className="weekly-planner">
    <div className="page-intro"><span className="eyebrow">حياتي مع الله</span><h1>شهري مع الله</h1><p>اختر الشهر، ثم وزّع مهامك على أيامه بما يناسبك.</p></div>
    <section className="panel" aria-label="اختيار الشهر">
      <div className="panel-head"><CalendarDays size={22}/><h2>خطّة الشهر</h2></div>
      <div className="week-picker"><label>السنة<input aria-label="سنة الشهر" type="number" min="1970" max="9998" value={year} onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=1970&&value<=9998)changeMonth(String(value)+'-'+String(month).padStart(2,'0'))}}/></label>
        <label>الشهر<select aria-label="الشهر" value={month} onChange={event=>changeMonth(String(year)+'-'+event.target.value.padStart(2,'0'))}>{monthNames.map((name,i)=><option key={i+1} value={i+1}>{name} · {(i+1).toLocaleString('ar-EG')}</option>)}</select></label>
        <button type="button" className="soft-btn" onClick={()=>changeMonth(goalPeriodKey('monthly'))}>الشهر الحالي</button>
      </div>
      <p className="week-range">{dateLabel(days[0])} — {dateLabel(days[days.length-1])}</p>
      {hijriDate(days[0])&&<p className="week-hijri">الموافق هجريًا: {hijriDate(days[0])} — {hijriDate(days[days.length-1])}</p>}
      <p className="muted small">الشهور بالتقويم الميلادي. يظهر التاريخ بجوار كل يوم، مع مراعاة عدد أيام الشهر والسنة الكبيسة.</p>
    </section>
    <section className="panel" aria-label="مهام الشهر المختار">
      <div className="panel-head"><h2>مهام الشهر {monthNames[month-1]}</h2></div>
      <form className="weekly-add" onSubmit={event=>{event.preventDefault();if(!title.trim())return;onTasks([...tasks,scheduleMonthlyTask({id:uid(),title:title.trim(),period:'monthly',done:false,optional:true},monthKey,day)]);setTitle('')}}>
        <label>المهمة<input required aria-label="المهمة الشهرية" placeholder="ما الذي تريد إنجازه؟" value={title} onChange={event=>setTitle(event.target.value)}/></label>
        <label>اليوم (اختياري)<select aria-label="يوم المهمة" value={day} onChange={event=>setDay(event.target.value)}><option value="">خلال الشهر دون يوم محدد</option>{days.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
        <button className="primary"><Plus size={18}/> إضافة المهمة</button>
      </form>
      <p className="muted small">عند تحديد يوم، تظهر المهمة وتنبيه بها في «تخطيط يومي» عند حلول ذلك التاريخ. عند النقل إلى شهر لا يحتوي اليوم المختار، تُحفظ المهمة دون يوم لتختار موعدًا جديدًا.</p>
      {!visible.length&&<p className="muted">لا توجد مهام لهذا الشهر بعد.</p>}
      <div className="task-list">{visible.map(task=><div className="weekly-task" key={task.id}>
        <div className="task"><label className="task-main"><input type="checkbox" checked={isTaskDone(task)} onChange={()=>changeTask(markTaskDone(task,!isTaskDone(task)))}/><span className={isTaskDone(task)?'completed':''}>{task.title}</span></label><button className="icon-btn danger" aria-label={`حذف ${task.title}`} onClick={()=>onTasks(tasks.filter(item=>item.id!==task.id))}><Trash2 size={17}/></button></div>
        <div className="week-task-schedule"><label>اليوم<select aria-label={`يوم ${task.title}`} value={task.scheduledDate??''} onChange={event=>changeTask(scheduleMonthlyTask(task,monthKey,event.target.value))}><option value="">دون يوم محدد</option>{days.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
          <label>نقل إلى شهر<input aria-label={`شهر ${task.title}`} type="month" min="1970-01" max="9998-12" value={monthKey} onChange={event=>{const value=event.target.value;if(monthDays(value).length)changeTask(moveMonthlyTask(task,value))}}/></label></div>
      </div>)}</div>
    </section>
    {unscheduled.length>0&&<section className="panel"><h2>مهام سابقة دون شهر محدد</h2><p className="muted">مهامك القديمة محفوظة؛ حدّد الشهر أعلاه ثم انقل المهمة إليه.</p>{unscheduled.map(task=><div className="task" key={task.id}><span className={isTaskDone(task)?'completed':''}>{task.title}</span><button type="button" className="soft-btn" onClick={()=>changeTask(scheduleMonthlyTask(task,monthKey))}>إلى الشهر المختار</button><button className="icon-btn danger" aria-label={`حذف ${task.title}`} onClick={()=>onTasks(tasks.filter(item=>item.id!==task.id))}><Trash2 size={17}/></button></div>)}</section>}
  </div>;
}

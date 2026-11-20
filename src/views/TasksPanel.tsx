import {useState} from 'react';
import {Clock,Check,Plus,Trash2,Info} from 'lucide-react';
import {type Period,type Task} from '../app-state';
import {isTaskDone,markTaskDone} from '../task-periods';
import {uid} from '../id';

type Props={period:Period;tasks:Task[];prayers:Record<string,string>;showPrayerTimes?:boolean;onPrayer?:(name:string,time:string)=>void;onTasks:(tasks:Task[])=>void};

const prayerNames=['الفجر','الظهر','العصر','المغرب','العشاء'];

// قائمة الأنشطة اليومية/الأسبوعية/الشهرية، مع مواقيت الصلاة اليدوية في وضع اليوم.
export default function TasksPanel({period,tasks,prayers,showPrayerTimes=false,onPrayer,onTasks}:Props) {
  const [taskText,setTaskText]=useState('');
  const addTask=()=>{if(!taskText.trim())return;onTasks([...tasks,{id:uid(),title:taskText.trim(),period,done:false,optional:true}]);setTaskText('')};
  return <><div className="page-intro"><span className="eyebrow">حياتي مع الله</span><h1>{period==='daily'?'يومي مع الله':period==='weekly'?'أسبوعي مع الله':'شهري مع الله'}</h1><p>نظّم ما ينفعك بما يناسب ظروفك، دون إلزام بما هو تطوع.</p></div>{showPrayerTimes&&<section className="panel"><div className="panel-head"><Clock size={20}/><h2>مواقيت الصلاة</h2></div><p className="muted small">أدخل المواقيت المحلية المعتمدة لديك يدويًا في هذه النسخة. لن نفترض أوقاتًا غير متحقق منها.</p><div className="prayer-grid">{prayerNames.map(n=><label key={n} className="prayer"><span>{n}</span><input type="time" aria-label={`وقت ${n}`} value={prayers[n]||''} onChange={e=>onPrayer?.(n,e.target.value)}/></label>)}</div></section>}<section className="panel"><div className="panel-head"><Check size={20}/><h2>الأنشطة التي اخترتها</h2></div><div className="task-list">{tasks.length===0&&<p className="muted">لم تُضف أنشطة بعد.</p>}{tasks.map(t=><div className="task" key={t.id}><label className="task-main"><input type="checkbox" checked={isTaskDone(t)} onChange={()=>onTasks(tasks.map(x=>x.id===t.id?markTaskDone(x,!isTaskDone(t)):x))}/><span className={isTaskDone(t)?'completed':''}>{t.title}</span></label><button className="icon-btn danger" aria-label={`حذف ${t.title}`} onClick={()=>onTasks(tasks.filter(x=>x.id!==t.id))}><Trash2 size={16}/></button></div>)}</div><form className="add-row" onSubmit={e=>{e.preventDefault();addTask()}}><input placeholder="أضف نشاطًا يناسبك..." value={taskText} onChange={e=>setTaskText(e.target.value)}/><button className="primary small-btn"><Plus size={17}/> إضافة</button></form></section><div className="hint"><Info size={17}/> عدم تسجيل الصلاة أو النشاط لا يعني أنه لم يُؤدَّ. هذه أداة تنظيم شخصية وليست حكمًا على العبادة.{period==='daily'&&' تبدأ قائمة اليوم دون تأشير في كل يوم جديد، وتحفظ سجلات الأيام السابقة كما هي.'}</div></>;
}

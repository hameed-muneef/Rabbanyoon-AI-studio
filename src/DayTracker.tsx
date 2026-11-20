import {useState} from 'react';
import {CalendarDays,Check,Clock,Moon} from 'lucide-react';
import {timeLabel} from './day-timing';
import {setPrayerStatus,setTrackedStatus,prayerNames,prayerStatusLabels,type DayRecords,type PrayerStatus} from './day-tracking';
import {hijriDate} from './hijri';
import DayReview from './DayReview';

type Props={records:DayRecords;date:string;today:string;onDate:(date:string)=>void;onRecords:(records:DayRecords)=>void;onPlan:()=>void};
export default function DayTracker({records,date,today,onDate,onRecords,onPlan}:Props) {
  const [hideDone,setHideDone]=useState(false);
  const record=records[date];
  const items=record?.items??[];
  const done=items.filter(item=>item.status==='done').length;
  const deferred=items.filter(item=>item.status==='deferred').length;
  const visible=items.filter(item=>!hideDone || item.status!=='done');
  const statuses=record?.prayers??{};
  const logPrayer=(name:string,current:PrayerStatus|undefined)=>{
    // نقرة على الحالة المسجلة تُلغيها وتعود إلى «غير معروف» دون حكم على الصلاة.
    onRecords(setPrayerStatus(records,date,name,current??null));
  };
  const prayerLog=<section className="prayer-log" aria-label="حالة الصلوات">
    <h3><Moon size={17}/> حالة الصلوات</h3>
    <p className="muted small">سجّل حالة كل صلاة لهذا اليوم إن شئت. ترك السجل يعني «غير معروف» ولا يدل على ترك الصلاة؛ والأعذار الشرعية محل اعتبار، وعدم التسجيل لا يُصنف تركًا.</p>
    <div className="prayer-log-grid">{prayerNames.map(name=>{
      const current=statuses[name];
      return <div className="prayer-log-row" key={name}><span>{name}</span><div className="prayer-log-options" role="group" aria-label={`حالة صلاة ${name}`}>{(Object.keys(prayerStatusLabels) as PrayerStatus[]).map(status=><button key={status} type="button" className={`prayer-chip${current===status?' selected':''}`} aria-pressed={current===status} onClick={()=>logPrayer(name,current===status?undefined:status)}>{prayerStatusLabels[status]}</button>)}</div></div>;
    })}</div>
  </section>;
  return <section className="day-tracker" aria-label="متابعة أعمال اليوم">
    <div className="tracking-header"><div><span className="eyebrow">{date===today?'متابعة اليوم':'سجل يوم سابق'}</span><h2><CalendarDays size={22}/>{new Intl.DateTimeFormat('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`))}</h2><span className="hijri-date">{hijriDate(date)}</span><p>اختر أي يوم سابق لمراجعة ما سُجّل فيه.</p></div><label>تاريخ المتابعة<input type="date" aria-label="تاريخ المتابعة" max={today} value={date} onChange={e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)&&e.target.value<=today)onDate(e.target.value)}}/></label></div>
    <div className="tracking-toolbar"><button className="soft-btn" onClick={onPlan}>{date===today?'تعديل خطة اليوم':'تخطيط اليوم الحالي'}</button></div>
    {prayerLog}
    {!record ? <div className="tracking-empty"><CalendarDays size={30}/><h3>{date===today?'خطة اليوم جاهزة للبدء؟':'لا توجد متابعة محفوظة لهذا التاريخ'}</h3><p>{date===today?'رتّب أعمالك في تخطيط يومي، ثم اضغط «ابدأ متابعة اليوم».':'تُحفظ قائمة مستقلة عندما تبدأ متابعة اليوم.'}</p>{date===today && <button className="primary" onClick={onPlan}>انتقل إلى تخطيط يومي</button>}</div> : <>
      <div className="tracking-progress"><div><strong>أنجزت {done.toLocaleString('ar-EG')} من {items.length.toLocaleString('ar-EG')} نشاطًا</strong><span>{deferred.toLocaleString('ar-EG')} مؤجل · {(items.length-done-deferred).toLocaleString('ar-EG')} متبقٍ</span></div><progress aria-label="تقدم أعمال اليوم" value={done} max={items.length||1}/><label><input type="checkbox" checked={hideDone} onChange={e=>setHideDone(e.target.checked)}/> إخفاء المكتمل</label></div>
      <ul className="tracking-list">{visible.map(item=><li key={item.id} className={`tracking-item tracking-${item.status}`}><label className="task-main"><input type="checkbox" aria-label={`تم: ${item.title}`} checked={item.status==='done'} onChange={e=>onRecords(setTrackedStatus(records,date,item.id,e.target.checked?'done':'pending'))}/><span><strong>{item.title}</strong><small>{item.period}</small></span></label><span className="tracking-status">{item.status==='done'?'مكتمل':item.status==='deferred'?'مؤجل':'لم يكتمل بعد'}</span><div className="tracking-item-footer"><span><Clock size={13}/>{item.start?`${timeLabel(item.start)} ${item.startDay} — ${timeLabel(item.end)} ${item.endDay}`:'دون موعد محدد'}{item.duration>0&&` · ${item.duration.toLocaleString('ar-EG')} دقيقة`}</span>{item.status!=='done' && <button className="icon-btn" aria-label={`${item.status==='deferred'?'إلغاء تأجيل':'تأجيل'} ${item.title}`} onClick={()=>onRecords(setTrackedStatus(records,date,item.id,item.status==='deferred'?'pending':'deferred'))}>{item.status==='deferred'?'إلغاء التأجيل':'تأجيل'}</button>}</div></li>)}</ul>
      {visible.length===0 && <p className="tracking-empty">{items.length===0?'لا توجد أعمال في هذه القائمة. أضف أعمالًا إلى خطتك ثم حدّث متابعة اليوم.':'أكملت جميع الأعمال المعروضة. يمكنك إظهار المكتمل لمراجعتها.'}</p>}
      <p className="hint"><Check size={16}/> هذا تتبّع لأعمالك المختارة، وليس تقييمًا للعبادة. «مؤجل» يسجل الحالة لهذا اليوم ولا ينقل العمل إلى تاريخ آخر.</p>
      <DayReview records={records} date={date} onRecords={onRecords}/>
    </>}
    <p className="muted small">السجل محفوظ في هذا المتصفح على هذا الجهاز. تعديل خطة اليوم لا يغيّر سجلات الأيام السابقة.</p>
  </section>;
}


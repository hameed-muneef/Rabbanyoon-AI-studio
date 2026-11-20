// منتقي الوقت المشترك: ساعة ١٢ + دقيقة + AM/PM، يُخزَّن داخليًا بصيغة 24 ساعة HH:MM.
const clockMinutes=(value:string)=>{const match=/^(\d{1,2}):(\d{2})$/.exec(value);if(!match)return 0;return Math.min(1439,Number(match[1])*60+Number(match[2]))};
const clockValue=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export function TaskTimeSelect({value,label,onChange}:{value:string;label:string;onChange:(value:string)=>void}){
  const selected=clockMinutes(value);
  const hour24=Math.floor(selected/60),minute=selected%60;
  const isPm=hour24>=12;
  const hour12=hour24%12===0?12:hour24%12;
  const hours=Array.from({length:12},(_,index)=>index+1);
  const minutes=Array.from({length:60},(_,index)=>index);
  const setTimeValue=(nextHour12:number,nextMinute:number,nextPm:boolean)=>onChange(clockValue(((nextHour12%12)+(nextPm?12:0))*60+nextMinute));
  return <span className="task-time-selects" dir="ltr" aria-label={label}>
    <select aria-label={`${label} - الساعة`} value={String(hour12).padStart(2,'0')} onChange={event=>setTimeValue(Number(event.target.value),minute,isPm)}>
      {hours.map(item=><option key={item} value={String(item).padStart(2,'0')}>{String(item).padStart(2,'0')}</option>)}
    </select><span aria-hidden="true">:</span>
    <select aria-label={`${label} - الدقيقة`} value={String(minute).padStart(2,'0')} onChange={event=>setTimeValue(hour12,Number(event.target.value),isPm)}>
      {minutes.map(item=><option key={item} value={String(item).padStart(2,'0')}>{String(item).padStart(2,'0')}</option>)}
    </select>
    <select className="task-time-period" aria-label={`${label} - الفترة`} value={isPm?'PM':'AM'} onChange={event=>setTimeValue(hour12,minute,event.target.value==='PM')}>
      <option value="AM">AM</option>
      <option value="PM">PM</option>
    </select>
  </span>;
}
/** عرض الوقت بصيغة 12 ساعة عربية (مثل 5:30 م) */
export const timeOfDayClock12=(time?:string)=>{if(!time)return '';const [h,m]=time.split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return '';const period=h<12?'ص':'م';return `${h%12===0?12:h%12}:${String(m).padStart(2,'0')} ${period}`};

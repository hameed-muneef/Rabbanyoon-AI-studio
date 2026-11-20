import {activitySchedule, type ActivityTiming} from './day-timing';

export type TrackStatus = 'pending' | 'done' | 'deferred';
export type TrackedActivity = {id:string; title:string; period:string; start:string; end:string; startDay:string; endDay:string; duration:number; status:TrackStatus};
export type DayReview = {gratitude:string; improvement:string; savedAt:string};
// حالة الصلاة المسجلة وفق وثيقة المنتج: في الوقت، متأخرة، عذر معتبر، لم تؤدَّ.
// ترك التسجيل يعني «غير معروف» ولا يدل على ترك الصلاة، ولا يصدر منها حكم على القلب.
export type PrayerStatus = 'ontime' | 'late' | 'excused' | 'missed';
export const prayerStatusLabels:Record<PrayerStatus,string>={ontime:'في الوقت',late:'متأخرة',excused:'عذر معتبر',missed:'لم تُؤدَّ'};
export const prayerNames=['الفجر','الظهر','العصر','المغرب','العشاء'];
export type DayRecord = {date:string; savedAt:string; items:TrackedActivity[]; openingMessage?:string; resolveMessage?:string; review?:DayReview; prayers?:Record<string,PrayerStatus>};
export type DayRecords = Record<string,DayRecord>;
export function localDateKey(now=new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function createDayRecord(date:string,slots:{id:string;title:string;prayer?:boolean}[],plan:{activities:Record<string,{id:string;title:string;duration?:number;timing?:ActivityTiming}[]>;completed:Record<string,string>},anchors:Record<string,string>,extras:{id:string;title:string}[],previous?:DayRecord):DayRecord {
  const old=new Map(previous?.date===date ? previous.items.map(item=>[item.id,item.status]) : []);
  const items:TrackedActivity[]=slots.filter(slot=>!slot.prayer).flatMap(slot=>{
    const activities=plan.activities[slot.id]??[];
    const times=activitySchedule(slot.id,activities,anchors);
    return activities.map((item,index)=>{
      const {start,end,duration}=times[index];
      const id=`${slot.id}:${item.id}`;
      return {id,title:item.title,period:slot.title,start:start.time,end:end.time,startDay:start.dayNote,endDay:end.dayNote,duration,status:old.get(id)??(plan.completed[item.id]===date?'done':'pending')};
    });
  });
  items.push(...extras.map(item=>({id:`extra:${item.id}`,title:item.title,period:'أعمال إضافية وخطوات أهدافي',start:'',end:'',startDay:'',endDay:'',duration:0,status:old.get(`extra:${item.id}`)??'pending' as TrackStatus})));
  const sortTime=(item:TrackedActivity)=>{
    if(!item.start)return Infinity;
    const [h,m]=item.start.split(':').map(Number);
    return h*60+m+(item.startDay==='اليوم التالي'?1440:item.startDay==='اليوم السابق'?-1440:0);
  };
  items.sort((a,b)=>sortTime(a)-sortTime(b));
  const sameDay=previous?.date===date;
  return {date,savedAt:new Date().toISOString(),items,openingMessage:sameDay?previous?.openingMessage:undefined,resolveMessage:sameDay?previous?.resolveMessage:undefined,review:sameDay?previous?.review:undefined,prayers:sameDay?previous?.prayers:undefined};
}
export function setTrackedStatus(records:DayRecords,date:string,id:string,status:TrackStatus):DayRecords {
  const record=records[date];
  if(!record)return records;
  return {...records,[date]:{...record,items:record.items.map(item=>item.id===id?{...item,status}:item)}};
}
// تسجيل حالة صلاة في يوم معين، وينشأ سجل مستقل إن لم يوجد بعد حتى يمكن التسجيل دون متابعة أعمال.
// تمرير null يُلغي التسجيل وتعود الصلاة إلى «غير معروف».
export function setPrayerStatus(records:DayRecords,date:string,name:string,status:PrayerStatus|null):DayRecords {
  const record=records[date]??{date,savedAt:new Date().toISOString(),items:[]};
  const prayers={...(record.prayers??{})};
  if(status===null||prayers[name]===status)delete prayers[name];else prayers[name]=status;
  return {...records,[date]:{...record,prayers}};
}

export type ActivityTiming = {anchor:string; offset:number};
export const activityDuration = (duration?:number) => Number.isInteger(duration) && duration! > 0 && duration! <= 720 ? duration! : 30;
export function activitySchedule(slot:string,items:{duration?:number;timing?:ActivityTiming}[],anchors:Record<string,string>) {
  let elapsed=0;
  return items.map(item=>{
    const duration=activityDuration(item.duration);
    const base=item.timing??defaultActivityTiming(slot,0);
    const start=resolveActivityTime({...base,offset:base.offset+(item.timing?0:elapsed)},anchors);
    const end=resolveActivityTime({...base,offset:base.offset+(item.timing?duration:elapsed+duration)},anchors);
    if(!item.timing)elapsed+=duration;
    return {start,end,duration};
  });
}
export const timingAnchors = ['الفجر','الشروق','الظهر','العصر','المغرب','العشاء','بداية العمل','موعد النوم'];
export function offsetTime(time: string | undefined, offset: number) {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isFinite(offset)) return '';
  const [h,m]=time.split(':').map(Number);
  const minutes=((h*60+m+offset)%1440+1440)%1440;
  return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
export const timeLabel = (time?: string) => time && offsetTime(time,0) ? new Intl.DateTimeFormat('ar-EG',{hour:'numeric',minute:'2-digit'}).format(new Date(`2000-01-01T${time}:00`)) : '';
export function defaultActivityTiming(slot:string,index:number):ActivityTiming {
  if(slot==='before-fajr-30')return {anchor:'الفجر',offset:-30};
  if(/^after-(fajr|dhuhr|asr|maghrib|isha)-\d+$/.test(slot))return {anchor:slot,offset:0};
  const match=/^time-(\d{2})-(\d{2})$/.exec(slot);
  if(match)return {anchor:slot,offset:index*30};
  const defaults:Record<string,ActivityTiming>={before:{anchor:'الفجر',offset:-30},morning:{anchor:'الفجر',offset:20},sunrise:{anchor:'الشروق',offset:0},work:{anchor:'بداية العمل',offset:0},afternoon:{anchor:'الظهر',offset:20},evening:{anchor:'العصر',offset:20},sunset:{anchor:'المغرب',offset:20},night:{anchor:'العشاء',offset:20}};
  const base=defaults[slot] ?? {anchor:'الفجر',offset:0};
  return {...base,offset:base.offset+index*30};
}
export function resolveActivityTime(timing:ActivityTiming,anchors:Record<string,string>) {
  const base=anchors[timing.anchor];
  const time=offsetTime(base,timing.offset);
  if(!time) return {time:'',dayNote:''};
  const [h,m]=base.split(':').map(Number);
  const total=h*60+m+timing.offset;
  return {time,dayNote:total<0?'اليوم السابق':total>=1440?'اليوم التالي':''};
}
/** تحويل معرّف الفترة المخزنة قديمًا (مثل after-fajr-300 أو time-05-30) إلى وقت HH:MM وفق مواقيت اليوم */
export function slotClockTime(slotId:string|undefined,prayers:Record<string,string>):string {
  if(!slotId)return '';
  const legacy=/^time-(\d{2})-(\d{2})$/.exec(slotId);
  if(legacy)return `${legacy[1]}:${legacy[2]}`;
  if(slotId==='before-fajr-30'||slotId.startsWith('before-fajr'))return offsetTime(prayers['الفجر'],-30);
  const match=/^after-(fajr|dhuhr|asr|maghrib|isha)-(\d+)$/.exec(slotId);
  if(!match)return '';
  const anchors:Record<string,string>={fajr:'الفجر',dhuhr:'الظهر',asr:'العصر',maghrib:'المغرب',isha:'العشاء'};
  return offsetTime(prayers[anchors[match[1]]],30+Number(match[2]));
}

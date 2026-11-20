import {type DayPlan} from './DayPlanner';
import {type DayRecords} from './day-tracking';
import {type Goal} from './goal-plan';
import {type PrayerLocation} from './prayer-location';
import {createQuranState} from './quran/learning';
import type {QuranLearningState} from './quran/types';

// أنواع الحالة المشتركة ومساعداتها، لاستخدامها في App والواجهات المستخرجة
export type View='home'|'day'|'tasks'|'week'|'month'|'goals'|'quran'|'haramain'|'reflect'|'wird'|'profile'|'settings'|'payment'|'paymentHistory'|'qibla';
export type Period='daily'|'weekly'|'monthly';
// doneKey: مفتاح الفترة التي تأشر فيها المهمة («يومي مع الله» جديد يوميًا، والأسبوعي والشهري مرتبطان بفترتهما)؛ راجع task-periods.ts
export type Task={id:string;title:string;period:Period;done:boolean;optional:boolean;weekStart?:string;monthKey?:string;scheduledDate?:string;doneKey?:string;sourceLabel?:string;source?:{groupId:string;revision:number;position:number}};
export type TaskSchedule={initialDate?:string;initialSlot?:string;initialTime?:string;confirmedDate?:string;confirmedSlot?:string;confirmedTime?:string;title:string;sourceLabel:string};
export type Wird={id:string;title:string;target:number;count:number;period:Period;periodKey:string};
export type State={dayPlan?:DayPlan;dayRecords?:DayRecords;taskSchedules?:Record<string,TaskSchedule>;tasks:Task[];goals:Goal[];wirds:Wird[];reflections:{id:string;date:string;text:string}[];lessonStep:number;prayers:Record<string,string>;prayerLocation?:PrayerLocation;quran:QuranLearningState};

export const today=()=>new Date().toLocaleDateString('en-CA');
export const periodKey=(p:Period)=>{const d=new Date();if(p==='daily')return today();if(p==='monthly')return `${d.getFullYear()}-${d.getMonth()+1}`;const start=new Date(d.getFullYear(),0,1);return `${d.getFullYear()}-W${Math.ceil((((d.getTime()-start.getTime())/86400000)+start.getDay()+1)/7)}`};

export function createSeed():State{
  return {tasks:[
    {id:'d1',title:'قراءة ما تيسر من القرآن',period:'daily',done:false,optional:true},
    {id:'d2',title:'أذكار الصباح',period:'daily',done:false,optional:true},
    {id:'d3',title:'وقت للأسرة',period:'daily',done:false,optional:true},
    {id:'w1',title:'صلة رحم أو زيارة قريب',period:'weekly',done:false,optional:true},
    {id:'m1',title:'مراجعة أهداف الشهر',period:'monthly',done:false,optional:true},
  ],goals:[],wirds:[
    {id:'z1',title:'الاستغفار',target:100,count:0,period:'daily',periodKey:periodKey('daily')},
    {id:'z2',title:'الصلاة على النبي ﷺ',target:100,count:0,period:'weekly',periodKey:periodKey('weekly')},
  ],reflections:[],lessonStep:0,prayers:{},quran:createQuranState()};
}

export function load(storageKey='rabbani-v1'):State{return loadFromRaw(localStorage.getItem(storageKey))}

export function loadFromRaw(raw:string|null):State{
  try{
    if(raw){
      const x=JSON.parse(raw) as State;
      return {...createSeed(),...x,quran:{...createQuranState(),...(x.quran??{})},wirds:(x.wirds||[]).map(w=>w.periodKey===periodKey(w.period)?w:{...w,count:0,periodKey:periodKey(w.period)})};
    }
  }catch{/* تجاهل: بيانات تالفة تعني البدء من الصفر */}
  return createSeed();
}

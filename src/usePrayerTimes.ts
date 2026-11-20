import {useEffect, useState} from 'react';
import {prayerLocationKey,prayerTimingsQuery,type PrayerLocation} from './prayer-location';

export function prayerDate(now = new Date()) {
  return `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
}

export function parsePrayerTimes(data: unknown): Record<string,string> {
  const names = {Fajr:'الفجر',Sunrise:'الشروق',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};
  const timings = data as Record<string,unknown> | undefined;
  return Object.fromEntries(Object.entries(names).map(([key,name])=>{
    const value = timings?.[key];
    if(typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid prayer times');
    return [name,value];
  }));
}

const CACHE_KEY='rabbani-prayer-times-v1';
type PrayerTimesCache={date:string;zone:string;times:Record<string,string>};
function loadPrayerTimesCache(context:{date:string;zone:string}):PrayerTimesCache|null{
  try{
    const raw=localStorage.getItem(CACHE_KEY);
    if(!raw)return null;
    const entry=JSON.parse(raw) as PrayerTimesCache;
    if(!entry||entry.date!==context.date||entry.zone!==context.zone||!entry.times||typeof entry.times!=='object')return null;
    return entry;
  }catch{return null}
}

export default function usePrayerTimes(enabled: boolean, saved?: PrayerLocation) {
  const [context,setContext] = useState(()=>({date:prayerDate(),zone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
  const [attempt,setAttempt] = useState(0);
  const [prayers,setPrayers] = useState<Record<string,string>>({});
  const [status,setStatus] = useState('');
  const [loading,setLoading] = useState(false);
  useEffect(()=>{
    const check = ()=>setContext(old=>{
      const date=prayerDate(), zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      return old.date===date && old.zone===zone ? old : {date,zone};
    });
    const timer=window.setInterval(check,30000);
    window.addEventListener('focus',check);
    const onVis=()=>{if(document.visibilityState==='visible')check()};
    document.addEventListener('visibilitychange',onVis);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',onVis)};
  },[]);
  const savedKey=saved?prayerLocationKey(saved):'';
  useEffect(()=>{
    if(!enabled) return;
    let active=true;
    const controller=new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if(!attempt){
      const cached=loadPrayerTimesCache({date:context.date,zone:saved?savedKey:context.zone});
      if(cached){
        setPrayers(cached.times);
        setStatus(saved?`مواقيت ${saved.name} محفوظة محليًا · ${context.date}`:`مواقيت اليوم محفوظة محليًا · ${context.date} · توقيت الجهاز: ${context.zone}`);
        setLoading(false);
        return ()=>{active=false};
      }
    }
    const computeOfflineFallback=async(loc:PrayerLocation):Promise<boolean>=>{
      try{
        const {computeDayPrayerStrings,mapAlAdhanMadhab,mapAlAdhanMethod}=await import('./lib/prayer-schedule');
        const times=computeDayPrayerStrings(
          {latitude:loc.latitude,longitude:loc.longitude},
          new Date(),
          mapAlAdhanMethod(loc.method),
          mapAlAdhanMadhab(loc.school),
          loc.timezone,
        );
        if(Object.keys(times).length>=5){
          if(active){
            setPrayers(times);
            try{localStorage.setItem(CACHE_KEY,JSON.stringify({date:context.date,zone:savedKey,times}))}catch{}
            setStatus(`مواقيت ${loc.name} (محسوبة محليًا بدون إنترنت) · ${context.date}`);
            setLoading(false);
          }
          return true;
        }
      }catch{}
      return false;
    };
    if(saved && typeof navigator!=='undefined' && navigator.onLine===false){
      setLoading(true);
      void computeOfflineFallback(saved).then(ok=>{
        if(!ok) fail('تعذر جلب المواقيت. تحقق من الاتصال ثم أعد المحاولة، أو أدخلها يدويًا.');
      });
      return ()=>{active=false};
    }
    setPrayers({});
    setLoading(true);
    const fail=(message:string)=>{if(active){setStatus(message);setLoading(false)}};
    const fetchTimes=async(coords:{latitude:number;longitude:number},zone:string,options:{method?:number;school?:number},cacheZone:string,label:string)=>{
      setStatus(saved?`جارٍ جلب مواقيت ${saved.name}…`:'جارٍ جلب مواقيت اليوم حسب موقعك…');
      timeout=setTimeout(()=>controller.abort(),15000);
      try {
        const query=prayerTimingsQuery(coords,zone,options);
        const response=await fetch(`https://api.aladhan.com/v1/timings/${context.date}?${query}`,{signal:controller.signal});
        if(!response.ok) throw new Error('Request failed');
        const body=await response.json();
        if(body.code!==200 || body.data?.date?.gregorian?.date!==context.date) throw new Error('Invalid date');
        const times=parsePrayerTimes(body.data?.timings);
        if(active){setPrayers(times);try{localStorage.setItem(CACHE_KEY,JSON.stringify({date:context.date,zone:cacheZone,times}))}catch{}setStatus(label);setLoading(false)}
      } catch {
        if(!saved || !(await computeOfflineFallback(saved))){
          fail('تعذر جلب المواقيت. تحقق من الاتصال ثم أعد المحاولة، أو أدخلها يدويًا.');
        }
      }
      finally {clearTimeout(timeout)}
    };
    if(saved){
      void fetchTimes(saved,saved.timezone,{method:saved.method,school:saved.school},savedKey,`مواقيت ${saved.name}${saved.country?`، ${saved.country}`:''} · ${context.date}`);
    } else {
      setStatus('جارٍ تحديد موقعك من الجهاز أو المتصفح…');
      const advice='ابحث عن مدينتك أدناه أو أدخل المواقيت يدويًا.';
      if(!navigator.geolocation || !window.isSecureContext){
        fail(`تحديد الموقع غير متاح. ${advice}`);
      } else navigator.geolocation.getCurrentPosition(position=>{
        if(!active) return;
        void fetchTimes(position.coords,context.zone,{},context.zone,`مواقيت اليوم حسب موقعك · ${context.date} · توقيت الجهاز: ${context.zone}`);
      },error=>fail(error.code===1?`لم يُسمح بالوصول للموقع. ${advice}`:`تعذر تحديد موقعك. ${advice}`),{timeout:10000,maximumAge:0,enableHighAccuracy:false});
    }
    return ()=>{active=false;controller.abort();clearTimeout(timeout)};
  },[enabled,context,attempt,savedKey]);
  return {prayers,status,loading,refresh:()=>setAttempt(value=>value+1)};
}

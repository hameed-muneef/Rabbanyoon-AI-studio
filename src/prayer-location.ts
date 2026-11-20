export type PrayerLocation={name:string;country:string;latitude:number;longitude:number;timezone:string;method?:number;school?:0|1};

// أرقام طرق الحساب في AlAdhan؛ غياب القيمة يترك للخدمة اختيار الطريقة الأنسب للموقع.
export const prayerMethods:{value:number;label:string}[]=[
  {value:4,label:'أم القرى (مكة المكرمة)'},
  {value:5,label:'الهيئة المصرية العامة للمساحة'},
  {value:3,label:'رابطة العالم الإسلامي'},
  {value:2,label:'الجمعية الإسلامية لأمريكا الشمالية'},
  {value:1,label:'جامعة العلوم الإسلامية بكراتشي'},
  {value:8,label:'منطقة الخليج'},
  {value:9,label:'الكويت'},
  {value:10,label:'قطر'}
];

const validZone=(zone:string)=>{try{new Intl.DateTimeFormat('en',{timeZone:zone});return true}catch{return false}};

export function parseGeocodingResults(body:unknown):PrayerLocation[]{
  const results=(body as {results?:unknown})?.results;
  if(!Array.isArray(results))return [];
  return results.flatMap(item=>{
    const value=item as Record<string,unknown>;
    const {name,country,latitude,longitude,timezone}=value;
    if(typeof name!=='string'||!name.trim()||typeof latitude!=='number'||typeof longitude!=='number'
      ||typeof timezone!=='string'||!validZone(timezone))return [];
    if(latitude<-90||latitude>90||longitude<-180||longitude>180)return [];
    return [{name:name.trim().slice(0,80),country:typeof country==='string'?country.trim().slice(0,80):'',latitude,longitude,timezone}];
  });
}

// يحمي من بيانات تالفة قادمة من التخزين المحلي أو السحابي قبل استخدامها في الطلب.
export function sanitizePrayerLocation(value:unknown):PrayerLocation|undefined{
  const item=value as Partial<PrayerLocation>|null|undefined;
  if(!item||typeof item.name!=='string'||typeof item.latitude!=='number'||typeof item.longitude!=='number'
    ||typeof item.timezone!=='string'||!validZone(item.timezone))return undefined;
  if(item.latitude<-90||item.latitude>90||item.longitude<-180||item.longitude>180)return undefined;
  const method=typeof item.method==='number'&&Number.isInteger(item.method)&&item.method>=0&&item.method<=23?item.method:undefined;
  return {name:item.name.slice(0,80),country:typeof item.country==='string'?item.country.slice(0,80):'',
    latitude:item.latitude,longitude:item.longitude,timezone:item.timezone,method,school:item.school===1?1:item.school===0?0:undefined};
}

export function prayerLocationKey(location:PrayerLocation){
  return `city:${location.latitude.toFixed(3)},${location.longitude.toFixed(3)},${location.timezone},${location.method??'auto'},${location.school??0}`;
}

export function prayerTimingsQuery(location:{latitude:number;longitude:number},zone:string,options:{method?:number;school?:number}={}){
  const query=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),timezonestring:zone});
  if(options.method!==undefined)query.set('method',String(options.method));
  if(options.school!==undefined)query.set('school',String(options.school));
  return query;
}

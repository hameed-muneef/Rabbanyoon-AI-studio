import {authClient} from './auth';
export {countries} from './country-data';

// ملف المستخدم الشخصي وإعدادات الحساب. يُخزَّن في public.user_preferences
// المملوك للمستخدم وحده، فبيانات الاسم والبلد لا يراها أحد آخر.
export type Profile={
  first_name:string;
  last_name:string;
  country:string;
  gender:''|'male'|'female';
  timezone:string;
  locale:string;
  city:string|null;
  work_start:string|null;
  sleep_time:string|null;
  prayer_settings:Record<string,unknown>;
  notification_preferences:Record<string,unknown>;
};

export const emptyProfile:Profile={
  first_name:'',last_name:'',country:'',gender:'',
  timezone:'Africa/Cairo',locale:'ar',city:null,work_start:null,sleep_time:null,
  prayer_settings:{},notification_preferences:{},
};

export const displayName=(profile:Profile|null,email?:string|null):string=>{
  const first=profile?.first_name?.trim();
  const last=profile?.last_name?.trim();
  if(first&&last)return `${first} ${last}`;
  if(first)return first;
  if(last)return last;
  const mail=email?.trim();
  return mail?mail.split('@')[0]:'مستخدم';
};

export async function fetchProfile(userId:string):Promise<Profile|null>{
  if(!authClient)return null;
  const {data,error}=await authClient.from('user_preferences').select('*').eq('user_id',userId).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  return {
    first_name:data.first_name??'',
    last_name:data.last_name??'',
    country:data.country??'',
    gender:(data.gender??'') as Profile['gender'],
    timezone:data.timezone??'Africa/Cairo',
    locale:data.locale??'ar',
    city:data.city??null,
    work_start:data.work_start??null,
    sleep_time:data.sleep_time??null,
    prayer_settings:(data.prayer_settings??{}) as Record<string,unknown>,
    notification_preferences:(data.notification_preferences??{}) as Record<string,unknown>,
  };
}

export async function saveProfile(input:{firstName:string;lastName:string;country:string;gender:string}):Promise<void>{
  if(!authClient)throw new Error('خدمة الحسابات غير مفعّلة.');
  const {error}=await authClient.rpc('save_user_profile',{
    p_first_name:input.firstName.trim(),
    p_last_name:input.lastName.trim(),
    p_country:input.country.trim(),
    p_gender:input.gender,
  });
  if(error)throw error;
}

export async function saveSettings(input:{timezone?:string;locale?:string;city?:string;workStart?:string|null;sleepTime?:string|null;prayerSettings?:Record<string,unknown>;notificationPreferences?:Record<string,unknown>}):Promise<void>{
  if(!authClient)throw new Error('خدمة الحسابات غير مفعّلة.');
  const {error}=await authClient.rpc('update_user_settings',{
    p_timezone:input.timezone??null,
    p_locale:input.locale??null,
    p_city:input.city??null,
    p_work_start:input.workStart??null,
    p_sleep_time:input.sleepTime??null,
    p_prayer_settings:input.prayerSettings??null,
    p_notification_preferences:input.notificationPreferences??null,
  });
  if(error)throw error;
}

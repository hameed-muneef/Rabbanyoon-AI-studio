import {useEffect,useState,type FormEvent} from 'react';
import {Globe,Lock,LogOut,Mail,Save,ShieldCheck,Trash2,UserRound} from 'lucide-react';
import {authClient} from '../auth';
import CountrySelector from '../CountrySelector';
import {displayName,emptyProfile,fetchProfile,saveProfile,saveSettings,type Profile} from '../user-profile';
import '../profile.css';

type Props={user:{id:string;email?:string}|null;notify:(message:string)=>void;onProfileSaved?:()=>void};

// حساب المستخدم: الملف الشخصي والإعدادات المهمة (المنطقة الزمنية، اللغة، المدينة،
// مواعيد العمل والنوم، تفضيلات الإشعارات، أوقات الصلاة) مع حذف الحساب.
export default function ProfileView({user,notify,onProfileSaved}:Props){
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [draft,setDraft]=useState({firstName:'',lastName:'',country:'',gender:''});
  const [settings,setSettings]=useState({timezone:'Africa/Cairo',locale:'ar',city:'',workStart:'',sleepTime:'',notifications:true,prayerTimes:{} as Record<string,string>});
  const [confirmDelete,setConfirmDelete]=useState(false);

  const load=async()=>{
    if(!user||!authClient){setLoading(false);return}
    setLoading(true);setError('');
    try{
      const loaded=await fetchProfile(user.id);
      setProfile(loaded);
      const base=loaded??emptyProfile;
      setDraft({
        firstName:base.first_name,
        lastName:base.last_name,
        country:base.country,
        gender:base.gender,
      });
      setSettings(current=>({
        ...current,
        timezone:base.timezone,
        locale:base.locale,
        city:base.city??'',
        workStart:base.work_start?.slice(0,5)??'',
        sleepTime:base.sleep_time?.slice(0,5)??'',
        notifications:base.notification_preferences.enabled!==false,
        prayerTimes:(base.prayer_settings.times&&typeof base.prayer_settings.times==='object'?base.prayer_settings.times:{}) as Record<string,string>,
      }));
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر تحميل بيانات الحساب.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[user?.id]);

  const saveIdentity=async(event:FormEvent)=>{
    event.preventDefault();if(!user||busy)return;
    if(!draft.country){setError('اختر بلدك من قائمة البلدان.');return}
    setBusy(true);setError('');
    try{
      await saveProfile({firstName:draft.firstName,lastName:draft.lastName,country:draft.country,gender:draft.gender});
      await load();
      notify('حُفظ ملفك الشخصي.');
      onProfileSaved?.();
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ الملف الشخصي.')}
    finally{setBusy(false)}
  };
  const savePreferences=async(event:FormEvent)=>{
    event.preventDefault();if(!user||busy)return;
    setBusy(true);setError('');
    try{
      await saveSettings({
        timezone:settings.timezone,
        locale:settings.locale,
        city:settings.city,
        workStart:settings.workStart||null,
        sleepTime:settings.sleepTime||null,
        prayerSettings:{times:settings.prayerTimes},
        notificationPreferences:{enabled:settings.notifications},
      });
      await load();
      notify('حُفظت إعدادات الحساب.');
      onProfileSaved?.();
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ الإعدادات.')}
    finally{setBusy(false)}
  };
  const deleteAccount=async()=>{
    if(!user||!authClient||busy)return;
    setBusy(true);setError('');
    try{
      const {error:deleteError}=await authClient.rpc('delete_user_account');
      if(deleteError)throw deleteError;
      notify('حُذف حسابك. نأسف لفراقك.');
      await authClient.auth.signOut();
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حذف الحساب.')}
    finally{setBusy(false)}
  };
  const signOut=async()=>{await authClient?.auth.signOut()};

  if(!user)return <section className="panel"><h2>تسجيل الدخول مطلوب</h2><p>سجّل الدخول لعرض ملفك الشخصي وإعداداتك.</p></section>;
  if(loading)return <p role="status">جارٍ تحميل حسابك…</p>;
  const name=displayName(profile,user.email);
  return <div className="profile-view">
    <div className="page-intro"><span className="eyebrow">حسابي</span><h1>{name}</h1><p>ملفك الشخصي وإعدادات حسابك. هذه البيانات لك وحدك.</p></div>
    {error&&<p className="muted" role="alert">{error}</p>}

    <section className="panel" aria-labelledby="identity-title">
      <div className="panel-head"><UserRound size={20}/><h2 id="identity-title">الملف الشخصي</h2></div>
      <form onSubmit={event=>void saveIdentity(event)}>
        <div className="form-grid">
          <label>الاسم الأول<input required maxLength={60} value={draft.firstName} onChange={event=>setDraft(current=>({...current,firstName:event.target.value}))}/></label>
          <label>الاسم الأخير<input required maxLength={60} value={draft.lastName} onChange={event=>setDraft(current=>({...current,lastName:event.target.value}))}/></label>
          <label>البلد<CountrySelector id="profile-country" value={draft.country} onChange={country=>setDraft(current=>({...current,country}))} required/></label>
        </div>
        <p className="muted small">البريد الإلكتروني: <bdi dir="ltr">{user.email}</bdi> — هذه البيانات لك وحدك.</p>
        <button className="primary" type="submit" disabled={busy}><Save size={17}/> {busy?'جارٍ الحفظ…':'حفظ الملف الشخصي'}</button>
      </form>
    </section>

    <section className="panel" aria-labelledby="settings-title">
      <div className="panel-head"><Globe size={20}/><h2 id="settings-title">الإعدادات المهمة</h2></div>
      <form onSubmit={event=>void savePreferences(event)}>
        <div className="form-grid">
          <label>المنطقة الزمنية<input value={settings.timezone} onChange={event=>setSettings(current=>({...current,timezone:event.target.value}))} placeholder="Africa/Cairo"/></label>
          <label>اللغة<select value={settings.locale} onChange={event=>setSettings(current=>({...current,locale:event.target.value}))}><option value="ar">العربية</option><option value="en">English</option></select></label>
          <label>المدينة<input maxLength={120} value={settings.city} onChange={event=>setSettings(current=>({...current,city:event.target.value}))} placeholder="مثال: القاهرة"/></label>
          <label>بداية يوم العمل<input type="time" value={settings.workStart} onChange={event=>setSettings(current=>({...current,workStart:event.target.value}))}/></label>
          <label>وقت النوم<input type="time" value={settings.sleepTime} onChange={event=>setSettings(current=>({...current,sleepTime:event.target.value}))}/></label>
        </div>
        <fieldset className="profile-switches">
          <legend>الإشعارات</legend>
          <label className="profile-switch"><input type="checkbox" checked={settings.notifications} onChange={event=>setSettings(current=>({...current,notifications:event.target.checked}))}/><span>تفعيل الإشعارات داخل المنصة</span></label>
        </fieldset>
        <fieldset className="profile-switches"><legend>أوقات الصلاة اليدوية (اختياري)</legend><p className="muted small">تُحفظ في حسابك وتُستخدم عند إيقاف تحديد المواقيت تلقائيًا في مخطط اليوم.</p><div className="form-grid">{['الفجر','الشروق','الظهر','العصر','المغرب','العشاء'].map(name=><label key={name}>وقت {name}<input type="time" dir="ltr" value={settings.prayerTimes[name]??''} onChange={event=>setSettings(current=>({...current,prayerTimes:{...current.prayerTimes,[name]:event.target.value}}))}/></label>)}</div></fieldset>
        <button className="primary" type="submit" disabled={busy}><Save size={17}/> {busy?'جارٍ الحفظ…':'حفظ الإعدادات'}</button>
      </form>
    </section>

    <section className="panel" aria-labelledby="account-title">
      <div className="panel-head"><ShieldCheck size={20}/><h2 id="account-title">الحساب والأمان</h2></div>
      <p className="muted small">الحساب في المنصة مجاني ولا يشمل أي اشتراك مدفوع. بياناتك في الجداول ملكك وحدك، ويطّلع عليها الإداري عند مراجعة بلاغ متعلق بك فقط.</p>
      <div className="course-actions">
        <button className="soft-btn" onClick={()=>void signOut()}><LogOut size={17}/> تسجيل الخروج</button>
        <button className="soft-btn" onClick={()=>setConfirmDelete(!confirmDelete)}><Trash2 size={17}/> حذف الحساب</button>
      </div>
      {confirmDelete&&<div className="muted" role="alert">
        <p>حذف الحساب يزيل بياناتك من المنصة ولا يمكن التراجع. هل تريد المتابعة؟</p>
        <div className="course-actions"><button className="soft-btn" disabled={busy} onClick={()=>void deleteAccount()}>تأكيد الحذف</button><button className="soft-btn" onClick={()=>setConfirmDelete(false)}>تراجع</button></div>
      </div>}
    </section>

    <section className="panel" aria-labelledby="privacy-title">
      <div className="panel-head"><Lock size={20}/><h2 id="privacy-title">خصوصيتك</h2></div>
      <ul className="circle-meta">
        <li>اسمك وبلدك لا يظهران لغيرك، ولا يُشاركان مع أي جهة.</li>
        <li>محاسبة نفسك («حاسب نفسك») لا تُعرض على أحد، ولا تدخل في أي إجمالي.</li>
      </ul>
      <p className="muted small"><Mail size={14}/> للاستفسار عن بياناتك: <bdi dir="ltr">{user.email}</bdi></p>
    </section>
  </div>;
}

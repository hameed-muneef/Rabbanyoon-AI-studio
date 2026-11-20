import {useEffect,useRef,useState,type FormEvent} from 'react';
import {authClient} from '../auth';

type Feature={key:string;title:string;description:string;enabled:boolean;requires_premium:boolean;price_amount:number|null;currency_code:string|null;billing_interval:string|null};
type FeatureEvent={id:string;feature_key:string;before_state:Record<string,unknown>|null;after_state:Record<string,unknown>;changed_by_email:string|null;changed_at:string};
type PermissionEvent={id:string;feature_key:string;feature_title:string;allowed:boolean|null;changed_by_email:string|null;changed_at:string};
type PermissionStatus={
  feature_key:string;feature_title:string;override_allowed:boolean|null;effective_allowed:boolean;
  access_source:'feature_disabled'|'admin_grant'|'admin_revoke'|'free_default'|'subscription'|'premium_required';
  latest_allowed:boolean|null;latest_changed_by_email:string|null;latest_changed_at:string|null;
};
const message=(error:unknown)=>error instanceof Error?error.message:'تعذّر تنفيذ العملية.';
const intervalName=(value:string|null)=>value==='monthly'?'شهريًا':value==='yearly'?'سنويًا':'';
const formatPrice=(feature:Feature)=>feature.price_amount===null||!feature.currency_code?'السعر غير محدد':`${new Intl.NumberFormat('ar-EG',{style:'currency',currency:feature.currency_code,maximumFractionDigits:3}).format(feature.price_amount)} ${intervalName(feature.billing_interval)}`;
const formatDate=(value:string)=>new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const permissionSource=(status:PermissionStatus)=>status.access_source==='feature_disabled'?'الميزة معطلة على مستوى المنصة':status.access_source==='admin_grant'?'السبب: منح إداري صريح':status.access_source==='admin_revoke'?'السبب: سحب إداري صريح':status.access_source==='free_default'?'السبب: الميزة مجانية حسب القاعدة العامة':status.access_source==='subscription'?'السبب: اشتراك فعّال لهذه الميزة':'السبب: لا يوجد منح إداري أو اشتراك مدفوع فعّال';
const permissionOverrideLabel=(allowed:boolean|null)=>allowed===true?'القرار الإداري الحالي: ممنوحة صراحةً':allowed===false?'القرار الإداري الحالي: مسحوبة صراحةً':'لا يوجد قرار إداري صريح؛ تُطبق القاعدة العامة أو الاشتراك';
const permissionEventLabel=(allowed:boolean|null)=>allowed===true?'منح إداري':allowed===false?'سحب إداري':'إعادة إلى القاعدة العامة';

export default function PlatformFeaturesPanel(){
  const editorRef=useRef<HTMLFormElement>(null);
  const [features,setFeatures]=useState<Feature[]>([]);
  const [form,setForm]=useState<Feature>({key:'',title:'',description:'',enabled:true,requires_premium:false,price_amount:null,currency_code:null,billing_interval:null});
  const [email,setEmail]=useState('');
  const [selectedKey,setSelectedKey]=useState('learning_journey');
  const [permissionStatuses,setPermissionStatuses]=useState<PermissionStatus[]>([]);
  const [featureEvents,setFeatureEvents]=useState<FeatureEvent[]>([]);
  const [permissionEvents,setPermissionEvents]=useState<PermissionEvent[]>([]);
  const [inspected,setInspected]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=async()=>{
    if(!authClient)return;
    setLoading(true);setError('');
    try{
      const [featureResult,eventResult]=await Promise.all([
        authClient.from('platform_features').select('key,title,description,enabled,requires_premium,price_amount,currency_code,billing_interval').order('key'),
        authClient.rpc('list_admin_platform_feature_events' as any,{p_limit:30}),
      ]);
      if(featureResult.error)throw featureResult.error;
      if(eventResult.error)throw eventResult.error;
      setFeatures(((featureResult.data??[]) as Feature[]));
      setFeatureEvents((eventResult.data??[]) as FeatureEvent[]);
    }catch(caught){setError(message(caught))}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);
  const editFeature=(feature:Feature)=>{
    setForm(feature);setError('');
    requestAnimationFrame(()=>{
      editorRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
      editorRef.current?.querySelector('select')?.focus({preventScroll:true});
    });
  };
  const saveFeature=async(event:FormEvent)=>{
    event.preventDefault();if(!authClient||busy)return;
    const hasPrice=String(form.price_amount??'').trim()!==''||Boolean(form.currency_code)||Boolean(form.billing_interval);
    if(form.requires_premium&&hasPrice&&(!form.price_amount||form.price_amount<=0||!form.currency_code||!form.billing_interval)){
      setError('أكمل السعر والعملة والفترة، أو اترك حقول السعر كلها فارغة.');return;
    }
    setBusy(true);setError('');setNotice('');
    try{
      const {error:saveError}=await authClient.rpc('save_platform_feature_pricing' as any,{
        p_key:form.key.trim(),p_title:form.title.trim(),p_description:form.description.trim(),
        p_enabled:form.enabled,p_requires_premium:form.requires_premium,
        p_price_amount:form.requires_premium&&hasPrice?form.price_amount:null,
        p_currency_code:form.requires_premium&&hasPrice?form.currency_code:null,
        p_billing_interval:form.requires_premium&&hasPrice?form.billing_interval:null,
      });
      if(saveError)throw saveError;
      setNotice('حُفظ إعداد الميزة والسعر. لا يُحصّل هذا الإعداد أي رسوم ولا يفعّل الدفع.');
      setForm({key:'',title:'',description:'',enabled:true,requires_premium:false,price_amount:null,currency_code:null,billing_interval:null});
      await load();
    }catch(caught){setError(message(caught))}finally{setBusy(false)}
  };
  const loadMemberPermissions=async(address:string)=>{
    if(!authClient)throw new Error('تعذر الاتصال بخدمة الحسابات.');
    const [statusResult,eventsResult]=await Promise.all([
      authClient.rpc('list_admin_member_feature_status' as any,{p_email:address}),
      authClient.rpc('list_admin_member_feature_events' as any,{p_email:address,p_limit:30}),
    ]);
    if(statusResult.error)throw statusResult.error;
    if(eventsResult.error)throw eventsResult.error;
    setPermissionStatuses((statusResult.data??[]) as PermissionStatus[]);
    setPermissionEvents((eventsResult.data??[]) as PermissionEvent[]);
    setInspected(true);
  };
  const inspectMember=async()=>{
    if(!authClient||!email.trim())return;
    setBusy(true);setError('');setNotice('');
    try{
      await loadMemberPermissions(email.trim());
    }catch(caught){setError(message(caught))}finally{setBusy(false)}
  };
  const setMember=async(allowed:boolean|null)=>{
    if(!authClient||!email.trim()||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {error:saveError}=await authClient.rpc('set_member_feature' as any,{
        p_email:email.trim(),p_feature_key:selectedKey,p_allowed:allowed,
      });
      if(saveError)throw saveError;
      await loadMemberPermissions(email.trim());
      setNotice(allowed===null?'أُزيل التخصيص؛ تُطبق الآن القاعدة العامة أو الاشتراك.':allowed?'مُنحت الميزة للعضو صراحةً.':'سُحبت الميزة من العضو صراحةً.');
    }catch(caught){setError(message(caught))}finally{setBusy(false)}
  };
  const selectedStatus=permissionStatuses.find(item=>item.feature_key===selectedKey);
  return <section className="panel teacher-review-panel" aria-labelledby="platform-features-title">
    <h2 id="platform-features-title">مميزات المنصة واشتراكات Premium</h2>
    <p className="muted">جميع الميزات مجانية مبدئيًا. اختر ميزة موجودة إذا أردت تغييرها إلى مدفوعة وتحديد سعرها. تبقى الحسابات والخصوصية والأمان مجانية دائمًا. إعداد "مدفوعة" (requires_premium) + السعر/العملة/الفترة يحدد ما يُعرض للمستخدم كاشتراك. التفعيل (تفعيل الميزة) يتحكم في ظهورها. الدفع (sandbox) متاح عبر "اشترك الآن" في واجهة المستخدم؛ التفعيل (access) يتم بعد تحقق المزود (webhook)، وليس بمجرد إعادة التوجيه. لا تُخزّن بيانات البطاقة (CVV) أبدًا.</p>
    {error&&<p className="muted" role="alert">{error}</p>}
    {notice&&<p className="muted" role="status">{notice}</p>}
    {loading?<p role="status">جارٍ تحميل المميزات…</p>:<ul className="teacher-review-list">{features.map(feature=><li key={feature.key}><strong>{feature.title}</strong><span>{feature.enabled?'مفعّلة':'معطلة'} · {feature.requires_premium?`مدفوعة · ${formatPrice(feature)}`:'مجانية'}</span><button type="button" className="soft-btn" aria-label={`تعديل ${feature.title}`} onClick={()=>editFeature(feature)}>تعديل</button></li>)}</ul>}
    <form ref={editorRef} className="teacher-review-form" onSubmit={event=>void saveFeature(event)}>
      <h3>اختيار ميزة موجودة وتعديلها</h3>
      <label>الميزة<select required value={form.key} onChange={event=>{const selected=features.find(feature=>feature.key===event.target.value);if(selected)setForm(selected)}}><option value="" disabled>اختر ميزة من المنصة</option>{features.map(feature=><option key={feature.key} value={feature.key}>{feature.title}</option>)}</select></label>
      <label>الاسم<input required maxLength={120} value={form.title} onChange={event=>setForm(current=>({...current,title:event.target.value}))}/></label>
      <label>الوصف<textarea maxLength={500} value={form.description} onChange={event=>setForm(current=>({...current,description:event.target.value}))}/></label>
      <label className="feature-checkbox"><input type="checkbox" checked={form.enabled} onChange={event=>setForm(current=>({...current,enabled:event.target.checked}))}/> مفعّلة</label>
      <label className="feature-checkbox"><input type="checkbox" checked={form.requires_premium} onChange={event=>setForm(current=>({...current,requires_premium:event.target.checked,price_amount:event.target.checked?current.price_amount:null,currency_code:event.target.checked?current.currency_code:null,billing_interval:event.target.checked?current.billing_interval:null}))}/> مدفوعة وتتطلب استحقاقًا</label>
      {form.requires_premium&&<div className="platform-price-fields"><label>السعر<input type="number" min="0.001" max="999999999.999" step="0.001" value={form.price_amount??''} onChange={event=>setForm(current=>({...current,price_amount:event.target.value===''?null:Number(event.target.value)}))} placeholder="اتركه فارغًا حتى اعتماد التسعير"/></label><label>العملة (رمز ISO)<input maxLength={3} minLength={3} pattern="[A-Za-z]{3}" value={form.currency_code??''} onChange={event=>setForm(current=>({...current,currency_code:event.target.value.toUpperCase()}))} placeholder="مثل USD أو SAR"/></label><label>فترة الاشتراك<select value={form.billing_interval??''} onChange={event=>setForm(current=>({...current,billing_interval:event.target.value||null}))}><option value="">اختر الفترة</option><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></label></div>}
      <button className="primary" disabled={busy||!form.key} type="submit">حفظ الميزة</button>
    </form>
    <details className="teacher-review-form"><summary>سجل تغييرات المزايا والأسعار ({featureEvents.length})</summary>{featureEvents.length?<ul className="platform-audit-list">{featureEvents.map(event=><li key={event.id}><strong>{event.after_state.title as string} · {event.after_state.requires_premium?'مدفوعة':'مجانية'}</strong><span>{event.after_state.price_amount?`${event.after_state.price_amount} ${event.after_state.currency_code} · ${intervalName(event.after_state.billing_interval as string)}`:'بلا سعر محدد'}</span><small>{event.changed_by_email||'مشرف'} · {formatDate(event.changed_at)}</small></li>)}</ul>:<p className="muted">لا توجد تغييرات مسجلة بعد.</p>}</details>
    <div className="teacher-review-form">
      <h3>مميزات عضو</h3>
      <label>بريد العضو<input type="email" value={email} onChange={event=>{setEmail(event.target.value);setPermissionStatuses([]);setPermissionEvents([]);setInspected(false)}}/></label>
      <label>الميزة<select value={selectedKey} onChange={event=>setSelectedKey(event.target.value)}>{features.map(feature=><option key={feature.key} value={feature.key}>{feature.title}</option>)}</select></label>
      <div className="teacher-review-actions"><button className="soft-btn" disabled={busy||!email.trim()} onClick={()=>void inspectMember()}>عرض حالة الصلاحيات</button><button className="primary" disabled={busy||!selectedStatus||selectedStatus.override_allowed===true} onClick={()=>void setMember(true)}>منح الميزة</button><button className="soft-btn" disabled={busy||!selectedStatus||selectedStatus.override_allowed===false} onClick={()=>void setMember(false)}>سحب الميزة</button><button className="soft-btn" disabled={busy||!selectedStatus||selectedStatus.override_allowed===null} onClick={()=>void setMember(null)}>إعادة للقاعدة العامة</button></div>
      {inspected&&selectedStatus&&<section className={`admin-permission-current ${selectedStatus.effective_allowed?'is-available':'is-unavailable'}`} aria-live="polite">
        <div className="admin-permission-current-heading"><strong>الحالة الفعلية الآن — {selectedStatus.feature_title}</strong><span>{selectedStatus.effective_allowed?'متاحة للعضو':'غير متاحة للعضو'}</span></div>
        <p>{permissionSource(selectedStatus)}</p>
        <p>{permissionOverrideLabel(selectedStatus.override_allowed)}</p>
        {selectedStatus.override_allowed===true&&selectedStatus.access_source==='feature_disabled'&&<p>يوجد منح إداري، لكن الميزة معطلة على مستوى المنصة؛ لذلك لا يستطيع العضو استخدامها الآن.</p>}
        <div className="admin-permission-last-change"><strong>آخر تغيير مسجل لهذه الميزة</strong>{selectedStatus.latest_changed_at?<span>{permissionEventLabel(selectedStatus.latest_allowed)} · {selectedStatus.latest_changed_by_email||'مشرف'} · {formatDate(selectedStatus.latest_changed_at)}</span>:<span>لا يوجد تغيير مسجل؛ الحالة الحالية ناتجة عن القاعدة العامة أو الاشتراك.</span>}</div>
      </section>}
      {inspected&&<div><h4>سجل الصلاحيات</h4>{permissionEvents.length?<ul className="platform-audit-list">{permissionEvents.map(event=><li key={event.id}><strong>{event.feature_title}</strong><span className={event.allowed===true?'granted':event.allowed===false?'revoked':'reset'}>{permissionEventLabel(event.allowed)}</span><small>{event.changed_by_email||'مشرف'} · {formatDate(event.changed_at)}</small></li>)}</ul>:<p className="muted">لا توجد تغييرات مسجلة لهذا الحساب.</p>}</div>}
    </div>
  </section>;
}

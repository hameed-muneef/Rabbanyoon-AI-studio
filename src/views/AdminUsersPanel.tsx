import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Search,Users,ChevronLeft,ChevronRight,RefreshCw,ShieldCheck} from 'lucide-react';
import {authClient} from '../auth';

type RoleFilter='all'|'admin'|'member';
type AdminUser={
  user_id:string;email:string|null;email_confirmed:boolean;created_at:string;last_sign_in_at:string|null;
  first_name:string;last_name:string;country:string;is_admin:boolean;
  total_count:number|string;confirmed_count:number|string;admin_count:number|string;
};
type FeatureOption={key:string;title:string;enabled:boolean;requires_premium:boolean};
type PermissionEvent={id:string;feature_key:string;feature_title:string;allowed:boolean|null;changed_by_email:string|null;changed_at:string};
type PermissionStatus={
  feature_key:string;feature_title:string;override_allowed:boolean|null;effective_allowed:boolean;
  access_source:'feature_disabled'|'admin_grant'|'admin_revoke'|'free_default'|'subscription'|'premium_required';
  latest_allowed:boolean|null;latest_changed_by_email:string|null;latest_changed_at:string|null;
};

const pageSize=25;
const roleOptions:[RoleFilter,string][]=[['all','كل المستخدمين'],['admin','مشرفو المنصة'],['member','الأعضاء']];
const dateFormat=new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium'});
const dateTimeFormat=new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'});
const dateTime=(value:string)=>new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

function formatDate(value:string|null,time=false){
  if(!value)return 'لم يسجل دخولًا بعد';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'غير متاح':(time?dateTimeFormat:dateFormat).format(date);
}

function permissionSource(status:PermissionStatus){
  if(status.access_source==='feature_disabled')return 'الميزة معطلة على مستوى المنصة';
  if(status.access_source==='admin_grant')return 'السبب: منح إداري صريح';
  if(status.access_source==='admin_revoke')return 'السبب: سحب إداري صريح';
  if(status.access_source==='free_default')return 'السبب: الميزة مجانية حسب القاعدة العامة';
  if(status.access_source==='subscription')return 'السبب: اشتراك فعّال لهذه الميزة';
  return 'السبب: لا يوجد منح إداري أو اشتراك مدفوع فعّال';
}

function permissionOverrideLabel(allowed:boolean|null){
  if(allowed===true)return 'القرار الإداري الحالي: ممنوحة صراحةً';
  if(allowed===false)return 'القرار الإداري الحالي: مسحوبة صراحةً';
  return 'لا يوجد قرار إداري صريح؛ تُطبق القاعدة العامة أو الاشتراك';
}

function permissionEventLabel(allowed:boolean|null){
  if(allowed===true)return 'منح إداري';
  if(allowed===false)return 'سحب إداري';
  return 'إعادة إلى القاعدة العامة';
}

export default function AdminUsersPanel(){
  const permissionsRef=useRef<HTMLElement>(null);
  const [users,setUsers]=useState<AdminUser[]>([]);
  const [features,setFeatures]=useState<FeatureOption[]>([]);
  const [selectedUser,setSelectedUser]=useState<AdminUser|null>(null);
  const [selectedFeature,setSelectedFeature]=useState('');
  const [permissionStatuses,setPermissionStatuses]=useState<PermissionStatus[]>([]);
  const [permissionEvents,setPermissionEvents]=useState<PermissionEvent[]>([]);
  const [permissionLoading,setPermissionLoading]=useState(false);
  const [permissionBusy,setPermissionBusy]=useState(false);
  const [permissionError,setPermissionError]=useState('');
  const [permissionNotice,setPermissionNotice]=useState('');
  const [queryInput,setQueryInput]=useState('');
  const [query,setQuery]=useState('');
  const [role,setRole]=useState<RoleFilter>('all');
  const [offset,setOffset]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [roleBusy,setRoleBusy]=useState('');
  const [roleNotice,setRoleNotice]=useState('');
  const [roleFailure,setRoleFailure]=useState('');

  const setAdminRole=async(account:AdminUser,makeAdmin:boolean)=>{
    const client=authClient;
    if(!client||roleBusy)return;
    const name=account.email||account.user_id;
    if(!window.confirm(makeAdmin?`منح صلاحية مشرف المنصة للحساب ${name}؟`:`إزالة صلاحية الإشراف عن الحساب ${name}؟`))return;
    setRoleBusy(account.user_id);setRoleNotice('');setRoleFailure('');
    try{
      const {error:roleError}=await client.rpc('admin_set_admin',{p_user_id:account.user_id,p_make_admin:makeAdmin});
      if(roleError)throw roleError;
      setRoleNotice(makeAdmin?'مُنح الحساب صلاحية الإشراف.':'أُزيلت صلاحية الإشراف عن الحساب.');
      setReload(value=>value+1);
    }catch(caught){setRoleFailure(caught instanceof Error?caught.message:'تعذر تحديث صلاحية الإشراف.')}
    finally{setRoleBusy('')}
  };
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setLoading(true);setError('');
      if(!authClient){setError('تعذر الاتصال بخدمة الحسابات.');setLoading(false);return}
      try{
        const {data,error:loadError}=await authClient.rpc('admin_list_users',{
          p_search:query,p_role:role,p_limit:pageSize,p_offset:offset,
        });
        if(loadError)throw loadError;
        if(active)setUsers((data??[]) as AdminUser[]);
      }catch(caught){if(active)setError(caught instanceof Error?caught.message:'تعذر تحميل المستخدمين.')}
      finally{if(active)setLoading(false)}
    };
    void load();
    return()=>{active=false};
  },[query,role,offset,reload]);

  useEffect(()=>{
    let active=true;
    const loadFeatures=async()=>{
      if(!authClient)return;
      const {data,error:featureError}=await authClient.from('platform_features').select('key,title,enabled,requires_premium').order('title');
      if(active){
        if(featureError)setPermissionError(featureError.message);
        else{
          const options=(data??[]) as FeatureOption[];
          setFeatures(options);
          setSelectedFeature(current=>current||options[0]?.key||'');
        }
      }
    };
    void loadFeatures();
    return()=>{active=false};
  },[]);

  const loadPermissions=async(account:AdminUser)=>{
    const client=authClient;
    if(!client||!account.email)return;
    setPermissionLoading(true);setPermissionError('');setPermissionNotice('');
    try{
      const [statusResult,eventsResult]=await Promise.all([
        client.rpc('list_admin_member_feature_status',{p_email:account.email}),
        client.rpc('list_admin_member_feature_events',{p_email:account.email,p_limit:30}),
      ]);
      if(statusResult.error)throw statusResult.error;
      if(eventsResult.error)throw eventsResult.error;
      setPermissionStatuses((statusResult.data??[]) as PermissionStatus[]);
      setPermissionEvents((eventsResult.data??[]) as PermissionEvent[]);
    }catch(caught){setPermissionError(caught instanceof Error?caught.message:'تعذر تحميل صلاحيات العضو.')}
    finally{setPermissionLoading(false)}
  };

  const managePermissions=(account:AdminUser)=>{
    setSelectedUser(account);setPermissionError('');setPermissionNotice('');setPermissionStatuses([]);setPermissionEvents([]);
    if(!selectedFeature&&features.length)setSelectedFeature(features[0].key);
    requestAnimationFrame(()=>permissionsRef.current?.scrollIntoView({behavior:'smooth',block:'center'}));
    void loadPermissions(account);
  };

  const setFeaturePermission=async(allowed:boolean|null)=>{
    const client=authClient;
    if(!client||!selectedUser?.email||!selectedFeature||permissionBusy)return;
    setPermissionBusy(true);setPermissionError('');setPermissionNotice('');
    try{
      const {error:saveError}=await client.rpc('set_member_feature',{p_email:selectedUser.email,p_feature_key:selectedFeature,p_allowed:allowed});
      if(saveError)throw saveError;
      await loadPermissions(selectedUser);
      setPermissionNotice(allowed===null?'أُعيد العضو إلى القاعدة العامة لهذه الميزة.':allowed?'مُنحت الميزة لهذا العضو.':'سُحبت الميزة من هذا العضو.');
    }catch(caught){setPermissionError(caught instanceof Error?caught.message:'تعذر تحديث صلاحية العضو.')}
    finally{setPermissionBusy(false)}
  };

  const search=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setOffset(0);setQuery(queryInput.trim());
  };
  const summary=users[0];
  const total=Number(summary?.total_count??0);
  const page=Math.floor(offset/pageSize)+1;
  const selectedStatus=permissionStatuses.find(item=>item.feature_key===selectedFeature);
  const selectedOverride=selectedStatus?.override_allowed??null;

  return <section className="admin-users" aria-labelledby="admin-users-title">
    <header className="admin-users-heading"><div><span className="admin-eyebrow"><Users size={15}/> الحسابات والصلاحيات</span><h2 id="admin-users-title">مستخدمو المنصة</h2><p>عرض معلومات الحساب والأدوار الممنوحة دون الوصول إلى المحتوى الشخصي.</p></div><button className="admin-users-refresh" onClick={()=>setReload(value=>value+1)} disabled={loading} aria-label="تحديث المستخدمين" title="تحديث المستخدمين"><RefreshCw size={17}/></button></header>
    <div className="admin-user-stats" aria-live="polite">
      <div><span>المطابقون</span><strong>{loading?'…':total}</strong></div>
      <div><span>بريد مؤكد</span><strong>{loading?'…':Number(summary?.confirmed_count??0)}</strong></div>
      <div><span>مشرفون</span><strong>{loading?'…':Number(summary?.admin_count??0)}</strong></div>
    </div>
    <form className="admin-users-filters" onSubmit={search}>
      <label className="admin-users-search"><span>بحث بالاسم أو البريد أو البلد</span><div><Search size={17}/><input value={queryInput} maxLength={120} onChange={event=>setQueryInput(event.target.value)} placeholder="ابحث عن مستخدم"/></div></label>
      <label><span>الصلاحية</span><select value={role} onChange={event=>{setRole(event.target.value as RoleFilter);setOffset(0)}}>{roleOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <button className="admin-users-search-button" type="submit"><Search size={16}/> بحث</button>
    </form>
    <p className="admin-users-privacy">تُعرض بيانات الحساب الأساسية وحالات الاعتماد فقط. لا تُعرض تفضيلات المستخدم أو بياناته الخاصة.</p>
    {error&&<p className="admin-users-error" role="alert">{error}</p>}{roleNotice&&<p className="admin-users-success" role="status">{roleNotice}</p>}{roleFailure&&<p className="admin-users-error" role="alert">{roleFailure}</p>}
    {loading?<p className="admin-users-empty" role="status">جارٍ تحميل المستخدمين…</p>:!error&&users.length===0?<p className="admin-users-empty">لا توجد حسابات مطابقة.</p>:!error&&<>
      <div className="admin-users-table-wrap"><table className="admin-users-table"><thead><tr><th>الحساب</th><th>البلد</th><th>حالة البريد</th><th>الصلاحيات</th><th>تاريخ التسجيل</th><th>آخر دخول</th><th>إجراءات</th></tr></thead><tbody>
        {users.map(account=><tr key={account.user_id}><td><strong>{[account.first_name,account.last_name].filter(Boolean).join(' ')||'اسم غير مسجل'}</strong><bdi className="admin-user-email">{account.email||'بلا بريد'}</bdi><small className="admin-user-id"><bdi>{account.user_id}</bdi></small></td><td>{account.country||'—'}</td><td><span className={account.email_confirmed?'admin-user-state confirmed':'admin-user-state'}>{account.email_confirmed?'مؤكد':'غير مؤكد'}</span></td><td><div className="admin-user-roles">{account.is_admin&&<span className="admin-user-role admin">مشرف المنصة</span>}{!account.is_admin&&<span className="admin-user-role member">عضو</span>}</div></td><td>{formatDate(account.created_at,true)}</td><td>{formatDate(account.last_sign_in_at,true)}</td><td><button type="button" className="admin-user-manage" disabled={!account.email_confirmed||!account.email} onClick={()=>managePermissions(account)}><ShieldCheck size={15}/> إدارة المزايا</button><button type="button" className={account.is_admin?'admin-permission-revoke':'admin-user-manage'} disabled={roleBusy===account.user_id||(!account.is_admin&&!account.email_confirmed)} onClick={()=>void setAdminRole(account,!account.is_admin)}>{account.is_admin?'إزالة الإشراف':'جعله مشرفًا'}</button></td></tr>)}
      </tbody></table></div>
      <footer className="admin-users-pagination"><span>صفحة {page} من {Math.max(1,Math.ceil(total/pageSize))}</span><div><button onClick={()=>setOffset(Math.max(0,offset-pageSize))} disabled={offset===0||loading} aria-label="الصفحة السابقة"><ChevronRight size={17}/></button><button onClick={()=>setOffset(offset+pageSize)} disabled={offset+pageSize>=total||loading} aria-label="الصفحة التالية"><ChevronLeft size={17}/></button></div></footer>
      {selectedUser&&<section ref={permissionsRef} className="admin-user-permissions" aria-labelledby="admin-user-permissions-title">
        <header><div><span className="admin-eyebrow"><ShieldCheck size={15}/> تحكم المستخدم</span><h3 id="admin-user-permissions-title">صلاحيات {[selectedUser.first_name,selectedUser.last_name].filter(Boolean).join(' ')||selectedUser.email}</h3><bdi>{selectedUser.email}</bdi></div><button type="button" className="admin-permissions-close" onClick={()=>setSelectedUser(null)}>إغلاق</button></header>
        {permissionError&&<p className="admin-users-error" role="alert">{permissionError}</p>}
        {permissionNotice&&<p className="admin-users-success" role="status">{permissionNotice}</p>}
        <label className="admin-permission-select">الميزة<select value={selectedFeature} onChange={event=>setSelectedFeature(event.target.value)}>{features.map(feature=><option key={feature.key} value={feature.key}>{feature.title}{!feature.enabled?' · معطلة':feature.requires_premium?' · مدفوعة':' · مجانية'}</option>)}</select></label>
        {permissionLoading?<p role="status">جارٍ تحميل صلاحيات العضو…</p>:<>
          {selectedStatus?<section className={`admin-permission-current ${selectedStatus.effective_allowed?'is-available':'is-unavailable'}`} aria-live="polite">
            <div className="admin-permission-current-heading"><strong>الحالة الفعلية الآن</strong><span>{selectedStatus.effective_allowed?'متاحة للعضو':'غير متاحة للعضو'}</span></div>
            <p>{permissionSource(selectedStatus)}</p>
            <p>{permissionOverrideLabel(selectedStatus.override_allowed)}</p>
            {selectedStatus.override_allowed===true&&selectedStatus.access_source==='feature_disabled'&&<p>يوجد منح إداري، لكن الميزة معطلة على مستوى المنصة؛ لذلك لا يستطيع العضو استخدامها الآن.</p>}
            <div className="admin-permission-last-change"><strong>آخر تغيير مسجل لهذه الميزة</strong>{selectedStatus.latest_changed_at?<span>{permissionEventLabel(selectedStatus.latest_allowed)} · {selectedStatus.latest_changed_by_email||'مشرف'} · {dateTime(selectedStatus.latest_changed_at)}</span>:<span>لا يوجد تغيير مسجل؛ الحالة الحالية ناتجة عن القاعدة العامة أو الاشتراك.</span>}</div>
          </section>:<p className="admin-users-empty">لا تتوفر حالة لهذه الميزة.</p>}
          <p className="admin-permission-help">«الحالة الفعلية» توضّح ما إذا كان العضو يستطيع استخدام الميزة الآن. «القرار الإداري» يوضح هل يوجد منح أو سحب صريح؛ وإذا لم يوجد، تُطبق القاعدة العامة والاشتراك.</p>
          <div className="admin-permission-actions"><button type="button" className="admin-users-search-button" disabled={permissionBusy||!selectedStatus||selectedOverride===true} onClick={()=>void setFeaturePermission(true)}>منح الميزة</button><button type="button" className="admin-permission-revoke" disabled={permissionBusy||!selectedStatus||selectedOverride===false} onClick={()=>void setFeaturePermission(false)}>سحب الميزة</button><button type="button" className="admin-permission-reset" disabled={permissionBusy||selectedOverride===null} onClick={()=>void setFeaturePermission(null)}>إعادة للقاعدة العامة</button></div>
          <h4>سجل تغييرات هذا العضو</h4>{permissionEvents.length?<ul className="admin-permission-history">{permissionEvents.map(event=><li key={event.id}><strong>{event.feature_title}</strong><span className={event.allowed===true?'granted':event.allowed===false?'revoked':'reset'}>{permissionEventLabel(event.allowed)}</span><small>{event.changed_by_email||'مشرف'} · {dateTime(event.changed_at)}</small></li>)}</ul>:<p className="admin-users-empty">لا توجد تغييرات صلاحيات مسجلة لهذا العضو.</p>}
        </>}
      </section>}
    </>}
  </section>;
}
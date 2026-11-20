import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Bell,CheckCheck,Inbox,LoaderCircle,RefreshCw,ShieldCheck,Trash2} from 'lucide-react';
import {authClient} from '../auth';
import type {View} from '../app-state';
import '../notifications.css';

type NotificationCategory='reminder'|'system';
type NotificationRow={
  notification_id:string;
  notification_kind:string;
  notification_title:string;
  notification_body:string;
  notification_link:string;
  notification_category?:string;
  read_at:string|null;
  created_at:string;
};

const PAGE_SIZE=20;
const NOTIFICATION_TTL_MS=30*60*1000; // 30 minutes: unread notifications auto-become read (badge clears)
const isExpired=(row:NotificationRow,nowMs:number)=>!row.read_at&&(nowMs-Date.parse(row.created_at)>NOTIFICATION_TTL_MS);
const categories:[NotificationCategory|'all',string][] = [
  ['all','الكل'],
  ['reminder','الصلاة والتذكيرات'],
  ['system','النظام'],
];

// Notification links are view keys, not free-form URLs. Unknown links are
// shown as plain notifications and never navigated to.
const viewLabels:Record<string,string>={
  home:'الرئيسية',day:'حياتي مع الله',tasks:'مركز المهام',week:'أسبوعي مع الله',month:'شهري مع الله',
  goals:'المؤمن القوي',reflect:'محاسبة النفس',wird:'زكِّ نفسك',profile:'حسابي',settings:'الإعدادات',
};
// Sections removed from the product keep their past notifications visible, but
// no longer offer a navigation button to a page that does not exist.
const targetLabel=(link:string)=>viewLabels[link];

function categoryOf(kind:string):NotificationCategory{
  if(['prayer','reminder','worship','goal','task'].includes(kind))return 'reminder';
  return 'system';
}

function CategoryIcon({category}:{category:string}){
  if(category==='reminder')return <Bell size={16} aria-hidden="true"/>;
  return <ShieldCheck size={16} aria-hidden="true"/>;
}

function formatTime(value:string){
  try{return new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}
  catch{return value}
}

type Props={
  user:{id:string;email?:string}|null;
  profile:{notification_preferences?:Record<string,unknown>}|null;
  onNavigate:(view:View)=>void;
};

export default function NotificationCenter({user,profile,onNavigate}:Props){
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<NotificationRow[]>([]);
  const [unread,setUnread]=useState(0);
  const [category,setCategory]=useState<NotificationCategory|'all'>('all');
  const [unreadOnly,setUnreadOnly]=useState(false);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [hasMore,setHasMore]=useState(false);
  const [legacy,setLegacy]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);
  const [nowMs,setNowMs]=useState(()=>Date.now());
  const preferencesOff=profile?.notification_preferences?.enabled===false;

  const legacyFallback=useCallback(async()=>{
    if(!authClient)return;
    const {data,error:legacyError}=await authClient.rpc('list_notifications',{p_limit:60});
    if(legacyError)throw legacyError;
    const rows=((data??[]) as NotificationRow[]).map(row=>({
      ...row,
      notification_category:row.notification_category??categoryOf(row.notification_kind),
    }));
    setLegacy(true);
    setItems(rows);
    setHasMore(false);
  },[setItems,setHasMore,setLegacy]);

  const loadFirst=useCallback(async()=>{
    if(!authClient||!user||preferencesOff){setItems([]);setUnread(0);return}
    // The legacy feed has no server-side filters, so tabs and the unread toggle
    // are applied to the already-loaded rows in visibleItems.
    if(legacy){await legacyFallback();return}
    setLoading(true);setError('');
    try{
      const {data,error:listError}=await authClient.rpc('list_notifications',{
        p_limit:PAGE_SIZE,p_offset:0,p_category:category==='all'?null:category,p_unread_only:unreadOnly,
      });
      if(listError){
        // The live backend may not have the newest migration yet; keep the bell
        // usable with the old function and apply filters locally.
        if(category==='all'&&!unreadOnly){
          await legacyFallback();
          const {data:count}=await authClient.rpc('unread_notification_count');
          setUnread(Number(count??0));
          return;
        }
        throw listError;
      }
      setLegacy(false);
      setItems((data??[]) as NotificationRow[]);
      setHasMore(((data??[]) as NotificationRow[]).length===PAGE_SIZE);
      const {data:count}=await authClient.rpc('unread_notification_count');
      setUnread(Number(count??0));
    }catch(caught){
      setError(caught instanceof Error?caught.message:'تعذر تحميل الإشعارات.');
    }finally{setLoading(false)}
  },[user,preferencesOff,category,unreadOnly,legacy,legacyFallback]);

  const loadMore=useCallback(async()=>{
    if(!authClient||loading||legacy)return;
    setLoading(true);setError('');
    try{
      const {data,error:listError}=await authClient.rpc('list_notifications',{
        p_limit:PAGE_SIZE,p_offset:items.length,p_category:category==='all'?null:category,p_unread_only:unreadOnly,
      });
      if(listError)throw listError;
      const next=(data??[]) as NotificationRow[];
      setItems(current=>[...current,...next]);
      setHasMore(next.length===PAGE_SIZE);
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر تحميل المزيد.')}
    finally{setLoading(false)}
  },[user?.id,category,unreadOnly,items.length,loading,legacy]);

  useEffect(()=>{void loadFirst()},[loadFirst]);
  useEffect(()=>{
    if(!authClient||!user)return;
    void authClient.rpc('purge_my_old_notifications',{p_days:90}).then(()=>undefined,()=>undefined);
    void authClient.rpc('expire_my_notifications',{p_minutes:30}).then(()=>undefined,()=>undefined);
  },[user?.id]);

  // Tick every 30s so stale items become read even while the panel stays open.
  useEffect(()=>{
    const timer=window.setInterval(()=>setNowMs(Date.now()),30000);
    return()=>window.clearInterval(timer);
  },[]);

  // Auto-expire: unread >30min → mark read locally + server (badge clears after 30 min)
  useEffect(()=>{
    if(!authClient||!user||preferencesOff)return;
    const stale=items.filter(row=>isExpired(row,nowMs));
    if(!stale.length)return;
    setItems(current=>current.map(row=>isExpired(row,nowMs)?{...row,read_at:new Date(nowMs).toISOString()}:row));
    setUnread(value=>Math.max(0,value-stale.length));
    // Server-side expiry (best-effort; ignore if RPC not yet deployed)
    void authClient.rpc('expire_my_notifications',{p_minutes:30}).then(()=>undefined,()=>undefined);
  },[items,nowMs,user?.id,preferencesOff]);

  // Refresh only the light unread counter; the full list is fetched when the
  // user opens the bell or the counter changes. Expire stale (>30min) first so
  // the badge clears automatically even when the panel stays closed.
  useEffect(()=>{
    if(!authClient||!user||preferencesOff)return;
    const client=authClient;
    const poll=async()=>{
      if(document.visibilityState!=='visible')return;
      try{
        await client.rpc('expire_my_notifications',{p_minutes:30});
        const {data}=await client.rpc('unread_notification_count');
        const next=Number(data??0);
        if(next!==unread){setUnread(next);if(open)void loadFirst()}
      }catch{/* retry on the next tick */}
    };
    const timer=window.setInterval(()=>void poll(),30000);
    document.addEventListener('visibilitychange',poll);
    window.addEventListener('focus',poll);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',poll);window.removeEventListener('focus',poll)};
  },[user?.id,preferencesOff,unread,open,loadFirst]);

  useEffect(()=>{
    if(!open)return;
    const onPointer=(event:MouseEvent)=>{
      if(rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false);
    };
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',onPointer);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('mousedown',onPointer);document.removeEventListener('keydown',onKey)};
  },[open]);

  const visibleItems=useMemo(()=>{
    if(!legacy)return items.map(row=>isExpired(row,nowMs)?{...row,read_at:row.read_at??new Date(nowMs).toISOString()}:row);
    return items.filter(row=>
      (category==='all'||(row.notification_category??categoryOf(row.notification_kind))===category)
      &&(!unreadOnly||!row.read_at)
    );
  },[items,legacy,category,unreadOnly,nowMs]);

  // Server-side pages are replaced on filter change; legacy rows stay loaded so
  // visibleItems can keep filtering them without another round trip.
  const pickCategory=(next:NotificationCategory|'all')=>{
    if(next===category)return;
    setError('');
    if(!legacy){setItems([]);setHasMore(false)}
    setCategory(next);
  };
  const toggleUnreadOnly=(next:boolean)=>{
    setError('');
    if(!legacy){setItems([]);setHasMore(false)}
    setUnreadOnly(next);
  };

  const markRead=async(id:string)=>{
    if(!authClient||busy)return;
    const target=items.find(row=>row.notification_id===id);
    if(!target||target.read_at)return;
    setBusy(true);
    try{
      const {error:rpcError}=await authClient.rpc('mark_notification_read',{p_notification_id:id});
      if(rpcError)throw rpcError;
      setItems(current=>current.map(row=>row.notification_id===id?{...row,read_at:new Date().toISOString()}:row));
      setUnread(value=>Math.max(0,value-1));
    }catch{setError('تعذر تحديث حالة الإشعار.')}
    finally{setBusy(false)}
  };

  const markAll=async()=>{
    if(!authClient||busy)return;
    setBusy(true);setError('');
    try{
      const {error:rpcError}=await authClient.rpc('mark_all_notifications_read');
      if(rpcError)throw rpcError;
      setItems(current=>current.map(row=>({...row,read_at:row.read_at??new Date().toISOString()})));
      setUnread(0);
    }catch{setError('تعذر تعليم الإشعارات كمقروءة.')}
    finally{setBusy(false)}
  };

  const clearAll=async()=>{
    if(!authClient||busy)return;
    if(!window.confirm('سيتم حذف جميع الإشعارات (مقروءة وغير مقروءة). لا يمكن التراجع. متابعة؟'))return;
    setBusy(true);setError('');
    try{
      const {error:rpcError}=await authClient.rpc('clear_all_my_notifications');
      if(rpcError)throw rpcError;
      setItems([]);
      setUnread(0);
      setHasMore(false);
    }catch{setError('تعذر حذف الإشعارات.')}
    finally{setBusy(false)}
  };

  const openNotification=async(row:NotificationRow)=>{
    if(!row.read_at)await markRead(row.notification_id);
    if(row.notification_link&&targetLabel(row.notification_link)){
      setOpen(false);
      onNavigate(row.notification_link as View);
    }
  };

  if(!user||preferencesOff)return null;

  return <div className="notif-center" ref={rootRef}>
    <button type="button" className="notif-bell" onClick={()=>setOpen(value=>!value)} aria-label={`الإشعارات${unread?` (${unread} غير مقروءة)`:''}`} aria-expanded={open} aria-haspopup="dialog">
      <Bell size={18}/>
      {unread>0&&<span className="notif-badge" aria-hidden="true">{unread>99?'99+':unread}</span>}
    </button>
    {open&&<div className="notif-panel" role="dialog" aria-label="مركز الإشعارات" aria-live="polite">
      <header className="notif-head">
        <div><h3>الإشعارات</h3><p className="muted small">{unread>0?`${unread} غير مقروءة`:'كل الإشعارات مقروءة'}</p></div>
        <button type="button" className="soft-btn notif-mark-all" disabled={busy||unread===0} onClick={()=>void markAll()}><CheckCheck size={15}/> تعليم الكل كمقروء</button>
        <button type="button" className="soft-btn notif-clear-all" disabled={busy||items.length===0} onClick={()=>void clearAll()}><Trash2 size={15}/> حذف الكل</button>
      </header>
      <div className="notif-filters" role="tablist" aria-label="تصنيفات الإشعارات">
        {categories.map(([id,label])=><button key={id} type="button" role="tab" aria-selected={category===id} className={category===id?'active':''} onClick={()=>pickCategory(id)}>{label}</button>)}
      </div>
      <label className="notif-unread-toggle"><input type="checkbox" checked={unreadOnly} onChange={event=>toggleUnreadOnly(event.target.checked)}/> عرض غير المقروء فقط</label>
      {error&&<p className="notif-error" role="alert">{error} <button type="button" className="soft-btn" onClick={()=>void loadFirst()}><RefreshCw size={14}/> إعادة المحاولة</button></p>}
      {loading&&items.length===0?<p className="notif-state" role="status"><LoaderCircle size={17} className="spin"/> جارٍ تحميل الإشعارات…</p>
        :visibleItems.length===0?<p className="notif-state"><Inbox size={18}/> {unreadOnly?'لا إشعارات غير مقروءة في هذا التصنيف.':'لا إشعارات في هذا التصنيف بعد.'}</p>
        :<ul className="notif-list">
          {visibleItems.map(row=>{
            const categoryValue=row.notification_category??categoryOf(row.notification_kind);
            const target=targetLabel(row.notification_link);
            return <li key={row.notification_id} className={row.read_at?'notif-item read':'notif-item unread'}>
              <span className={`notif-icon notif-icon-${categoryValue}`}><CategoryIcon category={categoryValue}/></span>
              <div className="notif-body">
                <div className="notif-title-row"><strong>{row.notification_title}</strong>{!row.read_at&&<span className="notif-dot" aria-label="غير مقروء"/>}</div>
                {row.notification_body&&<p>{row.notification_body}</p>}
                <small className="muted">{formatTime(row.created_at)}</small>
                <div className="notif-actions">
                  {target&&<button type="button" className="soft-btn" onClick={()=>void openNotification(row)}>فتح {target}</button>}
                  {!row.read_at&&<button type="button" className="notif-read-btn" disabled={busy} onClick={()=>void markRead(row.notification_id)}>تعليم كمقروء</button>}
                </div>
              </div>
            </li>;
          })}
        </ul>}
      {!legacy&&hasMore&&<button type="button" className="soft-btn notif-more" disabled={loading} onClick={()=>void loadMore()}>{loading?'جارٍ التحميل…':'تحميل المزيد'}</button>}
    </div>}
  </div>;
}

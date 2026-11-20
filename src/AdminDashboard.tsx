import {useEffect,useState} from 'react';
import {ArrowRight,BookOpen,LogOut} from 'lucide-react';
import type {User} from '@supabase/supabase-js';
import {authClient} from './auth';
import './admin.css';
import {cleanupRemovedBooks} from './resource-cleanup';
import PlatformFeaturesPanel from './views/PlatformFeaturesPanel';
import AdminUsersPanel from './views/AdminUsersPanel';
import QuranContentAdminPanel from './views/QuranContentAdminPanel';
import AdhanAdminPanel from './views/AdhanAdminPanel';
import HaramainAdminPanel from './views/HaramainAdminPanel';
import PaymentsAdminPanel from './views/PaymentsAdminPanel';

export default function AdminDashboard({user}:{user:User}){


  const [status]=useState<'saved'>('saved');
  const [paymentMessage,setPaymentMessage]=useState('');
const [cleanupMessage,setCleanupMessage]=useState('');
  const [cleaning,setCleaning]=useState(false);
  const cleanup=async()=>{setCleaning(true);try{const remaining=await cleanupRemovedBooks();setCleanupMessage(remaining?'توجد ملفات أخرى بانتظار التنظيف. اضغط لإكمال التنظيف.':'')}catch(error){setCleanupMessage(error instanceof Error?error.message:'تعذر تنظيف الملفات.')}finally{setCleaning(false)}};
  useEffect(()=>{void cleanup()},[]);
  return <div className="admin-page" dir="rtl"><header className="admin-header"><div className="admin-identity"><span className="admin-mark"><img src="/brand/book-mark.svg" alt=""/></span><span><strong>لوحة إدارة الرَّبَّانِيُّون</strong><small>{user.email}</small></span></div><div className="admin-header-actions"><a href="/"><ArrowRight size={17}/> واجهة المستخدم</a><button onClick={()=>authClient?.auth.signOut()}><LogOut size={17}/> خروج</button></div></header><main className="admin-content"><div className="admin-intro"><div><span className="admin-eyebrow"><BookOpen size={15}/> إدارة المنصة</span><h1>لوحة الإدارة</h1><p>إدارة المستخدمين والصلاحيات والمحتوى من مكان واحد.</p></div><div className="admin-save-controls"><span className={'admin-save '+status} role="status">{status==='saved'?'محفوظ':'جارٍ الحفظ…'}</span></div></div><AdminUsersPanel/><QuranContentAdminPanel/><AdhanAdminPanel user={user}/><HaramainAdminPanel/><PlatformFeaturesPanel/><PaymentsAdminPanel user={user} onNotify={(text)=>setPaymentMessage(text)}/>{paymentMessage&&<p role="status" className="admin-loading">{paymentMessage}</p>}<div className="admin-cleanup-controls">{cleanupMessage&&<div className="admin-cleanup-warning" role="status"><p>{cleanupMessage}</p><button className="soft-btn" disabled={cleaning||status!=='saved'} onClick={()=>void cleanup()}>إعادة محاولة تنظيف الملفات غير المستخدمة</button></div>}{cleaning&&<p role="status">جارٍ التحقق من الملفات غير المستخدمة وتنظيفها…</p>}</div></main></div>;
}

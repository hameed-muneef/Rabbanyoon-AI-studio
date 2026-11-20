import {useState,type FormEvent} from 'react';
import {ArrowLeft,Eye,EyeOff,LockKeyhole,Mail,ShieldCheck,UserRound} from 'lucide-react';
import {authClient} from './auth';
import CountrySelector from './CountrySelector';
import './auth.css';

function authMessage(err:unknown,fallback:string){
  const text=err instanceof Error?err.message:'';
  if(!text)return fallback;
  if(/invalid login credentials/i.test(text))return 'البريد أو كلمة المرور غير صحيحة.';
  if(/email not confirmed/i.test(text))return 'لم يتم تأكيد بريدك بعد. افتح رسالة التأكيد في بريدك.';
  if(/rate limit|security purposes|too many/i.test(text))return 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.';
  if(/same as the old|different from the old/i.test(text))return 'اختر كلمة مرور مختلفة عن الحالية.';
  if(/password should be|weak password/i.test(text))return 'كلمة المرور ضعيفة. استخدم ستة أحرف على الأقل.';
  if(/sending (recovery|confirmation)? ?email|error sending/i.test(text))return 'تعذّر إرسال الرسالة الآن. حاول لاحقًا.';
  if(/expired|invalid.*(token|link)|otp/i.test(text))return 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.';
  return /[\u0600-\u06FF]/.test(text)?text:fallback;
}

export default function AuthScreen({admin=false,reset=false}:{admin?:boolean;reset?:boolean}){
  const [mode,setMode]=useState<'login'|'register'>(admin?'login':'register');
  const [forgot,setForgot]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [country,setCountry]=useState('');
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const switchMode=(next:'login'|'register')=>{setMode(next);setError('');setMessage('');setPassword('');setConfirm('')};
  async function submit(event:FormEvent){
    event.preventDefault();setError('');setMessage('');
    if(!authClient){setError('خدمة المصادقة غير متاحة حاليًا. يرجى المحاولة لاحقًا.');return}
    if(reset){
      if(password!==confirm){setError('كلمتا المرور غير متطابقتين.');return}
      setBusy(true);
      try{
        const {data:{session}}=await authClient.auth.getSession();
        if(!session)throw new Error('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.');
        const {error}=await authClient.auth.updateUser({password});
        if(error)throw error;
        await authClient.auth.signOut();
        setMessage('تم تغيير كلمة المرور. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.');
        setPassword('');setConfirm('');
      }catch(err){setError(authMessage(err,'تعذّر تغيير كلمة المرور. حاول مرة أخرى.'))}finally{setBusy(false)}
      return;
    }
    if(forgot){
      setBusy(true);
      try{
        const returnTo=admin?'admin':'home';
        const {error}=await authClient.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/reset-password?returnTo=${returnTo}`});
        if(error)throw error;
        setMessage('إذا كان البريد مرتبطًا بحساب، ستصلك رسالة تحتوي على رابط تغيير كلمة المرور.');
      }catch(err){setError(authMessage(err,'تعذّر إرسال رابط الاستعادة. حاول مرة أخرى.'))}finally{setBusy(false)}
      return;
    }
    if(admin&&mode!=='login'){setError('استخدم حسابًا إداريًا معتمدًا لتسجيل الدخول.');return}
    if(mode==='register'&&password!==confirm){setError('كلمتا المرور غير متطابقتين.');return}
    if(mode==='register'){
      const first=firstName.trim(), last=lastName.trim();
      if(!first||!last){setError('الاسم الأول والاسم الأخير مطلوبان.');return}
      if(!country){setError('اختر بلدك من قائمة البلدان.');return}
    }
    setBusy(true);
    try{
      if(mode==='register'){
        const {data,error}=await authClient.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+(admin?'/admin':'/'),data:{first_name:firstName.trim(),last_name:lastName.trim(),country}}});
        if(error)throw error;
        // The profile is attached right after the account is confirmed and the
        // user signs in; until then it waits in this browser only.
        try{sessionStorage.setItem('rabbani-profile-draft',JSON.stringify({firstName:firstName.trim(),lastName:lastName.trim(),country}))}catch{}
        if(!data.session)setMessage(admin?'افتح رسالة التأكيد في بريدك، ثم عُد إلى صفحة /admin لتسجيل الدخول بصلاحية المشرف.':'تم إرسال رسالة تأكيد إلى بريدك الإلكتروني. افتحها لتفعيل حسابك ثم سجّل الدخول، وسنكمل ملفك الشخصي مباشرة.');
      }else{
        const {error}=await authClient.auth.signInWithPassword({email:email.trim(),password});
        if(error)throw error;
      }
    }catch(err){setError(authMessage(err,'تعذّر إكمال العملية. حاول مرة أخرى.'))}finally{setBusy(false)}
  }
  return <main className="auth-page" dir="rtl">
    <div className="auth-shell">
      <section className="auth-form-side" aria-labelledby="auth-title">
        <div className="auth-logo"><span><img src="/brand/book-mark.svg" alt=""/></span><div><strong>الرَّبَّانِيُّون</strong><small>{admin?'بوابة إدارة المنصة':'على هدي الكتاب والسنة'}</small></div></div>
        <div className="auth-form-wrap">
          {admin&&<nav className="auth-role-switch" aria-label="اختيار الواجهة"><a href="/">واجهة المستخدم</a><a href="/admin" aria-current="page">دخول المشرف</a></nav>}
          <span className="auth-eyebrow">{reset?'استعادة الحساب':admin?'مدخل المشرفين':'مسيرتك تبدأ هنا'}</span>
          <h1 id="auth-title">{reset?'تعيين كلمة مرور جديدة':forgot?'نسيت كلمة المرور؟':admin?'دخول المشرف':mode==='register'?'أنشئ حسابك':'مرحبًا بعودتك'}</h1>
          <p className="auth-lead">{reset?'اختر كلمة مرور جديدة لحسابك.':forgot?'أدخل بريد حسابك وسنرسل إليك رابطًا لتغيير كلمة المرور.':admin?'سجّل بالبريد المخصص للإدارة. تُفعّل الصلاحية بعد تأكيد البريد والتحقق من اعتماده.':mode==='register'?'خطوة صغيرة اليوم، وأثر يبقى معك كل يوم.':'أكمل ما بدأت، وتابع خطواتك في العلم والعمل.'}</p>
          {!admin&&!forgot&&!reset&&<div className="auth-tabs" role="group" aria-label="طريقة الدخول"><button type="button" className={mode==='register'?'selected':''} aria-pressed={mode==='register'} onClick={()=>switchMode('register')}>إنشاء حساب</button><button type="button" className={mode==='login'?'selected':''} aria-pressed={mode==='login'} onClick={()=>switchMode('login')}>تسجيل الدخول</button></div>}
          <form className="auth-form" onSubmit={submit}>
            {mode==='register'&&!admin&&<>
              <fieldset className="auth-profile-fields">
                <legend>ملفك الشخصي</legend>
                <div className="auth-field-row">
                  <label htmlFor="auth-first-name">الاسم الأول</label>
                  <div className="auth-input"><UserRound size={18}/><input id="auth-first-name" value={firstName} onChange={e=>setFirstName(e.target.value)} autoComplete="given-name" placeholder="مثال: محمد" required/></div>
                </div>
                <div className="auth-field-row">
                  <label htmlFor="auth-last-name">الاسم الأخير</label>
                  <div className="auth-input"><UserRound size={18}/><input id="auth-last-name" value={lastName} onChange={e=>setLastName(e.target.value)} autoComplete="family-name" placeholder="مثال: أحمد" required/></div>
                </div>
                <div className="auth-field-row">
                  <label htmlFor="auth-country">البلد</label>
                  <CountrySelector id="auth-country" value={country} onChange={setCountry} required/>
                </div>
                <p className="auth-hint">تُحفظ هذه البيانات في حسابك وحده، ولا تظهر لغيرك. لا نشاركها مع أي جهة.</p>
              </fieldset>
            </>}
            {!reset&&<><label htmlFor="auth-email">البريد الإلكتروني</label><div className="auth-input"><Mail size={18}/><input id="auth-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" required dir="ltr"/></div></>}
            {!forgot&&<>
            <label htmlFor="auth-password">كلمة المرور</label><div className="auth-input"><LockKeyhole size={18}/><input id="auth-password" type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='register'||reset?'new-password':'current-password'} minLength={6} placeholder="ستة أحرف على الأقل" required dir="ltr"/><button type="button" aria-label={visible?'إخفاء كلمة المرور':'إظهار كلمة المرور'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
            {(mode==='register'||reset)&&<><label htmlFor="auth-confirm">تأكيد كلمة المرور</label><div className="auth-input"><LockKeyhole size={18}/><input id="auth-confirm" type={visible?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="أعد كتابة كلمة المرور" required dir="ltr"/></div></>}
            </>}
            {error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-success" role="status">{message}</p>}
            {!(reset&&message)&&<button className="auth-submit" type="submit" disabled={busy||!authClient}>{busy?'جارٍ المتابعة...':reset?'حفظ كلمة المرور':forgot?'إرسال رابط الاستعادة':mode==='register'?'إنشاء الحساب':'الدخول إلى حسابي'}<ArrowLeft size={18}/></button>}
          </form>
          {!reset&&((forgot||mode==='login')&&<button type="button" className="auth-text-action" onClick={()=>{setForgot(!forgot);setError('');setMessage('')}}>{forgot?'العودة إلى تسجيل الدخول':'نسيت كلمة المرور؟'}</button>)}
          {reset&&<a className="auth-text-action" href={new URLSearchParams(window.location.search).get('returnTo')==='admin'?'/admin':'/'}>العودة إلى تسجيل الدخول</a>}
          {!authClient&&<div className="auth-setup"><ShieldCheck size={19}/><p>خدمة المصادقة غير متاحة حاليًا؛ تسجيل الدخول وإنشاء الحسابات متوقفان.</p></div>}
        </div>
        <section className="auth-seo" aria-labelledby="auth-seo-title"><h2 id="auth-seo-title">الربانيون منصة للتعلم والعمل بالقرآن والسنة</h2><p>الربانيون منصة إسلامية للتعلم والعمل بالقرآن والسنة، وبناء الإيمان، وتعلم العقيدة، وتزكية النفس، والسير في منهج متدرج يجمع بين العلم والعمل.</p><nav aria-label="روابط المنصة"><a href="/about/">من نحن</a><a href="/library/">مكتبة الربانيون</a><a href="/quran/">القرآن الكريم</a><a href="/sunnah/">السنة النبوية</a><a href="/tazkiyah/">تزكية النفس</a><a href="/worship/">العبادات</a><a href="/daily-program/">برنامج يومي عملي للمسلم</a></nav></section>
        <p className="auth-foot">الرَّبَّانِيُّون · على هدي الكتاب والسنة</p>
      </section>
      <aside className="auth-story"><div className="auth-story-center"><div className="auth-brand-lockup"><img src="/brand/book-mark.svg" alt=""/><div className="auth-brand-copy"><strong>الرَّبَّانِيُّون</strong><span>علمٌ نافع، وعملٌ صالح، وقلبٌ خاشع.</span><small>على هدي الكتاب والسنة</small></div></div><p>مساحة تجمع العلم والعمل، وتعينك على الثبات في مسيرتك إلى الله.</p><blockquote className="auth-rabbani-verse"><p>﴿وَلَٰكِن كُونُوا رَبَّانِيِّينَ بِمَا كُنتُمْ تُعَلِّمُونَ الْكِتَابَ وَبِمَا كُنتُمْ تَدْرُسُونَ﴾</p><cite>سورة آل عمران، الآية ٧٩</cite></blockquote><p className="auth-rabbani-note">نتعلم كتاب الله ونعلمه، ونسعى أن يكون العلم طريقًا إلى العمل والصلاح.</p></div><div className="auth-story-bottom"><span>يومي مع الله</span><span>السير إلى الله</span><span>المؤمن القوي</span></div></aside>
    </div>
  </main>
}

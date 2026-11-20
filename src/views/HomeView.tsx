import {useEffect} from 'react';
import {BookOpen,BookMarked,CalendarClock,CalendarDays,Heart,Target,ChevronLeft,ArrowRight,Flower2,ShieldCheck,MonitorPlay,Compass} from 'lucide-react';
import {type View} from '../app-state';
import {type PrayerLocation} from '../prayer-location';
import HomeDashboard from './HomeDashboard';
import {type SectionId} from '../section-theme';

const menu:Array<{id:'day'|'week'|'month'|'goals'|'qibla';title:string;icon:typeof CalendarDays;desc:string;section:SectionId}>= [
  {id:'day',title:'يومي مع الله',icon:CalendarDays,desc:'خطوات اليوم ومواعيده',section:'daily'},
  {id:'week',title:'أسبوعي مع الله',icon:CalendarDays,desc:'خطة الأسبوع',section:'planning'},
  {id:'month',title:'شهري مع الله',icon:CalendarDays,desc:'أهداف الشهر',section:'planning'},
  {id:'goals',title:'المؤمن القوي',icon:Target,desc:'أهداف نافعة وخطوات عملية',section:'strong'},
  {id:'qibla',title:'اتجاه القبلة',icon:Compass,desc:'بوصلة القبلة واتجاه الكعبة',section:'daily'},
];

export default function HomeView({navigate,admin=false,prayers={},prayerLocation}:{navigate:(view:View)=>void;admin?:boolean;prayers?:Record<string,string>;prayerLocation?:PrayerLocation}) {
  // أثناء عرض الرئيسية: السكرول داخل المحتوى (widget) فقط، وليس على مستوى المنصة.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const content = document.querySelector('.content') as HTMLElement | null;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const prevContentOverflow = content?.style.overflow ?? '';
    const prevContentMaxH = content?.style.maxHeight ?? '';
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (content) {
      content.style.overflowY = 'auto';
      content.style.maxHeight = 'calc(100vh - 82px)';
      (content.style as any).webkitOverflowScrolling = 'touch';
    }
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      if (content) {
        content.style.overflowY = prevContentOverflow;
        content.style.maxHeight = prevContentMaxH;
      }
    };
  }, []);
  return <>
    <HomeDashboard prayers={prayers} prayerLocation={prayerLocation} navigate={navigate}/>
    <button className="home-today-entry" onClick={()=>navigate('tasks')}><CalendarClock size={22}/><span><strong>مهام اليوم</strong><small>اليوم · غدًا · المهام المتأخرة</small></span><ChevronLeft size={18}/></button>
    <section className="hero"><div className="hero-pattern"/><div className="hero-content"><span className="hero-tag"><Flower2 size={15}/> بسم الله الرحمن الرحيم</span><h1>أهلًا وسهلًا برفقاء الطريق في رحلتنا الربانية</h1><p className="hero-copy"><strong>إلى الله نمضي...</strong><span>ببصيرة العارفين، وعمل الصالحين، وعزيمة المجاهدين، وإحسان المحسنين.</span><span>رحلة علمٍ وإيمانٍ وعملٍ وإحسان.</span></p><button className="hero-btn" onClick={()=>navigate('day')}>ابدأ يومك <ArrowRight size={18}/></button></div><div className="hero-art"><div className="arch"><BookOpen size={64} strokeWidth={1.1}/><span>وَكُونُوا رَبَّانِيِّينَ</span></div></div></section>
    {admin&&<a className="home-admin-entry" href="/admin"><span className="home-admin-icon"><ShieldCheck size={22}/></span><span><strong>لوحة الإدارة</strong><small>إدارة المنهج والموارد</small></span><ChevronLeft size={18}/></a>}
    <div className="section-title"><div><span className="eyebrow">01 / تنظيم الحياة</span><h2>حياتي مع الله</h2><p>اجعل العبادة والعمل والأسرة والتعلم في خطة متوازنة.</p></div></div>
    <div className="feature-grid">{menu.map(m=><button key={m.id} data-section={m.section} className="feature-card" onClick={()=>navigate(m.id)}><span className="feature-icon"><m.icon size={24}/></span><strong>{m.title}</strong><span>{m.desc}</span><ChevronLeft className="feature-arrow" size={18}/></button>)}</div>
    <div className="section-title below"><div><span className="eyebrow">02 / العلم والتزكية</span><h2>نمضي بعلم وعمل</h2></div></div>
    <div className="large-grid"><button data-section="quran" className="wide-card" onClick={()=>navigate('quran')}><div className="wide-icon"><BookMarked size={28}/></div><div><h3>القرآن والسنة</h3><p>المصحف الشريف، حفظ القرآن ومراجعته، ومكتبة الصحيحين عند اعتماد مصدرها.</p><span className="inline-link">فتح القسم <ChevronLeft size={17}/></span></div></button><button data-section="haramain" className="wide-card" onClick={()=>navigate('haramain')}><div className="wide-icon"><MonitorPlay size={28}/></div><div><h3>من الحرمين الشريفين</h3><p>البث المباشر لصلوات الحرمين عبر قناتي القرآن الكريم والسنة النبوية، من مصدره الرسمي.</p><span className="inline-link">مشاهدة البث <ChevronLeft size={17}/></span></div></button><button data-section="accountability" className="wide-card" onClick={()=>navigate('reflect')}><div className="wide-icon"><Heart size={28}/></div><div><h3>حاسب نفسك</h3><p>محاسبة خاصة وأوراد تختارها بنفسك دون مقارنة أو درجات.</p><span className="inline-link">الدخول إلى القسم <ChevronLeft size={17}/></span></div></button></div>
    <div className="quote">«احرص على ما ينفعك، واستعن بالله ولا تعجز» <span>— صحيح مسلم</span></div>
  </>;
}

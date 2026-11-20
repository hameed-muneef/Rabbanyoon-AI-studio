import {useEffect,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight} from 'lucide-react';
import {savedBookPage,saveBookPage} from './reading-progress';

type BookPage={id:number;printed?:number|string;paragraphs?:string[]};
type BookText={pages:BookPage[]};

const BOOK_URL='/books/book-text.json';

// يُجلب نص الكتاب عند الطلب من /books بدل تضمينه في حزمة الأدوات، للخفة.
export default function BookReader({startPage=1}:{startPage?:number}) {
  const [book,setBook]=useState<BookText|null>(null);
  const [failed,setFailed]=useState(false);
  const [saveStatus,setSaveStatus]=useState('');
  const [pageState,setPageState]=useState<number|null>(null);
  useEffect(()=>{
    let active=true;
    fetch(BOOK_URL)
      .then(async response=>{
        if(!response.ok)throw new Error('Failed to load book text');
        const data=await response.json() as BookText;
        const storedPages=data?.pages;
        if(!Array.isArray(storedPages)||storedPages.length===0)throw new Error('Invalid book text');
        if(active)setBook({pages:storedPages});
      })
      .catch(()=>{if(active)setFailed(true)});
    return ()=>{active=false};
  },[]);
  if(!book)return <section className="book-reader station-book" aria-label="قراءة تعريف عام بدين الإسلام"><div className="panel-head"><BookOpen size={19}/><h3>تعريف عام بدين الإسلام</h3></div><p className="muted small">{failed?'تعذر تحميل نص الكتاب. تحقق من الاتصال ثم أعد تحديث الصفحة.':'جارٍ تحميل الكتاب…'}</p></section>;
  const pages=book.pages;
  const pageCount=pages.length;
  const savedPage=savedBookPage('general-islam-book',pageCount);
  const pageNumber=pageState??(savedPage??startPage);
  const current=pages.find(page=>page.id===pageNumber);
  const goToPage=(next:number)=>{if(Number.isInteger(next)&&next>=1&&next<=pageCount)setPageState(next)};
  const saveCurrent=()=>{if(saveBookPage('general-islam-book',pageNumber,pageCount))setSaveStatus('حُفظ موضع القراءة على هذا الجهاز.');else setSaveStatus('تعذّر حفظ الصفحة في هذا المتصفح.')};
  return <section className="book-reader station-book" aria-label="قراءة تعريف عام بدين الإسلام"><div className="panel-head"><BookOpen size={19}/><h3>تعريف عام بدين الإسلام</h3></div><p className="muted small">علي الطنطاوي · اقرأ الكتاب هنا، وانتقل بين صفحاته أو اكتب رقم الصفحة التي تريدها.</p>
    <div className="book-page-heading"><div><span className="eyebrow">قراءة داخل الموقع</span><h4>الصفحة {current?.printed??'—'} من المطبوع</h4></div><label className="book-jump">صفحة الكتاب<input type="number" min="1" max={pageCount} value={pageNumber} onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=1&&value<=pageCount)goToPage(value)}}/></label></div>
    <div className="book-page" lang="ar">{current?.paragraphs?.map((paragraph,index)=><p key={index}>{paragraph}</p>)??<p>تعذر تحميل نص هذه الصفحة.</p>}</div>
    <div className="book-controls"><button className="soft-btn" onClick={()=>goToPage(pageNumber-1)} disabled={pageNumber<=1}><ChevronRight size={17}/> السابقة</button><span>الصفحة {pageNumber.toLocaleString('ar-EG')} من {pageCount.toLocaleString('ar-EG')}</span><button className="soft-btn" onClick={()=>goToPage(pageNumber+1)} disabled={pageNumber>=pageCount}>التالية <ChevronLeft size={17}/></button></div>
    <div className="reading-bookmark"><button type="button" className="soft-btn" onClick={saveCurrent}>حفظ الصفحة الحالية</button>{savedPage&&<button type="button" className="reading-resume" onClick={()=>goToPage(savedPage)}>العودة إلى الصفحة المحفوظة: {savedPage.toLocaleString('ar-EG')}</button>}</div>{saveStatus&&<p className="reading-save-status" role="status">{saveStatus}</p>}
  </section>;
}

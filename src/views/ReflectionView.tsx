import {useState} from 'react';
import {PenLine,Flower2,ShieldCheck,Trash2} from 'lucide-react';
import {type View,today} from '../app-state';
import {uid} from '../id';

type Reflection={id:string;date:string;text:string};
type Props={reflections:Reflection[];onAdd:(text:string)=>void;onDelete:(id:string)=>void;navigate:(view:View)=>void};

// محاسبة النفس: مراجعات خاصة تُحفظ محليًا في متصفح المستخدم فقط.
export default function ReflectionView({reflections,onAdd,onDelete,navigate}:Props) {
  const [reflection,setReflection]=useState('');
  const save=()=>{if(!reflection.trim())return;onAdd(reflection.trim());setReflection('')};
  return <><div className="page-intro"><span className="eyebrow">حاسب نفسك</span><h1>وقفة مع النفس</h1><p>مراجعة هادئة خاصة بك؛ للتوبة والإصلاح وحفظ الحقوق، دون درجات أو مقارنة بالآخرين.</p></div><div className="switch-row"><button className="selected" onClick={()=>navigate('reflect')}><PenLine size={17}/> محاسبة النفس</button><button onClick={()=>navigate('wird')}><Flower2 size={17}/> زكِّ نفسك</button></div><section className="panel"><h3>ما الذي أريد أن أصلحه أو أحافظ عليه؟</h3><p className="muted small">يمكنك التفكير في حقوق الله وحقوق العباد، وما تعلمته وعملت به، وما يحتاج إلى توبة أو إصلاح.</p><textarea rows={6} placeholder="اكتب لنفسك فقط..." value={reflection} onChange={e=>setReflection(e.target.value)}/><div className="panel-actions"><button className="primary" onClick={save}><ShieldCheck size={17}/> حفظ خاص</button></div></section><section className="panel"><h3>مراجعاتي السابقة</h3>{reflections.length===0&&<p className="muted">لا توجد مراجعات محفوظة.</p>}{reflections.map(r=><div className="reflection-entry" key={r.id}><div><small>{r.date}</small><p>{r.text}</p></div><button className="icon-btn danger" aria-label="حذف المراجعة" onClick={()=>onDelete(r.id)}><Trash2 size={17}/></button></div>)}</section><div className="hint"><ShieldCheck size={17}/> تحفظ المراجعات حاليًا في متصفحك فقط، وليست مشفرة بتشفير طرفي. تجنب كتابة أسرار شديدة الحساسية في هذه النسخة التجريبية.</div></>;
}

export {type Reflection};
export const newReflection=(text:string)=>({id:uid(),date:today(),text});

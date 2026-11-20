import {useEffect,useState} from 'react';
import {Moon,Save} from 'lucide-react';
import type {DayRecords} from './day-tracking';

type Props={records:DayRecords;date:string;onRecords:(records:DayRecords)=>void};
export default function DayReview({records,date,onRecords}:Props){
  const record=records[date];
  const [gratitude,setGratitude]=useState(record?.review?.gratitude??'');
  const [improvement,setImprovement]=useState(record?.review?.improvement??'');
  const [saved,setSaved]=useState(false);
  useEffect(()=>{setGratitude(record?.review?.gratitude??'');setImprovement(record?.review?.improvement??'');setSaved(false)},[date,record?.review?.savedAt]);
  if(!record)return null;
  const dirty=gratitude!== (record.review?.gratitude??'') || improvement!==(record.review?.improvement??'');
  return <section className="day-review" aria-labelledby="day-review-title">
    <div className="day-review-heading"><span className="day-review-mark" aria-hidden="true">✧</span><div><span className="eyebrow">ختام اليوم</span><h3 id="day-review-title"><Moon size={19}/> وقفة مع النفس</h3></div></div>
    <p>تأمل ما مضى من يومك بهدوء. يمكنك كتابة ما تحب، وترك ما لا ترغب فيه.</p>
    <div className="day-review-fields"><label>ما الخير الذي وفّقك الله إليه اليوم؟<textarea rows={3} value={gratitude} onChange={e=>{setGratitude(e.target.value);setSaved(false)}} placeholder="نعمة تشكر الله عليها، أو عمل يسّره لك…"/></label><label>ما الذي تريد إصلاحه أو الاهتمام به غدًا؟<textarea rows={3} value={improvement} onChange={e=>{setImprovement(e.target.value);setSaved(false)}} placeholder="خطوة صغيرة تنوي أن تبدأ بها…"/></label></div>
    <div className="day-review-actions"><button className="primary" disabled={!dirty} onClick={()=>{onRecords({...records,[date]:{...record,review:{gratitude:gratitude.trim(),improvement:improvement.trim(),savedAt:new Date().toISOString()}}});setSaved(true)}}><Save size={16}/> حفظ وقفة اليوم</button>{saved && <span role="status">حُفظت وقفتك لهذا التاريخ.</span>}{record.review && !saved && !dirty && <span>محفوظة لهذا اليوم · يمكنك تعديلها متى شئت.</span>}</div>
    <small>هذه مساحة خاصة للتأمل، وليست درجة أو حكمًا على يومك. تُحفظ على هذا الجهاز مع سجل اليوم.</small>
  </section>;
}

import {useEffect,useRef} from 'react';
import {openingMessage} from './day-message';

export const resolveMessage = `### جدّد نيتك... واعقد العزم

ها أنت قد وضعت خطتك لهذا اليوم، وحددت ما ترجوه من خير لنفسك ودينك ودنياك.

ولكن تذكّر أن **الغاية ليست أن تملأ يومك بالمهام، بل أن تملأه بما يرضي الله، وأن تجعل من سعيك في هذه الأرض عبادةً تتقرب بها إليه.**

هذا اليوم من عمرك لن يعود، وما تفعله فيه سيبقى من عملك الذي تلقى الله به.

فاستحضر نيتك في صلاتك، وعلمك، وعملك، وسعيك لرزقك، ورعايتك لأهلك، وكل خير ترجوه.

واعلم أن الطريق يحتاج إلى صبر ومجاهدة؛ فقد تضعف همتك، أو تعترضك المشاغل، أو لا تنجز كل ما أردت.

**فلا تستسلم للفتور، ولا تيأس إن قصّرت، بل استعن بالله، وجاهد نفسك، وواصل السير بما تستطيع.**

قال رسول الله ﷺ:

**«احرص على ما ينفعك، واستعن بالله ولا تعجز»** — رواه مسلم.

وقبل أن تبدأ، قل بقلب حاضر:

*اللهم إني أعزم على أن أجعل يومي هذا في طاعتك ومرضاتك، فأصلح نيتي، وبارك في وقتي، وأعنّي على أداء حقوقك وحقوق عبادك، وارزقني الإخلاص والصبر والثبات، وتقبل مني صالح عملي.*

**والآن، اعقد العزم، وتوكل على الله، وابدأ.**`;

function inlineText(source:string) {
  return source.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:part.startsWith('*')&&part.endsWith('*')?<em key={index}>{part.slice(1,-1)}</em>:part);
}
export function MessageContent({text}:{text:string}) {
  return <div className="day-message-content">{text.trim().split(/\r?\n\s*\r?\n/).map((block,index)=>{
    const line=block.trim();
    if(line.startsWith('### '))return <h3 key={index}>{inlineText(line.slice(4))}</h3>;
    if(line.startsWith('## '))return <h3 key={index}>{inlineText(line.slice(3))}</h3>;
    if(line.startsWith('# '))return <h2 key={index}>{inlineText(line.slice(2))}</h2>;
    return <p key={index}>{inlineText(line)}</p>;
  })}</div>;
}
export default function DayMessage({kind,onClose}:{kind:'opening'|'resolve';onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close()},[kind]);
  return <dialog ref={dialog} className="day-message-dialog" aria-label={kind==='opening'?'رسالة قبل تخطيط اليوم':'رسالة بعد حفظ خطة اليوم'} onCancel={event=>{if(kind==='opening')event.preventDefault();else onClose()}}><div className="day-message-scroll"><MessageContent text={kind==='opening'?openingMessage:resolveMessage}/><div className="day-message-actions"><button className="primary" onClick={onClose}>{kind==='opening'?'ابدأ تخطيط يومك':'ابدأ متابعة اليوم'}</button></div></div></dialog>;
}

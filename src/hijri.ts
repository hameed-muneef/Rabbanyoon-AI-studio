// التاريخ الهجري وفق تقويم أم القرى، بحساب محلي كامل عبر Intl دون أي خدمة خارجية.
// ثبوت الشهر الرؤيتي قد يختلف بين البلدان؛ لذلك يعرض الهجري دائمًا بجوار الميلادي ولا يُعتمد عليه منفردًا.
const formatter=(()=>{
  try{return new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric'})}
  catch{return undefined}
})();
// يقبل كائن Date أو نصًا ميلاديًا بصيغة YYYY-MM-DD أو رقمًا زمنيًا، ويعيد نصًا عربيًا أو undefined عند التعذر.
export function hijriDate(date:Date|string|number=new Date()):string|undefined{
  try{
    const parsed=date instanceof Date?date:typeof date==='number'?new Date(date):new Date(`${date}T12:00:00`);
    if(!formatter||!Number.isFinite(parsed.getTime()))return undefined;
    return formatter.format(parsed);
  }catch{return undefined}
}

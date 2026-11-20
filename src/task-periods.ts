import {localDateKey} from './day-tracking';
import type {Task} from './app-state';

// تجدد القوائم الدورية: حالة التأشير تُقاس وفق مفتاح فترة المهمة، فتبدأ فترة جديدة دون تأشير سابق
// دون حذف التاريخ؛ سجلات المتابعة اليومية تحفظ حالتها لحظة الحفظ.
// مفتاح الفترة: اليومي = تاريخ اليوم، والأسبوعي = بداية الأسبوع المرتبطة به، والشهري = مفتاح الشهر.
export function taskInstanceKey(task:Task,now=new Date()):string|undefined{
  if(task.period==='daily')return localDateKey(now);
  if(task.period==='weekly')return task.weekStart||undefined;
  if(task.period==='monthly')return task.monthKey||undefined;
  return undefined;
}
// المهام القديمة دون فترة محددة تُعرض بحالتها المحفوظة كما هي، دون تجدد.
export function isTaskDone(task:Task,now=new Date()):boolean{
  const instance=taskInstanceKey(task,now);
  return instance===undefined?!!task.done:task.done===true&&task.doneKey===instance;
}
// عند التأشير يُثبت مفتاح الفترة الحالية؛ وعند بدء فترة جديدة تعود القائمة تلقائيًا دون تأشير.
export function markTaskDone(task:Task,done:boolean,now=new Date()):Task{
  return {...task,done,doneKey:done?taskInstanceKey(task,now):task.doneKey};
}

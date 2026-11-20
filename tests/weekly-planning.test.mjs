import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const asModule=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const goals=asModule(compile('../src/goal-plan.ts'));
const timing=asModule(compile('../src/day-timing.ts'));
const dayTracking=asModule(compile('../src/day-tracking.ts').replace("'./day-timing'",JSON.stringify(timing)));
const taskPeriods=asModule(compile('../src/task-periods.ts').replace("'./day-tracking'",JSON.stringify(dayTracking)));
const {weekDays,parseWeek,scheduleTask,weeklyTasksForDate,replacePeriodTasks,updateDayRecords,monthDays,scheduleMonthlyTask,moveMonthlyTask,monthlyTasksForDate,scheduledTasksForDate}=await import(asModule(compile('../src/weekly-planning.ts').replace("'./goal-plan'",JSON.stringify(goals)).replace("'./task-periods'",JSON.stringify(taskPeriods))));
const {taskInstanceKey,isTaskDone,markTaskDone}=await import(taskPeriods);
const task={id:'weekly',title:'زيارة',period:'weekly',done:false,optional:true};

test('monthly dates cover leap years, short months and invalid inputs',()=>{
  assert.equal(monthDays('2028-02').length,29);
  assert.equal(monthDays('2027-02').length,28);
  assert.equal(monthDays('2100-02').length,28);
  assert.equal(monthDays('2026-04').length,30);
  assert.equal(monthDays('2026-12').at(-1),'2026-12-31');
  for(const value of ['2026-00','2026-13','bad','2026-2'])assert.deepEqual(monthDays(value),[]);
});
test('daily planning includes both monthly and weekly tasks only on their exact date',()=>{
  const monthly=scheduleMonthlyTask({...task,id:'monthly',period:'monthly'},'2026-10','2026-10-24');
  const weekly=scheduleTask(task,parseWeek('2026-W43'),'2026-10-24');
  const tasks=[monthly,weekly,scheduleMonthlyTask({...monthly,id:'no-day'},'2026-10'),{...monthly,id:'legacy',monthKey:undefined}];
  assert.deepEqual(scheduledTasksForDate(tasks,'2026-10-24'),[weekly,monthly]);
  assert.equal(monthlyTasksForDate(tasks,'2027-10-24').length,0);
  assert.deepEqual(monthlyTasksForDate(JSON.parse(JSON.stringify(tasks)),'2026-10-24'),[monthly]);
  assert.equal(scheduleMonthlyTask(monthly,'2026-02','2026-02-30').scheduledDate,undefined);
});
test('moving monthly tasks preserves valid days and clears nonexistent ones',()=>{
  const monthly=scheduleMonthlyTask({...task,period:'monthly'},'2026-01','2026-01-31');
  assert.equal(moveMonthlyTask(monthly,'2026-03').scheduledDate,'2026-03-31');
  assert.equal(moveMonthlyTask(monthly,'2026-02').scheduledDate,undefined);
  const leap={...monthly,monthKey:'2028-02',scheduledDate:'2028-02-29'};
  assert.equal(moveMonthlyTask(leap,'2029-02').scheduledDate,undefined);
});
test('monthly completion sync preserves other months, periods and historical snapshots',()=>{
  const monthly=scheduleMonthlyTask({...task,id:'monthly',period:'monthly'},'2026-10','2026-10-24');
  const next=moveMonthlyTask({...monthly,id:'next'},'2026-11');
  const history={date:'2026-09-24',items:[{id:'extra:monthly',status:'pending'}]};
  const state={tasks:[task,monthly,next],dayRecords:{'2026-09-24':history,'2026-10-24':{date:'2026-10-24',items:[{id:'extra:monthly',status:'pending'}]}}};
  const changed=replacePeriodTasks(state,'monthly',[{...monthly,done:true,doneKey:'2026-10'},next]);
  assert.equal(changed.tasks.length,3);
  assert.equal(changed.tasks.find(t=>t.id==='weekly'),task);
  assert.equal(changed.tasks.find(t=>t.id==='next'),next);
  assert.equal(changed.dayRecords['2026-10-24'].items[0].status,'done');
  // تأشير بمفتاح فترة آخر لا يغيّر سجل هذا اليوم (المصدر هو تأشير الشهر المختار)
  assert.equal(replacePeriodTasks(state,'monthly',[{...monthly,done:true,doneKey:'2026-09'},next]).dayRecords['2026-10-24'].items[0].status,'pending');
  assert.equal(changed.dayRecords['2026-09-24'],history);
  const updated=updateDayRecords(state,changed.dayRecords);
  assert.equal(updated.tasks.find(t=>t.id==='monthly').done,true);
  assert.equal(updated.tasks.find(t=>t.id==='next').done,false);
});

test('numbered weeks handle ISO year boundaries and valid week 53',()=>{
  assert.equal(parseWeek('2026-W53'),'2026-12-28');
  assert.deepEqual(weekDays(parseWeek('2026-W53')),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(parseWeek('2027-W01'),'2027-01-04');
  for(const invalid of ['2025-W53','2026-W00','2026-W54','bad','2026-W1'])assert.equal(parseWeek(invalid),undefined);
});
test('only tasks explicitly scheduled on the matching date appear in daily planning',()=>{
  const start=parseWeek('2026-W43');
  const scheduled=scheduleTask(task,start,'2026-10-24');
  const tasks=[scheduled,scheduleTask({...task,id:'no-day'},start),{...task,id:'legacy'},scheduleTask({...task,id:'tomorrow'},start,'2026-10-25')];
  assert.deepEqual(weeklyTasksForDate(tasks,'2026-10-24'),[scheduled]);
  assert.equal(weeklyTasksForDate(tasks,'2027-10-24').length,0);
  assert.equal(scheduleTask(task,start,'2026-10-30').scheduledDate,undefined);
  assert.deepEqual(weeklyTasksForDate(JSON.parse(JSON.stringify(tasks)),'2026-10-24'),[scheduled]);
});
test('editing any period preserves tasks in every other period and other weeks',()=>{
  const other=scheduleTask({...task,id:'next'},parseWeek('2026-W44'));
  const state={tasks:[{...task,id:'daily',period:'daily'},task,other,{...task,id:'monthly',period:'monthly'}]};
  const changed=replacePeriodTasks(state,'weekly',[{...task,done:true},other]);
  assert.equal(changed.tasks.length,4);
  assert.equal(changed.tasks.find(t=>t.id==='daily'),state.tasks[0]);
  assert.equal(changed.tasks.find(t=>t.id==='next'),other);
  assert.equal(replacePeriodTasks(changed,'monthly',[]).tasks.length,3);
  assert.equal(state.tasks[1].done,false);
});
test('weekly and daily completion stay linked without rewriting other dates',()=>{
  const scheduled=scheduleTask(task,parseWeek('2026-W43'),'2026-10-24');
  const previous={date:'2026-10-23',items:[{id:'extra:weekly',status:'pending'}]};
  const state={tasks:[scheduled],dayRecords:{'2026-10-23':previous,'2026-10-24':{date:'2026-10-24',items:[{id:'extra:weekly',status:'pending'}]}}};
  const changed=replacePeriodTasks(state,'weekly',[{...scheduled,done:true,doneKey:parseWeek('2026-W43')}]);
  assert.equal(changed.dayRecords['2026-10-24'].items[0].status,'done');
  assert.equal(changed.dayRecords['2026-10-23'],previous);
  const updated=updateDayRecords(changed,{...changed.dayRecords,'2026-10-24':{...changed.dayRecords['2026-10-24'],items:[{id:'extra:weekly',status:'deferred'}]}});
  assert.equal(updated.tasks[0].done,false);
  const moved={...state,tasks:[scheduleTask(scheduled,parseWeek('2026-W44'),'2026-10-31')]};
  assert.equal(updateDayRecords(moved,changed.dayRecords).tasks[0].done,false);
});
test('daily lists renew each day: yesterday’s checkmark no longer shows as done',()=>{
  const daily={id:'daily',title:'أذكار الصباح',period:'daily',done:true,doneKey:'2026-10-23',optional:true};
  assert.equal(taskInstanceKey(daily,new Date(2026,9,23,10,0)),'2026-10-23');
  assert.equal(isTaskDone(daily,new Date(2026,9,23,10,0)),true);
  // فترة جديدة تبدأ دون تأشير، دون تغيير في التخزين
  assert.equal(isTaskDone(daily,new Date(2026,9,24,10,0)),false);
  const remade=markTaskDone(daily,true,new Date(2026,9,24,10,0));
  assert.equal(remade.doneKey,'2026-10-24');
  assert.equal(isTaskDone(remade,new Date(2026,9,24,10,0)),true);
  assert.equal(daily.doneKey,'2026-10-23');
  assert.equal(isTaskDone(markTaskDone(daily,false,new Date(2026,9,24,10,0))),false);
});
test('weekly and monthly tasks stay anchored to their assigned period',()=>{
  const weekStart=parseWeek('2026-W43');
  const weekly={...task,weekStart,done:true,doneKey:weekStart};
  assert.equal(taskInstanceKey(weekly),weekStart);
  assert.equal(isTaskDone(weekly),true);
  // النقل إلى أسبوع آخر يعني فرصة أخرى دون التأشير
  assert.equal(isTaskDone(scheduleTask(weekly,parseWeek('2026-W44'))),false);
  const monthly={...task,period:'monthly',monthKey:'2026-10',done:true,doneKey:'2026-10'};
  assert.equal(taskInstanceKey(monthly),'2026-10');
  assert.equal(isTaskDone(monthly),true);
  assert.equal(isTaskDone(scheduleMonthlyTask(monthly,'2026-11')),false);
  // مهام قديمة دون فترة تُعرض بحالتها المحفوظة دون تجدد
  const legacy={...task,id:'legacy',weekStart:undefined,done:true};
  assert.equal(isTaskDone(legacy),true);
  assert.equal(isTaskDone({...legacy,done:false}),false);
});
test('tracking a scheduled weekly task records its own period key',()=>{
  const scheduled=scheduleTask(task,parseWeek('2026-W43'),'2026-10-24');
  const state={tasks:[scheduled],dayRecords:{'2026-10-24':{date:'2026-10-24',items:[{id:'extra:weekly',status:'pending'}]}}};
  const updated=updateDayRecords(state,{...state.dayRecords,'2026-10-24':{...state.dayRecords['2026-10-24'],items:[{id:'extra:weekly',status:'done'}]}});
  const doneTask=updated.tasks[0];
  assert.equal(doneTask.done,true);
  assert.equal(doneTask.doneKey,parseWeek('2026-W43'));
  assert.equal(isTaskDone(doneTask),true);
});

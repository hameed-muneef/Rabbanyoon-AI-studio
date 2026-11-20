import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/goal-plan.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {goalPeriodKey,goalPeriodLabel,goalIsoWeek,goalWeekKey,goalWeeksInYear,goalSteps,stepsForPeriod,daysToGoal,goalStepDueDate,formatGoalDate,isGoalDateInRange,goalStepOccurrence}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('daily, Monday-based weekly, and monthly progress keys roll over correctly',()=>{
  const sunday=new Date(2026,9,25,12),monday=new Date(2026,9,26,12);
  assert.equal(goalPeriodKey('daily',sunday),'2026-10-25');
  assert.equal(goalPeriodKey('daily',monday),'2026-10-26');
  assert.equal(goalPeriodKey('weekly',sunday),'2026-10-19');
  assert.equal(goalPeriodKey('weekly',monday),'2026-10-26');
  assert.equal(goalPeriodKey('monthly',monday),'2026-10');
  assert.equal(goalPeriodKey('monthly',new Date(2026,10,1,12)),'2026-11');
  assert.equal(goalPeriodKey('yearly',new Date(2026,11,31,12)),'2026');
  assert.equal(goalPeriodKey('yearly',new Date(2027,0,1,12)),'2027');
});
test('period cards collect only matching steps across goals, including saved legacy goals',()=>{
  const goals=[{id:'a',title:'العلم',benefit:'النفع',steps:[{id:'a1',title:'قراءة',period:'daily',done:{}},{id:'a2',title:'إنهاء كتاب',period:'yearly',done:{'2026':true}}]},{id:'b',title:'الصحة',benefit:'القوة',steps:[{id:'b1',title:'رياضة',period:'daily',done:{}}]},{id:'old',title:'قديم',benefit:'خير',action:'مراجعة',period:'weekly'}];
  assert.deepEqual(stepsForPeriod(goals,'daily').map(item=>[item.goalTitle,item.step.title]),[['العلم','قراءة'],['الصحة','رياضة']]);
  assert.deepEqual(stepsForPeriod(goals,'weekly').map(item=>item.step.title),['مراجعة']);
  assert.equal(stepsForPeriod(goals,'monthly').length,0);
  assert.equal(stepsForPeriod(goals,'yearly')[0].step.done['2026'],true);
});
test('existing goals keep their action as a first plan step',()=>{
  assert.deepEqual(goalSteps({id:'old',title:'تعلم',benefit:'النفع',action:'قراءة يومية',period:'daily'}),[{id:'legacy-old',title:'قراءة يومية',period:'daily',done:{}}]);
});
test('custom date steps are one-time, use local calendar dates, and keep their completion history when edited',()=>{
  const step={id:'once',title:'قراءة فصل',period:'custom',customDate:'2026-10-31',done:{'2026-10-30':true}};
  assert.equal(goalPeriodKey(step.period,new Date(2026,9,31,23),step.customDate),'2026-10-31');
  assert.equal(goalStepDueDate(step,new Date(2026,10,1,0)),'2026-10-31');
  assert.match(formatGoalDate(step.customDate),/أكتوبر/);
  assert.equal(goalPeriodLabel('custom',step.customDate),formatGoalDate(step.customDate));
  const edited={...step,customDate:'2026-11-02'};
  assert.deepEqual(edited.done,{'2026-10-30':true});
  assert.equal(goalStepDueDate(edited),'2026-11-02');
  assert.equal(stepsForPeriod([{id:'g',title:'هدف',benefit:'',steps:[step]}],'custom').length,1);
});
test('daily incomplete goal steps carry forward until completion or the inclusive deadline',()=>{
  const goal={id:'active',createdAt:'2026-10-31',targetDate:'2026-11-05'};
  const step={id:'daily',title:'قراءة',period:'daily',done:{}};
  for(const date of ['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05'])assert.equal(goalStepOccurrence(goal,step,date),true,date);
  assert.equal(goalStepOccurrence(goal,step,'2026-11-06'),false);
  const completed={...step,done:{'2026-11-02':true}};
  assert.equal(goalStepOccurrence(goal,completed,'2026-11-03'),false);
  assert.equal(goalStepOccurrence({...goal,createdAt:'2026-11-01'},step,'2026-10-31'),false);
});
test('custom and recurring occurrences stay inside the inclusive goal date range',()=>{
  const goal={id:'bounded',createdAt:'2026-10-31',targetDate:'2026-11-05'};
  const custom={id:'custom',title:'موعد',period:'custom',customDate:'2026-11-05',done:{}};
  assert.equal(goalStepOccurrence(goal,custom,'2026-11-05'),true);
  assert.equal(isGoalDateInRange(goal,'2026-10-30'),false);
  assert.equal(isGoalDateInRange(goal,'2026-11-06'),false);
  const weekly={id:'weekly',title:'أسبوعي',period:'weekly',done:{}};
  assert.equal(goalStepOccurrence(goal,weekly,'2026-11-01'),true);
  assert.equal(goalStepOccurrence(goal,weekly,'2026-11-08'),false);
  const monthlyGoal={...goal,createdAt:'2026-10-01',targetDate:'2026-10-31'};
  const monthly={id:'monthly',title:'شهري',period:'monthly',done:{}};
  assert.equal(goalStepOccurrence(monthlyGoal,monthly,'2026-10-31'),true);
  assert.equal(goalStepOccurrence(monthlyGoal,monthly,'2026-11-30'),false);
});
test('deadline counts calendar days, including same day and overdue',()=>{
  const now=new Date(2026,9,23,23,30);
  assert.equal(daysToGoal('2026-10-23',now),0);
  assert.equal(daysToGoal('2026-10-26',now),3);
  assert.equal(daysToGoal('2026-10-22',now),-1);
});
test('history labels use Arabic month names and ISO week numbers across years',()=>{
  assert.match(goalPeriodLabel('monthly','2026-10'),/أكتوبر/);
  assert.match(goalPeriodLabel('daily','2026-10-22'),/أكتوبر/);
  assert.match(goalPeriodLabel('weekly','2026-10-19'),/٤٣/);
  assert.match(goalPeriodLabel('weekly','2025-12-29'),/١.*٢٠٢٦/);
});
test('week selector uses ISO weeks, including a week that belongs to the next year',()=>{
  assert.deepEqual(goalIsoWeek('2025-12-29'),{year:2026,week:1});
  assert.equal(goalWeekKey(2026,1),'2025-12-29');
  assert.equal(goalWeeksInYear(2025),52);
  assert.equal(goalWeeksInYear(2026),53);
});

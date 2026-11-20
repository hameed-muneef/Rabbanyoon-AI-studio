export type GoalPeriod='daily'|'weekly'|'monthly'|'yearly'|'custom';
export const goalPeriods:GoalPeriod[]=['daily','weekly','monthly','yearly','custom'];
export type GoalStep={id:string;title:string;period:GoalPeriod;done:Record<string,boolean>;customDate?:string};
export type Goal={id:string;title:string;benefit:string;targetDate?:string;createdAt?:string;steps?:GoalStep[];action?:string;period?:GoalPeriod};
export function localGoalDate(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function goalPeriodKey(period:GoalPeriod,now=new Date(),customDate?:string){
  if(period==='custom')return customDate??'';
  if(period==='daily')return localGoalDate(now);
  if(period==='monthly')return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if(period==='yearly')return String(now.getFullYear());
  const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  return localGoalDate(monday);
}
export function goalPeriodLabel(period:GoalPeriod,key:string){
  if(period==='custom')return formatGoalDate(key);
  if(period==='yearly')return `سنة ${Number(key).toLocaleString('ar-EG',{useGrouping:false})}`;
  const date=new Date(`${period==='monthly'?`${key}-01`:key}T12:00:00`);
  if(Number.isNaN(date.getTime()))return key;
  if(period==='monthly')return new Intl.DateTimeFormat('ar-EG',{calendar:'gregory',month:'long',year:'numeric'}).format(date);
  if(period==='daily')return new Intl.DateTimeFormat('ar-EG',{calendar:'gregory',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
  const thursday=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  thursday.setDate(thursday.getDate()+3-((thursday.getDay()+6)%7));
  const firstThursday=new Date(thursday.getFullYear(),0,4);
  firstThursday.setDate(firstThursday.getDate()+3-((firstThursday.getDay()+6)%7));
  const week=Math.round((thursday.getTime()-firstThursday.getTime())/604800000)+1;
  return `الأسبوع ${week.toLocaleString('ar-EG')} من ${thursday.getFullYear().toLocaleString('ar-EG',{useGrouping:false})} · يبدأ ${new Intl.DateTimeFormat('ar-EG',{calendar:'gregory',day:'numeric',month:'long'}).format(date)}`;
}
export function formatGoalDate(key:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return key;
  const [year,month,day]=key.split('-').map(Number);
  const date=new Date(year,month-1,day,12);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return key;
  return new Intl.DateTimeFormat('ar-EG',{calendar:'gregory',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
}
export function goalStepDueDate(step:GoalStep,now=new Date()){
  if(step.period==='custom')return step.customDate??'';
  if(step.period==='daily')return localGoalDate(now);
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  if(step.period==='weekly')date.setDate(date.getDate()+(7-date.getDay())%7);
  else if(step.period==='monthly')date.setDate(new Date(date.getFullYear(),date.getMonth()+1,0).getDate());
  else date.setMonth(11,31);
  return localGoalDate(date);
}
export function isGoalDateInRange(goal:Goal,date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const [year,month,day]=date.split('-').map(Number);
  const parsed=new Date(year,month-1,day,12);
  if(parsed.getFullYear()!==year||parsed.getMonth()!==month-1||parsed.getDate()!==day)return false;
  return (!goal.createdAt||date>=goal.createdAt)&&(!goal.targetDate||date<=goal.targetDate);
}
export function goalStepOccurrence(goal:Goal,step:GoalStep,date:string){
  if(!isGoalDateInRange(goal,date))return false;
  if(step.period==='custom')return step.customDate===date&&!goalStepCompleted(step);
  if(step.period==='daily')return !goalStepCompleted(step);
  const current=new Date(`${date}T12:00:00`);
  const periodKey=goalPeriodKey(step.period,current);
  const scheduled=goalStepDueDate(step,current);
  return scheduled===date&&!step.done[periodKey];
}
export function goalStepCompleted(step:GoalStep){return (step.period==='daily'||step.period==='custom')&&Object.values(step.done).some(Boolean)}
export function goalStepCompletionKey(step:GoalStep,completedOn=new Date()){
  return step.period==='daily'||step.period==='custom'?localGoalDate(completedOn):goalPeriodKey(step.period,completedOn);
}
export function goalIsoWeek(key:string){
  const date=new Date(`${key}T12:00:00`);
  if(Number.isNaN(date.getTime()))return {year:0,week:0};
  const thursday=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  thursday.setUTCDate(thursday.getUTCDate()+3-((thursday.getUTCDay()+6)%7));
  const firstThursday=new Date(Date.UTC(thursday.getUTCFullYear(),0,4));
  firstThursday.setUTCDate(firstThursday.getUTCDate()+3-((firstThursday.getUTCDay()+6)%7));
  return {year:thursday.getUTCFullYear(),week:Math.round((thursday.getTime()-firstThursday.getTime())/604800000)+1};
}
export function goalWeekKey(year:number,week:number){
  const firstMonday=new Date(Date.UTC(year,0,4));
  firstMonday.setUTCDate(firstMonday.getUTCDate()-((firstMonday.getUTCDay()+6)%7)+(week-1)*7);
  return firstMonday.toISOString().slice(0,10);
}
export function goalWeeksInYear(year:number){return goalIsoWeek(goalWeekKey(year,53)).year===year?53:52}
export function stepsForPeriod(goals:Goal[],period:GoalPeriod){
  return goals.flatMap(goal=>goalSteps(goal).filter(step=>step.period===period).map(step=>({goalId:goal.id,goalTitle:goal.title,step})));
}
export function goalSteps(goal:Goal):GoalStep[]{
  if(goal.steps)return goal.steps;
  return goal.action?[{id:`legacy-${goal.id}`,title:goal.action,period:goal.period??'daily',done:{}}]:[];
}
export function daysToGoal(targetDate:string,now=new Date()){
  const target=new Date(`${targetDate}T12:00:00`);
  if(Number.isNaN(target.getTime()))return null;
  const current=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  return Math.round((target.getTime()-current.getTime())/86400000);
}

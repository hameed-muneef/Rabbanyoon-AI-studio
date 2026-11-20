import type {Period,State,Task} from './app-state';
import type {DayRecords} from './day-tracking';
import {isTaskDone,markTaskDone} from './task-periods';
import {goalWeekKey,goalWeeksInYear} from './goal-plan';

export function weekDays(weekStart:string):string[]{
  const start=new Date(`${weekStart}T00:00:00Z`);
  if(Number.isNaN(start.getTime()))return [];
  return Array.from({length:7},(_,index)=>{
    const date=new Date(start);date.setUTCDate(start.getUTCDate()+index);
    return date.toISOString().slice(0,10);
  });
}
export function parseWeek(value:string):string|undefined{
  const match=/^(\d{4})-W(\d{2})$/.exec(value);
  if(!match)return undefined;
  const year=Number(match[1]),week=Number(match[2]);
  return year>=1970&&year<=9998&&week>=1&&week<=goalWeeksInYear(year)?goalWeekKey(year,week):undefined;
}
export function scheduleTask(task:Task,weekStart:string,scheduledDate?:string):Task{
  return {...task,weekStart,scheduledDate:scheduledDate&&weekDays(weekStart).includes(scheduledDate)?scheduledDate:undefined};
}
export function weeklyTasksForDate(tasks:Task[],date:string):Task[]{
  return tasks.filter(task=>task.period==='weekly'&&task.scheduledDate===date&&!!task.weekStart&&weekDays(task.weekStart).includes(date));
}
export function monthDays(monthKey:string):string[]{
  const match=/^(\d{4})-(\d{2})$/.exec(monthKey);
  if(!match)return [];
  const year=Number(match[1]),month=Number(match[2]);
  if(year<1970||year>9998||month<1||month>12)return [];
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  return Array.from({length:count},(_,i)=>`${monthKey}-${String(i+1).padStart(2,'0')}`);
}
export function scheduleMonthlyTask(task:Task,monthKey:string,scheduledDate?:string):Task{
  return {...task,monthKey,scheduledDate:scheduledDate&&monthDays(monthKey).includes(scheduledDate)?scheduledDate:undefined};
}
export function moveMonthlyTask(task:Task,monthKey:string):Task{
  const date=task.scheduledDate?`${monthKey}-${task.scheduledDate.slice(-2)}`:undefined;
  // A missing day (e.g. February 31) stays unassigned, never silently moves dates.
  return scheduleMonthlyTask(task,monthKey,date);
}
export function monthlyTasksForDate(tasks:Task[],date:string):Task[]{
  return tasks.filter(task=>task.period==='monthly'&&task.scheduledDate===date&&!!task.monthKey&&monthDays(task.monthKey).includes(date));
}
export function scheduledTasksForDate(tasks:Task[],date:string):Task[]{
  return [...weeklyTasksForDate(tasks,date),...monthlyTasksForDate(tasks,date)];
}
// A period editor receives a subset: never replace all periods with that subset.
export function replacePeriodTasks(state:State,period:Period,tasks:Task[]):State{
  const dayRecords={...state.dayRecords};
  for(const task of tasks){
    const date=task.scheduledDate;
    if((period!=='weekly'&&period!=='monthly')||!date||!dayRecords[date])continue;
    const previous=state.tasks.find(item=>item.id===task.id);
    if(previous&&isTaskDone(previous)===isTaskDone(task))continue;
    dayRecords[date]={...dayRecords[date],items:dayRecords[date].items.map(item=>item.id===`extra:${task.id}`?{...item,status:isTaskDone(task)?'done':'pending'}:item)};
  }
  return {...state,tasks:[...state.tasks.filter(task=>task.period!==period),...tasks],dayRecords};
}
export function updateDayRecords(state:State,dayRecords:DayRecords):State{
  return {...state,dayRecords,tasks:state.tasks.map(task=>{
    if((task.period!=='weekly'&&task.period!=='monthly')||!task.scheduledDate)return task;
    const entry=dayRecords[task.scheduledDate]?.items.find(item=>item.id===`extra:${task.id}`);
    const previous=state.dayRecords?.[task.scheduledDate]?.items.find(item=>item.id===`extra:${task.id}`);
    return entry&&entry.status!==previous?.status?markTaskDone(task,entry.status==='done'):task;
  })};
}

import {uid} from './id';
import type {Task} from './app-state';

// تحويل مهام برنامج حلقة (TAW-007) إلى مهام شخصية (INT-003) مع منع الازدواج:
// - كل مهمة برنامج تحمل مفتاح مصدر (group/revision/position).
// - المهام المستوردة مسبقًا (نفس المفتاح) لا تُكرَّر.
// - لا يُمس محاسبة المستخدم (reflections) ولا مهامه الحالية.
export type ProgramTask={group_id:string;revision:number;position:number;title:string;cadence:'daily'|'weekly'|'monthly';source_note?:string};

export function importedTaskKeys(tasks:Task[]):Set<string>{
  const keys=new Set<string>();
  for(const task of tasks){
    if(task.source) keys.add(`${task.source.groupId}:${task.source.revision}:${task.source.position}`);
  }
  return keys;
}

export function buildImportedTasks(existing:Task[], incoming:ProgramTask[]):Task[]{
  const keys=importedTaskKeys(existing);
  const result:Task[]=[];
  for(const pt of incoming){
    const key=`${pt.group_id}:${pt.revision}:${pt.position}`;
    if(keys.has(key)) continue;
    keys.add(key);
    result.push({
      id: uid(),
      title: pt.source_note? `${pt.title} — ${pt.source_note}`: pt.title,
      period: pt.cadence,
      done: false,
      optional: true,
      source: {groupId:pt.group_id, revision:pt.revision, position:pt.position},
    });
  }
  return result;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const asModule=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const timing=asModule(compile('../src/day-timing.ts'));
const {createDayRecord,setTrackedStatus,localDateKey,setPrayerStatus,prayerNames,prayerStatusLabels}=await import(asModule(compile('../src/day-tracking.ts').replace("'./day-timing'",JSON.stringify(timing))));
const slots=[{id:'before',title:'قبل الفجر'},{id:'fajr',title:'الفجر',prayer:true},{id:'night',title:'بعد العشاء'}];
const plan=()=>({activities:{before:[{id:'a',title:'قيام'}],night:[{id:'b',title:'أسرة'},{id:'c',title:'قراءة'}]},completed:{}});
const anchors={'الفجر':'05:00','العشاء':'19:00'};

test('snapshot includes activities and extra work, without prayer completion scores',()=>{
  const result=createDayRecord('2026-10-23',slots,plan(),anchors,[{id:'x',title:'هدف'}]);
  assert.equal(result.items.length,4);
  assert.deepEqual(result.items.map(i=>i.title),['قيام','أسرة','قراءة','هدف']);
  assert.equal(result.items[0].start,'04:30');
  assert.equal(result.items[1].end,'19:50');
  assert.equal(result.items[3].start,'');
  assert.ok(result.items.every(i=>i.status==='pending'));
});
test('editing template cannot mutate a saved day; refreshing today keeps statuses',()=>{
  const template=plan();
  const original=createDayRecord('2026-10-23',slots,template,anchors,[]);
  const records=setTrackedStatus({'2026-10-23':original},'2026-10-23','night:b','done');
  template.activities.night[0].duration=60;
  template.activities.night[0].title='أسرة وتواصل';
  assert.equal(original.items[1].title,'أسرة');
  assert.equal(original.items[1].duration,30);
  const updated=createDayRecord('2026-10-23',slots,template,anchors,[],records['2026-10-23']);
  assert.equal(updated.items[1].status,'done');
  assert.equal(updated.items[2].start,'20:20');
  assert.equal(updated.items.length,3);
});
test('new date starts pending with its own timings and history survives serialization',()=>{
  const yesterday=createDayRecord('2026-10-23',slots,plan(),anchors,[]);
  const records=setTrackedStatus({'2026-10-23':yesterday},'2026-10-23','night:b','deferred');
  const today=createDayRecord('2026-10-24',slots,plan(),{...anchors,'العشاء':'19:10'},[],records['2026-10-23']);
  assert.equal(today.items[1].status,'pending');
  assert.equal(today.items[1].start,'19:30');
  const restored=JSON.parse(JSON.stringify({...records,'2026-10-24':today}));
  assert.equal(restored['2026-10-23'].items[1].status,'deferred');
  assert.equal(restored['2026-10-23'].items[1].start,'19:20');
});
test('status changes are immutable and deferred can return to pending',()=>{
  const record=createDayRecord('2026-10-23',slots,plan(),anchors,[]);
  const records={'2026-10-23':record};
  const deferred=setTrackedStatus(records,'2026-10-23','before:a','deferred');
  assert.equal(record.items[0].status,'pending');
  assert.equal(deferred['2026-10-23'].items[0].status,'deferred');
  assert.equal(setTrackedStatus(deferred,'2026-10-23','before:a','pending')['2026-10-23'].items[0].status,'pending');
  assert.equal(setTrackedStatus(records,'2026-10-22','before:a','done'),records);
});
test('midnight activities sort after evening and missing times sort last',()=>{
  const result=createDayRecord('2026-10-23',slots,plan(),{'الفجر':'05:00','العشاء':'23:30'},[]);
  assert.deepEqual(result.items.map(i=>i.start),['04:30','23:50','00:20']);
  assert.equal(result.items[2].startDay,'اليوم التالي');
  assert.equal(localDateKey(new Date(2026,9,23,0,1)),'2026-10-23');
});
test('end-of-day review stays with its date when today’s plan is refreshed',()=>{
  const original=createDayRecord('2026-10-23',slots,plan(),anchors,[]);
  original.review={gratitude:'صلة الأهل',improvement:'قراءة القرآن',savedAt:'2026-10-23T20:00:00.000Z'};
  const refreshed=createDayRecord('2026-10-23',slots,plan(),anchors,[],original);
  assert.deepEqual(refreshed.review,original.review);
  const nextDay=createDayRecord('2026-10-24',slots,plan(),anchors,[],original);
  assert.equal(nextDay.review,undefined);
});
test('every supported prayer has the documented statuses',()=>{
  assert.deepEqual(prayerNames,['الفجر','الظهر','العصر','المغرب','العشاء']);
  assert.deepEqual(Object.keys(prayerStatusLabels),['ontime','late','excused','missed']);
});
test('prayer status creates its own record and re-clicking the status returns to unknown',()=>{
  const records=setPrayerStatus({},'2026-10-23','الفجر','ontime');
  assert.deepEqual(records['2026-10-23'].prayers,{'الفجر':'ontime'});
  assert.deepEqual(records['2026-10-23'].items,[]);
  const changed=setPrayerStatus(records,'2026-10-23','الفجر','late');
  assert.equal(changed['2026-10-23'].prayers['الفجر'],'late');
  // الإبقاء على السجل الأصلي دون تعديل
  assert.equal(records['2026-10-23'].prayers['الفجر'],'ontime');
  // تسجيل الحالة نفسها مرة أخرى يعيد الصلاة إلى «غير معروف»
  const cleared=setPrayerStatus(changed,'2026-10-23','الفجر','late');
  assert.equal(cleared['2026-10-23'].prayers['الفجر'],undefined);
  assert.equal(changed['2026-10-23'].prayers['الفجر'],'late');
  assert.equal(setPrayerStatus({},'2026-10-23','الفجر',null)['2026-10-23'].prayers['الفجر'],undefined);
});
test('prayer statuses persist on same-day refresh and start unknown on a new day',()=>{
  const logged=setPrayerStatus({},'2026-10-23','الظهر','ontime');
  const refreshed=createDayRecord('2026-10-23',slots,plan(),anchors,[],logged['2026-10-23']);
  assert.equal(refreshed.prayers?.['الظهر'],'ontime');
  const nextDay=createDayRecord('2026-10-24',slots,plan(),anchors,[],logged['2026-10-23']);
  assert.equal(nextDay.prayers,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/day-timing.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {resolveActivityTime,defaultActivityTiming,activitySchedule}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('before fajr follows changes in prayer times',()=>{
  const timing=defaultActivityTiming('before',0);
  assert.equal(resolveActivityTime(timing,{'الفجر':'05:00'}).time,'04:30');
  assert.equal(resolveActivityTime(timing,{'الفجر':'05:17'}).time,'04:47');
});
test('after isha activities follow the prayer and custom offsets',()=>{
  const timing=defaultActivityTiming('night',1);
  assert.equal(resolveActivityTime(timing,{'العشاء':'19:00'}).time,'19:50');
  assert.equal(resolveActivityTime(timing,{'العشاء':'20:00'}).time,'20:50');
  assert.equal(resolveActivityTime({anchor:'العشاء',offset:90},{'العشاء':'20:00'}).time,'21:30');
});
test('midnight crossings have explicit day labels',()=>{
  assert.deepEqual(resolveActivityTime({anchor:'العشاء',offset:90},{'العشاء':'23:00'}),{time:'00:30',dayNote:'اليوم التالي'});
  assert.deepEqual(resolveActivityTime({anchor:'الفجر',offset:-30},{'الفجر':'00:15'}),{time:'23:45',dayNote:'اليوم السابق'});
});
test('missing or invalid reference times do not invent a time',()=>{
  for(const anchors of [{},{'الفجر':'25:00'}]) assert.equal(resolveActivityTime(defaultActivityTiming('before',0),anchors).time,'');
});
test('durations default to thirty minutes and changes shift following activities',()=>{
  const anchors={'العشاء':'19:00'};
  const initial=activitySchedule('night',[{},{},{}],anchors);
  assert.deepEqual(initial.map(a=>[a.start.time,a.end.time]),[['19:20','19:50'],['19:50','20:20'],['20:20','20:50']]);
  const changed=activitySchedule('night',[{duration:45},{duration:10},{}],anchors);
  assert.deepEqual(changed.map(a=>[a.start.time,a.end.time]),[['19:20','20:05'],['20:05','20:15'],['20:15','20:45']]);
  assert.equal(activitySchedule('night',[{duration:45},{}],{'العشاء':'20:00'})[1].start.time,'21:05');
});
test('duration supports midnight, missing times and invalid saved values',()=>{
  const [first,second]=activitySchedule('night',[{duration:60},{}],{'العشاء':'23:00'});
  assert.deepEqual(first.end,{time:'00:20',dayNote:'اليوم التالي'});
  assert.deepEqual(second.start,first.end);
  assert.equal(activitySchedule('night',[{duration:0}],{})[0].duration,30);
  assert.equal(activitySchedule('night',[{}],{})[0].end.time,'');
});


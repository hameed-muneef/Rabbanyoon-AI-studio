import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const dataUrl=js=>`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const locationModule=dataUrl(compile(readFileSync(new URL('../src/prayer-location.ts',import.meta.url),'utf8')));
const {parseGeocodingResults,sanitizePrayerLocation,prayerLocationKey,prayerTimingsQuery}=await import(locationModule);
const source=readFileSync(new URL('../src/usePrayerTimes.ts',import.meta.url),'utf8').replace("from 'react'",`from '${import.meta.resolve('react')}'`).replace("from './prayer-location'",`from '${locationModule}'`);
const {prayerDate,parsePrayerTimes}=await import(dataUrl(compile(source)));
const timings={Fajr:'04:45',Sunrise:'06:10',Dhuhr:'12:00',Asr:'15:25',Maghrib:'17:50',Isha:'19:10'};

test('request date uses the device calendar, including year rollover',()=>{
  assert.equal(prayerDate(new Date(2026,0,1,0,5)),'01-01-2026');
  assert.equal(prayerDate(new Date(2026,11,31,23,55)),'31-12-2026');
});
test('all six returned times map to the planner including sunrise',()=>{
  assert.deepEqual(parsePrayerTimes(timings),{'الفجر':'04:45','الشروق':'06:10','الظهر':'12:00','العصر':'15:25','المغرب':'17:50','العشاء':'19:10'});
});
test('incomplete and invalid service data never become displayed prayer times',()=>{
  for(const invalid of [undefined,null,{}, {...timings,Fajr:'24:00'},{...timings,Isha:'19:60'},{...timings,Sunrise:null}]) assert.throws(()=>parsePrayerTimes(invalid));
});
test('city search keeps only well-formed results with a real time zone',()=>{
  const good={name:'صنعاء',country:'اليمن',latitude:15.35,longitude:44.2,timezone:'Asia/Aden'};
  const found=parseGeocodingResults({results:[good,{...good,timezone:'Mars/Base'},{...good,latitude:120},{...good,name:' '},{...good,longitude:'44'}]});
  assert.deepEqual(found,[good]);
  assert.deepEqual(parseGeocodingResults(undefined),[]);
  assert.deepEqual(parseGeocodingResults({results:'x'}),[]);
});
test('a saved city is validated before it is used for requests',()=>{
  const saved={name:'القاهرة',country:'مصر',latitude:30.04,longitude:31.23,timezone:'Africa/Cairo',method:5,school:1};
  assert.deepEqual(sanitizePrayerLocation(saved),saved);
  assert.equal(sanitizePrayerLocation({...saved,timezone:'Nope/Zone'}),undefined);
  assert.equal(sanitizePrayerLocation({...saved,latitude:999}),undefined);
  assert.equal(sanitizePrayerLocation(null),undefined);
  assert.equal(sanitizePrayerLocation({...saved,method:99}).method,undefined);
});
test('timings request carries the city zone, and method only when chosen',()=>{
  const saved={latitude:15.35,longitude:44.2};
  assert.equal(prayerTimingsQuery(saved,'Asia/Aden').toString(),'latitude=15.35&longitude=44.2&timezonestring=Asia%2FAden');
  assert.match(prayerTimingsQuery(saved,'Asia/Aden',{method:4,school:1}).toString(),/method=4&school=1$/);
});
test('cache key differs per city, method and school',()=>{
  const city={name:'a',country:'',latitude:1,longitude:2,timezone:'Asia/Aden'};
  assert.notEqual(prayerLocationKey(city),prayerLocationKey({...city,method:4}));
  assert.notEqual(prayerLocationKey(city),prayerLocationKey({...city,school:1}));
  assert.notEqual(prayerLocationKey(city),prayerLocationKey({...city,latitude:5}));
});

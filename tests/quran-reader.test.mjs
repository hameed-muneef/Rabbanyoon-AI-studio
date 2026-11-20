import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Functional tests for the reader helpers that run against the real immutable
// asset on disk. `fetch` is stubbed so the module can be imported in Node.
const assetText = readFileSync(new URL('../public/quran/quran-hafs-uthmani.json', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/quran/content.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}
}).outputText;

let mode = 'ok';
const fetchCalls = [];
globalThis.fetch = async () => {
  fetchCalls.push(mode);
  if (mode === 'network') return {ok: false, json: async () => ({})};
  if (mode === 'incomplete') return {ok: true, json: async () => ({counts: {surahs: 113, verses: 6236}})};
  return {ok: true, json: async () => JSON.parse(assetText)};
};

const content = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const {
  loadQuran, resetQuranCache, currentQuran, verseBody, verseMarker, findVerse, surahInfo,
  surahVerses, basmalaText, showsBasmala, navigationTarget, referenceLabel, rangeVerses,
  normalizeSearch, searchVerses, parseReference, relativeVerse, toArabicNumber, fromArabicNumber
} = content;

test('the asset loader refuses a truncated or unreachable file and recovers afterwards', async () => {
  resetQuranCache();
  mode = 'network';
  await assert.rejects(loadQuran(), /تعذر تحميل نص المصحف/);
  assert.equal(currentQuran(), null);

  mode = 'incomplete';
  await assert.rejects(loadQuran(), /أصل المصحف غير مكتمل/);
  assert.equal(currentQuran(), null);

  mode = 'ok';
  const asset = await loadQuran();
  assert.equal(asset.counts.verses, 6236);
  assert.equal(currentQuran(), asset);
  const again = await loadQuran();
  assert.equal(again, asset, 'الأصل يُحمّل مرة واحدة ويبقى في الذاكرة');
  assert.equal(fetchCalls.length, 3, 'لا إعادة تحميل بعد النجاح');
});

test('surah lookup returns metadata and the exact verse range', async () => {
  const asset = await loadQuran();
  const fatiha = surahInfo(asset, 1);
  assert.equal(fatiha.name, 'الفاتحة');
  assert.equal(fatiha.ayahs, 7);
  assert.equal(surahVerses(asset, 1).length, 7);
  assert.deepEqual(surahVerses(asset, 1).map(verse => verse.a), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(surahInfo(asset, 115), undefined);
  assert.equal(surahVerses(asset, 115).length, 0);
  assert.equal(surahInfo(asset, 2).ayahs, 286);
});

test('display helpers strip only the end marker and never the source text', async () => {
  const asset = await loadQuran();
  const first = findVerse(asset, 1, 1);
  assert.equal(verseMarker(first.t), '۝١');
  assert.equal(verseBody(first.t).includes('۝'), false);
  assert.ok(normalizeSearch(verseBody(first.t)).startsWith('بسم'));
  assert.equal(first.t.includes('۝١'), true, 'الأصل يبقى كما هو');

  const long = findVerse(asset, 2, 255);
  assert.ok(long);
  assert.equal(verseBody(long.t).includes('\u06DD'), false);
  assert.equal(verseMarker(long.t), '۝٢٥٥');
  assert.equal(basmalaText(asset), verseBody(first.t));
  assert.equal(showsBasmala(1), false);
  assert.equal(showsBasmala(9), false);
  assert.equal(showsBasmala(2), true);
});

test('juz, hizb and page navigation land on the first verse of each unit', async () => {
  const asset = await loadQuran();
  const juz1 = navigationTarget(asset, 'juz', 1);
  assert.equal(`${juz1.s}:${juz1.a}`, '1:1');
  const juz30 = navigationTarget(asset, 'juz', 30);
  assert.equal(juz30.j, 30);
  assert.equal(asset.verses.find(verse => verse.h === 60).h, 60);
  assert.equal(asset.verses.filter(verse => verse.p === 604).at(-1).a, 6);
  assert.equal(navigationTarget(asset, 'page', 604).p, 604);
  assert.equal(navigationTarget(asset, 'page', 1).s, 1);
  assert.equal(navigationTarget(asset, 'juz', 31), undefined);
  assert.equal(navigationTarget(asset, 'hizb', 0), undefined);
});

test('reference labels use Arabic digits and include an optional range', async () => {
  const asset = await loadQuran();
  assert.equal(referenceLabel(asset, 2, 255), 'البقرة: ٢٥٥');
  assert.equal(referenceLabel(asset, 2, 255, 257), 'البقرة: ٢٥٥–٢٥٧');
  assert.equal(referenceLabel(asset, 2, 255, 255), 'البقرة: ٢٥٥');
  assert.equal(toArabicNumber(6236), '٦٢٣٦');
  assert.equal(fromArabicNumber('٦٢٣٦'), '6236');
  assert.equal(toArabicNumber('سورة 1'), 'سورة ١');
});

test('ranges follow the mushaf order across surah boundaries', async () => {
  const asset = await loadQuran();
  const start = findVerse(asset, 1, 6);
  const end = findVerse(asset, 2, 2);
  const range = rangeVerses(asset, start, end);
  assert.deepEqual(range.map(verse => `${verse.s}:${verse.a}`), ['1:6', '1:7', '2:1', '2:2']);
  assert.deepEqual(rangeVerses(asset, end, start), [], 'المقطع المعكوس لا يُعرض');
  assert.equal(relativeVerse(asset, asset.verses[0], -1), undefined);
  assert.equal(relativeVerse(asset, asset.verses.at(-1), 1), undefined);
  assert.equal(relativeVerse(asset, start, 1).a, 7);
});

test('search ignores diacritics, alef forms and ta marbuta while matching all words', async () => {
  const asset = await loadQuran();
  assert.deepEqual(searchVerses(asset, 'ا'), [], 'الاستعلام القصير لا يبحث');
  assert.equal(normalizeSearch('بِسْمِ اللَّهِ'), 'بسم الله');
  assert.equal(normalizeSearch('الرَّحْمَٰنِ'), 'الرحمن');
  assert.equal(normalizeSearch('صلاة'), normalizeSearch('صلاه'));
  assert.equal(normalizeSearch('  بسم   الله  '), 'بسم الله');

  const basmala = searchVerses(asset, 'بسم الله');
  assert.ok(basmala.some(result => result.verse.s === 1 && result.verse.a === 1));
  assert.ok(basmala.some(result => result.verse.s === 27 && result.verse.a === 30), 'البسملة في النمل');
  assert.ok(basmala.every(result => result.body.includes('۝') === false));
  assert.ok(basmala.every(result => result.surahName.length > 0));

  const rahman = searchVerses(asset, 'الرحمن');
  assert.ok(rahman.length > 0);
  assert.ok(rahman.some(result => result.verse.s === 55 && result.verse.a === 1));

  const both = searchVerses(asset, 'رب العالمين');
  assert.ok(both.length > 0);
  assert.ok(both.every(result => {
    const haystack = normalizeSearch(result.verse.e);
    return haystack.includes('رب') && haystack.includes('العالمين');
  }));
  assert.ok(both.some(result => result.verse.s === 1 && result.verse.a === 2));
  assert.ok(searchVerses(asset, 'رب العالمين', 2).length <= 2, 'الحد الأقصى للنتائج يُحترم');
});

test('typed references are validated before navigation', async () => {
  assert.deepEqual(parseReference('2:255'), {surah: 2, ayah: 255});
  assert.deepEqual(parseReference(' 1 ： 1 '), {surah: 1, ayah: 1});
  assert.equal(parseReference('0:1'), null);
  assert.equal(parseReference('115:1'), null);
  assert.equal(parseReference('2:0'), null);
  assert.equal(parseReference('البقرة: 255'), null);
  assert.equal(parseReference('2-255'), null);
  assert.equal(parseReference('2:255:1'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const assetPath = new URL('../public/quran/quran-hafs-uthmani.json', import.meta.url);
const manifestPath = new URL('../public/quran/manifest.json', import.meta.url);
const fontPath = new URL('../public/fonts/kfgqpc-hafs-v30.ttf', import.meta.url);

const assetBuffer = await readFile(assetPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const asset = JSON.parse(assetBuffer.toString('utf8'));

test('Quran asset matches its manifest byte-for-byte', async () => {
  assert.equal(sha256(assetBuffer), manifest.files.asset.sha256);
  assert.equal(assetBuffer.length, manifest.files.asset.bytes);
  assert.equal(asset.version, manifest.version);
  assert.equal(asset.version, 'kfgqpc-hafs-v3.0');
  const font = await readFile(fontPath);
  assert.equal(sha256(font), manifest.files.font.sha256);
  assert.equal(font.length, manifest.files.font.bytes);
  assert.equal(manifest.files.font.family, 'KFGQPC HAFS Uthmanic Script');
});

test('Quran asset has 114 surahs, 6236 verses and 30/60/604 boundaries', () => {
  assert.equal(asset.counts.surahs, 114);
  assert.equal(asset.counts.verses, 6236);
  assert.equal(asset.counts.juz, 30);
  assert.equal(asset.counts.hizbs, 60);
  assert.equal(asset.counts.pages, 604);
  assert.equal(asset.surahs.length, 114);
  assert.equal(asset.verses.length, 6236);
  assert.equal(asset.juzStarts.length, 30);
  assert.equal(asset.hizbStarts.length, 60);
  assert.ok(asset.sajdas.length >= 14);
});

test('surah numbers are contiguous and names are present', () => {
  const numbers = asset.surahs.map(surah => surah.n);
  assert.deepEqual(numbers, Array.from({length: 114}, (_, index) => index + 1));
  for (const surah of asset.surahs) {
    assert.ok(typeof surah.name === 'string' && surah.name.length >= 1, `اسم السورة ${surah.n} مفقود`);
    assert.ok(['مكية', 'مدنية'].includes(surah.type), `نوع السورة ${surah.n} غير معروف`);
    assert.ok(Number.isInteger(surah.ayahs) && surah.ayahs > 0);
    assert.ok(Number.isInteger(surah.order) && surah.order >= 1 && surah.order <= 114);
  }
});

test('verse order is continuous with no duplicates and no gaps', () => {
  const keys = new Set();
  const counts = new Map();
  let previous = null;
  for (const verse of asset.verses) {
    const key = `${verse.s}:${verse.a}`;
    assert.equal(keys.has(key), false, `آية مكررة: ${key}`);
    keys.add(key);
    if (previous) {
      if (previous.s === verse.s) assert.equal(verse.a, previous.a + 1, `فجوة في ${verse.s}`);
      else assert.equal(verse.s, previous.s + 1, `فجوة بين السور ${previous.s}→${verse.s}`);
    }
    previous = verse;
    counts.set(verse.s, (counts.get(verse.s) ?? 0) + 1);
  }
  assert.ok(keys.has('1:1'));
  assert.ok(keys.has('114:6'));
  for (const surah of asset.surahs) {
    assert.equal(counts.get(surah.n), surah.ayahs, `عدد آيات السورة ${surah.n}`);
  }
});

test('every verse keeps Uthmani text, its end marker and a search-only form', () => {
  for (const verse of asset.verses) {
    const key = `${verse.s}:${verse.a}`;
    assert.ok(typeof verse.t === 'string' && verse.t.length > 1, `نص فارغ ${key}`);
    assert.match(verse.t, /\u06DD[\u0660-\u0669]+\s*$/u, `علامة نهاية مفقودة ${key}`);
    assert.match(verse.t, /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u, `لا حركات ${key}`);
    assert.ok(typeof verse.e === 'string' && verse.e.length > 1, `نص بحث فارغ ${key}`);
    assert.equal(verse.e.includes('\u06DD'), false, `نص البحث يحتوي علامة مصحف ${key}`);
    assert.ok(Number.isInteger(verse.j) && verse.j >= 1 && verse.j <= 30, `جزء غير صالح ${key}`);
    assert.ok(Number.isInteger(verse.h) && verse.h >= 1 && verse.h <= 60, `حزب غير صالح ${key}`);
    assert.ok(Number.isInteger(verse.p) && verse.p >= 1 && verse.p <= 604, `صفحة غير صالحة ${key}`);
  }
});

test('juz, hizb and page boundaries advance monotonically', () => {
  for (const key of ['j', 'h', 'p']) {
    let previous = 0;
    for (const verse of asset.verses) {
      assert.ok(verse[key] >= previous, `حدود ${key} تراجعت عند ${verse.s}:${verse.a}`);
      assert.ok(verse[key] <= previous + 1, `قفزة في ${key} عند ${verse.s}:${verse.a}`);
      previous = verse[key];
    }
  }
});

test('independent Tanzil validation stays above the documented threshold', () => {
  assert.ok(manifest.validation.normalizedRate >= 0.995, 'نسبة التحقق المستقل أقل من الحد');
  assert.equal(manifest.validation.verseCount, 6236);
  assert.equal(manifest.validation.surahCount, 114);
  assert.ok(manifest.validation.normalizedMatches >= 6200);
  assert.ok(typeof manifest.attribution === 'string' && manifest.attribution.includes('مجمع الملك فهد'));
  assert.ok(manifest.sources.kfgqpcJson.sha256.match(/^[0-9a-f]{64}$/));
});

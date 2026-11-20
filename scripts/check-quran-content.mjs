#!/usr/bin/env node
// Verifies the immutable Quran runtime asset against its manifest. Fails loudly
// if any byte, count, ordering or Uthmani marker changed.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetPath = join(root, 'public', 'quran', 'quran-hafs-uthmani.json');
const manifestPath = join(root, 'public', 'quran', 'manifest.json');
const fontPath = join(root, 'public', 'fonts', 'kfgqpc-hafs-v30.ttf');
const expectedSurahs = 114;
const expectedVerses = 6236;
const expectedJuz = 30;
const expectedHizbs = 60;
const expectedPages = 604;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); return condition; };

async function main() {
  const assetBuffer = await readFile(assetPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const asset = JSON.parse(assetBuffer.toString('utf8'));

  check(sha256(assetBuffer) === manifest.files.asset.sha256, 'بصمة ملف القرآن لا تطابق البيان');
  check(assetBuffer.length === manifest.files.asset.bytes, 'حجم ملف القرآن لا يطابق البيان');
  check(asset.version === manifest.version, 'إصدار الأصل لا يطابق البيان');
  check(asset.counts.surahs === expectedSurahs, 'عدد السور ليس 114');
  check(asset.counts.verses === expectedVerses, 'عدد الآيات ليس 6236');
  check(asset.counts.juz === expectedJuz, 'عدد الأجزاء ليس 30');
  check(asset.counts.hizbs === expectedHizbs, 'عدد الأحزاب ليس 60');
  check(asset.counts.pages === expectedPages, 'عدد الصفحات ليس 604');
  check(asset.verses.length === expectedVerses, 'مصفوفة الآيات لا تساوي 6236');
  check(asset.surahs.length === expectedSurahs, 'مصفوفة السور لا تساوي 114');
  check(sha256(asset.verses.map(verse => verse.t).join('\n')) === manifest.files.asset.textSha256, 'بصمة نصوص الآيات لا تطابق البيان');

  const surahByNumber = new Map(asset.surahs.map(surah => [surah.n, surah]));
  check(surahByNumber.size === expectedSurahs, 'أرقام السور مكررة');
  for (let number = 1; number <= expectedSurahs; number += 1) {
    const surah = surahByNumber.get(number);
    if (!check(surah, `السورة ${number} مفقودة`)) continue;
    check(typeof surah.name === 'string' && surah.name.length >= 1, `اسم السورة ${number} فارغ`);
    check(['مكية', 'مدنية'].includes(surah.type), `نوع السورة ${number} غير معروف`);
    check(Number.isInteger(surah.ayahs) && surah.ayahs > 0, `عدد آيات السورة ${number} غير صالح`);
  }

  const keys = new Set();
  const counts = new Map();
  const surahOrder = [];
  let previous = null;
  for (const verse of asset.verses) {
    const key = `${verse.s}:${verse.a}`;
    check(!keys.has(key), `آية مكررة: ${key}`);
    keys.add(key);
    check(typeof verse.t === 'string' && verse.t.length > 1, `نص فارغ: ${key}`);
    check(/\u06DD[\u0660-\u0669]+\s*$/.test(verse.t), `علامة نهاية الآية مفقودة: ${key}`);
    check(/[\u064B-\u0670\u06D6-\u06ED]/.test(verse.t), `الآية ${key} بلا حركات عثمانية`);
    check(typeof verse.e === 'string' && verse.e.length > 1, `نص البحث فارغ: ${key}`);
    check(!verse.e.includes('\u06DD'), `نص البحث يحتوي علامة المصحف: ${key}`);
    check(Number.isInteger(verse.j) && verse.j >= 1 && verse.j <= expectedJuz, `جزء غير صالح: ${key}`);
    check(Number.isInteger(verse.p) && verse.p >= 1 && verse.p <= expectedPages, `صفحة غير صالحة: ${key}`);
    check(Number.isInteger(verse.h) && verse.h >= 1 && verse.h <= expectedHizbs, `حزب غير صالح: ${key}`);
    if (!previous || previous.s !== verse.s) surahOrder.push(verse.s);
    if (previous) {
      if (previous.s === verse.s) check(verse.a === previous.a + 1, `تسلسل آيات مكسور: ${verse.s}:${previous.a}→${verse.a}`);
      else check(verse.s === previous.s + 1, `تسلسل سور مكسور: ${previous.s}→${verse.s}`);
    }
    previous = verse;
    counts.set(verse.s, (counts.get(verse.s) ?? 0) + 1);
  }
  check(surahOrder.length === expectedSurahs, 'ترتيب السور لا يغطي 114 سورة');
  for (const surah of asset.surahs) {
    check(counts.get(surah.n) === surah.ayahs, `عدد آيات السورة ${surah.n} لا يطابق بياناتها`);
  }
  check(keys.has('1:1') && keys.has('114:6'), 'أول/آخر آية غير متوقعة');
  check(asset.juzStarts.length === expectedJuz, 'بدايات الأجزاء غير مكتملة');
  check(asset.hizbStarts.length === expectedHizbs, 'بدايات الأحزاب غير مكتملة');
  check(asset.sajdas.length >= 14, 'مواضع السجود غير مكتملة');

  const fontBuffer = await readFile(fontPath);
  check(sha256(fontBuffer) === manifest.files.font.sha256, 'بصمة خط المصحف لا تطابق البيان');
  check(fontBuffer.length === manifest.files.font.bytes, 'حجم خط المصحف لا يطابق البيان');
  check(manifest.validation.normalizedRate >= 0.995, 'تطابق التحقق المستقل أقل من الحد');

  if (errors.length) {
    console.error(`فشل فحص المحتوى القرآني (${errors.length}):`);
    for (const error of errors.slice(0, 40)) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    version: asset.version,
    counts: asset.counts,
    checksum: manifest.files.asset.sha256,
    normalizedValidationRate: manifest.validation.normalizedRate
  }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });

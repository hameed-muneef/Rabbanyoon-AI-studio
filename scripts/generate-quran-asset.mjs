#!/usr/bin/env node
// Generates the immutable runtime Quran asset from the official KFGQPC Hafs v3.0
// dataset. The verse text is copied byte-for-byte; nothing is normalized,
// reconstructed or generated. Tanzil metadata is used only for validation and
// for surah names / juz / hizb / page navigation.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, copyFile, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const sourceRoot = resolve(option('source') ?? process.env.QURAN_SOURCE_DIR ?? join(process.env.TEMP ?? '.', 'opencode', 'kfgqpc'));
const paths = {
  json: resolve(option('json') ?? join(sourceRoot, 'extracted', 'kfgqpc_hafs_v30-data', 'kfgqpc_hafs_v30.json')),
  font: resolve(option('font') ?? join(sourceRoot, 'extracted', 'kfgqpc_hafs_v30-font', 'kfgqpc_hafs_v30.ttf')),
  tanzilXml: resolve(option('tanzil-xml') ?? join(sourceRoot, 'tanzil-quran-data.xml')),
  tanzilText: resolve(option('tanzil-text') ?? join(sourceRoot, 'tanzil-uthmani.txt')),
  zip: resolve(option('zip') ?? join(sourceRoot, 'kfgqpc_hafs_v30.zip')),
  outDir: resolve(option('out') ?? join(root, 'public', 'quran')),
  fontOut: resolve(join(root, 'public', 'fonts', 'kfgqpc-hafs-v30.ttf'))
};

const sha256 = value => createHash('sha256').update(value).digest('hex');
const readText = async file => (await readFile(file)).toString('utf8').replace(/^\uFEFF/, '');
const fail = message => { throw new Error(message); };
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arabicNumber = value => String(value).replace(/[0-9]/g, digit => ARABIC_DIGITS[Number(digit)]);
const stripEndMarker = text => {
  const match = text.match(/\s*\u06DD[\u0660-\u0669]+\s*$/);
  if (!match) fail(`آية بلا علامة نهاية معتمدة: ${JSON.stringify(text.slice(-24))}`);
  return text.slice(0, match.index);
};

// Validation-only comparison form. It is never stored and never displayed.
const validationForm = text => text.normalize('NFC')
  .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF]/g, '')
  .replace(/[\u0621\u0654\u0655]/g, '')
  .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
  .replace(/\u0649/g, '\u064A')
  .replace(/\u0629/g, '\u0647')
  .replace(/[^\u0621-\u064A\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

async function readZipChecksum() {
  try {
    const buffer = await readFile(paths.zip);
    return {bytes: buffer.length, sha256: sha256(buffer)};
  } catch {
    return null;
  }
}

function parseMetadata(xml) {
  const suras = [...xml.matchAll(/<sura index="(\d+)" ayas="(\d+)" start="(\d+)" name="([^"]*)" tname="([^"]*)" ename="([^"]*)" type="([^"]*)" order="(\d+)"[^>]*\/>/g)]
    .map(match => ({
      number: Number(match[1]), ayahs: Number(match[2]), start: Number(match[3]),
      name: match[4], englishName: match[6], type: match[7], order: Number(match[8])
    }));
  const juzs = [...xml.matchAll(/<juz index="(\d+)" sura="(\d+)" aya="(\d+)"\s*\/>/g)]
    .map(match => ({juz: Number(match[1]), surah: Number(match[2]), ayah: Number(match[3])}));
  const quarters = [...xml.matchAll(/<quarter index="(\d+)" sura="(\d+)" aya="(\d+)"\s*\/>/g)]
    .map(match => ({quarter: Number(match[1]), surah: Number(match[2]), ayah: Number(match[3])}));
  const pages = [...xml.matchAll(/<page index="(\d+)" sura="(\d+)" aya="(\d+)"\s*\/>/g)]
    .map(match => ({page: Number(match[1]), surah: Number(match[2]), ayah: Number(match[3])}));
  const sajdas = [...xml.matchAll(/<sajda[^>]*sura="(\d+)" aya="(\d+)"[^>]*\/>/g)]
    .map(match => `${match[1]}:${match[2]}`);
  return {suras, juzs, quarters, pages, sajdas};
}

function expectedAt(starts, key, globalIndex) {
  let current = starts[0];
  for (const start of starts) {
    if (start.global <= globalIndex) current = start;
    else break;
  }
  return current[key];
}

async function main() {
  const rawJson = await readText(paths.json);
  const verses = JSON.parse(rawJson);
  if (!Array.isArray(verses)) fail('ملف المجمع ليس مصفوفة آيات');
  if (verses.length !== 6236) fail(`عدد الآيات ${verses.length} بدل 6236`);

  const xml = await readText(paths.tanzilXml);
  const metadata = parseMetadata(xml);
  if (metadata.suras.length !== 114) fail(`عدد السور في البيانات الوصفية ${metadata.suras.length}`);
  if (metadata.juzs.length !== 30) fail('بيانات الأجزاء غير مكتملة');
  if (metadata.quarters.length !== 240) fail('بيانات الأرباع غير مكتملة');
  if (metadata.pages.length !== 604) fail('بيانات الصفحات غير مكتملة');
  const tanzilAyahCount = metadata.suras.reduce((sum, surah) => sum + surah.ayahs, 0);
  if (tanzilAyahCount !== 6236) fail(`عدد آيات تنزيل ${tanzilAyahCount}`);

  // Cross-check the KFGQPC verse stream against Tanzil counts and ordering.
  let global = 0;
  const built = [];
  const surahAyahCounts = new Map();
  let previousSurah = 0;
  let previousAyah = 0;
  for (const verse of verses) {
    const surah = Number(verse.sura_no);
    const ayah = Number(verse.aya_no);
    if (surah < 1 || surah > 114) fail(`رقم سورة غير صالح: ${surah}`);
    if (!Number.isInteger(ayah) || ayah < 1) fail(`رقم آية غير صالح: ${surah}:${ayah}`);
    if (surah !== previousSurah && surah !== previousSurah + 1) fail(`ترتيب سور مكسور عند ${surah}`);
    if (surah === previousSurah && ayah !== previousAyah + 1) fail(`ترتيب آيات مكسور عند ${surah}:${ayah}`);
    if (ayah === 1) surahAyahCounts.set(surah, 1);
    else surahAyahCounts.set(surah, (surahAyahCounts.get(surah) ?? 0) + 1);
    previousSurah = surah;
    previousAyah = ayah;

    const text = verse.aya_text_unicode;
    if (typeof text !== 'string' || !text.trim()) fail(`نص فارغ عند ${surah}:${ayah}`);
    if (!/\u06DD[\u0660-\u0669]+\s*$/.test(text)) fail(`علامة آية مفقودة عند ${surah}:${ayah}`);
    const emlaey = verse.aya_text_emlaey;
    if (typeof emlaey !== 'string' || !emlaey.trim()) fail(`نص بحث فارغ عند ${surah}:${ayah}`);

    built.push({
      s: surah,
      a: ayah,
      j: Number(verse.jozz),
      p: Number(verse.page),
      h: 0,
      t: text,
      e: emlaey
    });
    global += 1;
  }
  for (const surah of metadata.suras) {
    if ((surahAyahCounts.get(surah.number) ?? 0) !== surah.ayahs) {
      fail(`عدد آيات السورة ${surah.number} لا يطابق تنزيل`);
    }
  }

  const juzStarts = metadata.juzs.map(item => ({...item, global: 0}));
  const quarterStarts = metadata.quarters.map(item => ({...item, global: 0}));
  const pageStarts = metadata.pages.map(item => ({...item, global: 0}));
  const starts = new Map();
  let cursor = 0;
  for (const surah of metadata.suras) { starts.set(surah.number, cursor); cursor += surah.ayahs; }
  for (const item of [...juzStarts, ...quarterStarts, ...pageStarts]) {
    if (!starts.has(item.surah)) fail(`بداية غير صالحة عند السورة ${item.surah}`);
    item.global = starts.get(item.surah) + item.ayah - 1;
  }
  juzStarts.sort((a, b) => a.global - b.global);
  quarterStarts.sort((a, b) => a.global - b.global);
  pageStarts.sort((a, b) => a.global - b.global);

  const hizbStarts = [];
  for (let hizb = 1; hizb <= 60; hizb += 1) {
    const firstQuarter = quarterStarts.find(item => Math.ceil(item.quarter / 4) === hizb);
    if (!firstQuarter) fail(`لا يوجد ربع للحزب ${hizb}`);
    hizbStarts.push({hizb, surah: firstQuarter.surah, ayah: firstQuarter.ayah, global: firstQuarter.global});
  }

  let juzMismatches = 0;
  let pageMismatches = 0;
  const juzSample = [];
  const pageSample = [];
  built.forEach((verse, index) => {
    verse.h = Math.ceil(quarterStarts.filter(item => item.global <= index).at(-1).quarter / 4);
    const juz = expectedAt(juzStarts, 'juz', index);
    const page = expectedAt(pageStarts, 'page', index);
    if (juz !== verse.j) {
      juzMismatches += 1;
      if (juzSample.length < 5) juzSample.push(`${verse.s}:${verse.a} ${verse.j}≠${juz}`);
    }
    if (page !== verse.p) {
      pageMismatches += 1;
      if (pageSample.length < 5) pageSample.push(`${verse.s}:${verse.a} ${verse.p}≠${page}`);
    }
  });

  // Independent Tanzil text cross-check (validation form only, never stored).
  const tanzilLines = (await readText(paths.tanzilText)).split(/\r?\n/).filter(Boolean)
    .map(line => { const parts = line.split('|'); return {s: +parts[0], a: +parts[1], x: parts[2]}; });
  const tanzilByKey = new Map(tanzilLines.map(item => [`${item.s}:${item.a}`, item.x]));
  const basmalaNormalized = validationForm('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');
  let exactTextMatches = 0;
  let normalizedMatches = 0;
  const textDifferences = [];
  for (const verse of built) {
    const reference = tanzilByKey.get(`${verse.s}:${verse.a}`);
    if (!reference) fail(`آية مفقودة من مرجع تنزيل: ${verse.s}:${verse.a}`);
    if (stripEndMarker(verse.t) === reference.trim()) exactTextMatches += 1;
    let referenceForm = validationForm(reference);
    if (verse.a === 1 && verse.s !== 1 && verse.s !== 9 && referenceForm.startsWith(basmalaNormalized)) {
      referenceForm = referenceForm.slice(basmalaNormalized.length).trim();
    }
    if (validationForm(stripEndMarker(verse.t)) === referenceForm) normalizedMatches += 1;
    else if (textDifferences.length < 20) textDifferences.push(`${verse.s}:${verse.a}`);
  }
  const normalizedRate = normalizedMatches / built.length;
  if (normalizedRate < 0.995) fail(`تطابق تنزيل منخفض جدًا: ${(normalizedRate * 100).toFixed(2)}%`);

  const surahs = metadata.suras.map(surah => ({
    n: surah.number,
    name: surah.name,
    ename: surah.englishName,
    type: surah.type === 'Meccan' ? 'مكية' : 'مدنية',
    ayahs: surah.ayahs,
    order: surah.order
  }));

  const asset = {
    version: 'kfgqpc-hafs-v3.0',
    narration: 'حفص عن عاصم',
    script: 'الرسم العثماني',
    source: 'مجمع الملك فهد لطباعة المصحف الشريف',
    sourceUrl: 'https://qurancomplex.gov.sa/quran-dev/',
    generatedAt: new Date().toISOString(),
    counts: {surahs: surahs.length, verses: built.length, juz: juzStarts.length, hizbs: hizbStarts.length, pages: pageStarts.length},
    surahs,
    juzStarts,
    hizbStarts,
    sajdas: metadata.sajdas,
    verses: built
  };

  const assetText = JSON.stringify(asset);
  const textChecksum = sha256(built.map(verse => verse.t).join('\n'));
  const fontBuffer = await readFile(paths.font);
  const jsonBuffer = await readFile(paths.json);
  const xmlBuffer = await readFile(paths.tanzilXml);
  const tanzilTextBuffer = await readFile(paths.tanzilText);
  const zip = await readZipChecksum();

  await mkdir(paths.outDir, {recursive: true});
  await mkdir(dirname(paths.fontOut), {recursive: true});
  await writeFile(join(paths.outDir, 'quran-hafs-uthmani.json'), assetText);
  await copyFile(paths.font, paths.fontOut);

  const manifest = {
    version: asset.version,
    narration: asset.narration,
    script: asset.script,
    generatedAt: asset.generatedAt,
    license: 'محتوى قرآني رسمي من مجمع الملك فهد؛ يُحفظ الإسناد. التحقق المستقل بمرجع Tanzil (CC BY 3.0).',
    attribution: 'نص المصحف: مجمع الملك فهد لطباعة المصحف الشريف (حفص، رسم عثماني). التحقق: Tanzil Project.',
    counts: asset.counts,
    files: {
      asset: {path: 'public/quran/quran-hafs-uthmani.json', bytes: Buffer.byteLength(assetText), sha256: sha256(assetText), textSha256: textChecksum},
      font: {path: 'public/fonts/kfgqpc-hafs-v30.ttf', bytes: fontBuffer.length, sha256: sha256(fontBuffer), family: 'KFGQPC HAFS Uthmanic Script'}
    },
    sources: {
      kfgqpcZip: zip ? {file: 'kfgqpc_hafs_v30.zip', ...zip} : {file: 'kfgqpc_hafs_v30.zip', note: 'لم يُمرر الملف المضغوط؛ البصمة المنشورة موثقة في الوثيقة.'},
      kfgqpcJson: {file: 'kfgqpc_hafs_v30.json', bytes: jsonBuffer.length, sha256: sha256(jsonBuffer)},
      tanzilMetadata: {file: 'tanzil-quran-data.xml', bytes: xmlBuffer.length, sha256: sha256(xmlBuffer)},
      tanzilText: {file: 'tanzil-uthmani.txt', bytes: tanzilTextBuffer.length, sha256: sha256(tanzilTextBuffer)}
    },
    validation: {
      verseCount: built.length,
      surahCount: surahs.length,
      boundaryPolicy: 'حدود الأجزاء والصفحات المعتمدة للعرض هي قيم مصدر المجمع (jozz/page). فروق بدايات تنزيل مسجلة للمراجعة فقط لأنها تتبع طبعة مطبوعة مختلفة.',
      exactTextMatches,
      normalizedMatches,
      normalizedRate: Number(normalizedRate.toFixed(4)),
      textDifferences,
      juzMismatches,
      juzSample,
      pageMismatches,
      pageSample
    }
  };
  await writeFile(join(paths.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({
    ok: true,
    asset: manifest.files.asset,
    font: manifest.files.font,
    counts: manifest.counts,
    validation: {exactTextMatches, normalizedMatches, normalizedRate: `${(normalizedRate * 100).toFixed(2)}%`, juzMismatches, pageMismatches}
  }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });

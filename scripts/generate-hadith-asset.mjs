import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const titles = JSON.parse(readFileSync('scripts/hadith-book-titles.json', 'utf8'));
const sourceCommit = 'df57907be35291c91ad6a6691180e22ca9920784';
const sourceUrl = `https://github.com/fawazahmed0/hadith-api/tree/${sourceCommit}`;
const attribution = 'النص العربي من fawazahmed0/hadith-api؛ حقوق النصوص الأصلية والطبعة غير موثقة بشكل مستقل.';

const collections = [
  { key: 'bukhari', file: 'data/ara-bukhari.json', title: 'صحيح البخاري', author: 'الإمام محمد بن إسماعيل البخاري', bookCount: 97 },
  { key: 'muslim', file: 'data/ara-muslim.json', title: 'صحيح مسلم', author: 'الإمام مسلم بن الحجاج', bookCount: 56 },
];

mkdirSync('public/hadith', { recursive: true });

const manifest = {
  source: 'fawazahmed0/hadith-api',
  sourceCommit,
  sourceUrl,
  license: 'Unverified; upstream Unlicense covers software, not explicitly the Hadith text or database',
  rightsStatus: 'unverified',
  attribution,
  generatedAt: new Date().toISOString(),
  files: {},
};

for (const col of collections) {
  const raw = JSON.parse(readFileSync(col.file, 'utf8'));
  const hadiths = raw.hadiths
    .filter(h => typeof h.text === 'string' && h.text.trim().length > 0)
    .map(h => ({
    id: `${col.key}:${h.hadithnumber}`,
    number_in_collection: h.hadithnumber,
    arabicnumber: h.arabicnumber,
    book: h.reference?.book ?? null,
    text_arabic: h.text,
    narrator: '',
    grading_text: Array.isArray(h.grades) && h.grades.length ? h.grades.map(g => `${g.grade || ''}${g.graded_by ? ' — ' + g.graded_by : ''}`).join('؛ ') : '',
    grading_source: Array.isArray(h.grades) && h.grades.length ? 'fawazahmed0/hadith-api' : '',
    reference_url: `https://sunnah.com/${col.key}:${h.hadithnumber}`,
  }));

  const books = Object.keys(raw.metadata.sections || {}).map(k => ({ book: Number(k), title: raw.metadata.sections[k] })).filter(b => b.book > 0);

  const asset = {
    collection: col.key,
    title: col.title,
    author: col.author,
    source: 'fawazahmed0/hadith-api — Arabic edition (rights unverified)',
    sourceUrl,
    license: 'Unverified',
    attribution,
    counts: {
      hadiths: hadiths.length,
      books: books.length,
      sourceHadiths: raw.hadiths.length,
      omittedEmptyText: raw.hadiths.length - hadiths.length,
    },
    sections: raw.metadata.sections,
    bookTitlesAr: titles[col.key] || {},
    hadiths,
  };

  const outPath = `public/hadith/${col.key}.json`;
  const json = JSON.stringify(asset);
  writeFileSync(outPath, json);
  const buf = Buffer.from(json);
  manifest.files[col.key] = {
    path: `hadith/${col.key}.json`,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    hadiths: hadiths.length,
    sourceHadiths: raw.hadiths.length,
    omittedEmptyText: raw.hadiths.length - hadiths.length,
    books: books.length,
  };
  console.log(col.key, hadiths.length, 'hadiths,', books.length, 'books,', buf.length, 'bytes');
}

writeFileSync('public/hadith/manifest.json', JSON.stringify(manifest, null, 2));
console.log('manifest written');

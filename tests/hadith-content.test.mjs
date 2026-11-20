import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

for (const key of ['bukhari', 'muslim']) {
  const buffer = readFileSync(new URL(`../public/hadith/${key}.json`, import.meta.url));
  const data = JSON.parse(buffer.toString('utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/hadith/manifest.json', import.meta.url), 'utf8'));

  test(`Hadith ${key} asset matches its manifest checksum`, () => {
    assert.equal(sha256(buffer), manifest.files[key].sha256);
    assert.equal(buffer.length, manifest.files[key].bytes);
    assert.equal(data.counts.hadiths, manifest.files[key].hadiths);
  });

  test(`Hadith ${key} asset has ordered unique records and reports omissions`, () => {
    assert.ok(data.hadiths.length >= 7000, `${key} count ${data.hadiths.length}`);
    const ids = data.hadiths.map(h => h.id);
    assert.equal(new Set(ids).size, ids.length, `${key} duplicate ids`);
    const numbers = data.hadiths.map(h => h.number_in_collection);
    assert.equal(new Set(numbers).size, numbers.length, `${key} duplicate hadith numbers`);
    assert.deepEqual(numbers, numbers.slice().sort((a, b) => a - b));
    assert.equal(data.counts.sourceHadiths, data.counts.hadiths + data.counts.omittedEmptyText);
    assert.equal(data.counts.omittedEmptyText, manifest.files[key].omittedEmptyText);
    assert.ok(data.counts.omittedEmptyText > 0, `${key} omitted empty source records`);
    for (const h of data.hadiths) {
      assert.ok(typeof h.text_arabic === 'string' && h.text_arabic.length > 5);
      assert.ok(typeof h.id === 'string' && h.id.length > 0);
      assert.ok(Number.isFinite(h.number_in_collection) && h.number_in_collection > 0);
    }
    const books = new Set(data.hadiths.map(h => h.book).filter(b => b != null));
    assert.ok(books.size >= 50, `${key} books ${books.size}`);
  });
}

test('Hadith manifest records a pinned source and does not overstate text rights', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/hadith/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sourceCommit, 'df57907be35291c91ad6a6691180e22ca9920784');
  assert.equal(manifest.rightsStatus, 'unverified');
  assert.match(manifest.license, /Unverified/i);
  assert.match(manifest.attribution, /غير موثقة/);
  assert.ok(manifest.files.bukhari.hadiths >= 7000);
  assert.ok(manifest.files.muslim.hadiths >= 7000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

for (const lang of ['ar', 'en', 'tr']) {
  const buffer = readFileSync(new URL(`../public/azkar/${lang}.json`, import.meta.url));
  const data = JSON.parse(buffer.toString('utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/azkar/manifest.json', import.meta.url), 'utf8'));

  test(`Azkar ${lang} asset matches its manifest checksum`, () => {
    assert.equal(sha256(buffer), manifest.files[lang].sha256);
    assert.equal(buffer.length, manifest.files[lang].bytes);
  });

  test(`Azkar ${lang} has 132 categories and at least 180 adhkar`, () => {
    assert.equal(data.length, 132, `categories (${lang})`);
    const total = data.reduce((sum, cat) => sum + (Array.isArray(cat.array) ? cat.array.length : 0), 0);
    assert.ok(total >= 180, `adhkar count ${total} (${lang})`);
    for (const cat of data) {
      assert.ok(typeof cat.id === 'number');
      assert.ok(typeof cat.category === 'string' && cat.category.length > 0);
      assert.ok(Array.isArray(cat.array) && cat.array.length > 0);
      for (const item of cat.array) {
        assert.ok(typeof item.id === 'number');
        assert.ok(typeof item.text === 'string' && item.text.length > 0);
        assert.ok(Number.isInteger(item.count) && item.count >= 1, `count for ${lang}:${cat.id}:${item.id}`);
      }
    }
  });
}

test('Azkar manifest records MIT license and attribution', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/azkar/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.license, 'MIT');
  assert.ok(manifest.attribution.includes('Hisn Al-Muslim'));
  assert.ok(manifest.attribution.includes('Sa' + String.fromCharCode(39) + 'eed'));
  assert.equal(manifest.counts.categories, 132);
  assert.equal(manifest.counts.adhkar, 185);
  assert.deepEqual(manifest.languages, ['ar', 'en', 'tr']);
});

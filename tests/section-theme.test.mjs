import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/section-theme.ts', import.meta.url), 'utf8')
  .replace(/^import type .*$/m, '');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const theme = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('eight sections with the specified accents', () => {
  assert.equal(theme.SECTION_THEMES.length, 8);
  const accents = Object.fromEntries(theme.SECTION_THEMES.map(item => [item.id, [item.accent, item.soft]]));
  assert.deepEqual(accents.quran, ['#174C3C', '#9BBEC5']);
  assert.deepEqual(accents.haramain, ['#8A6A38', '#E5D9C0']);
  assert.deepEqual(accents.journey, ['#527F8B', '#D3E2E0']);
  assert.deepEqual(accents.daily, ['#32412F', '#B99A5D']);
  assert.deepEqual(accents.tazkiya, ['#294039', '#A8B9A0']);
  assert.deepEqual(accents.accountability, ['#876D83', '#729EAA']);
  assert.deepEqual(accents.planning, ['#477A70', '#C1D9DC']);
  assert.deepEqual(accents.strong, ['#344C83', '#D5DFD1']);
});

test('no view belongs to two sections', () => {
  const views = theme.SECTION_THEMES.flatMap(item => item.views);
  assert.equal(new Set(views).size, views.length);
  assert.equal(theme.sectionOfView('wird'), 'tazkiya');
  assert.equal(theme.sectionOfView('home'), undefined);
});

test('text and button colours meet WCAG AA in light and dark', () => {
  const hexLum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const item of theme.SECTION_THEMES) {
    const light = theme.lightPalette(item);
    const lightBgs = ['#FFFFFF', theme.LIGHT_SURFACE];
    if (hexLum(item.soft) > 0.5) lightBgs.push(item.soft);
    for (const bg of lightBgs) assert.ok(theme.contrast(light.strong, bg) >= 4.5, `${item.id} light on ${bg}`);
    assert.ok(theme.contrast(light.onStrong, light.strong) >= 4.5, `${item.id} button`);
    const dark = theme.darkPalette(item);
    for (const bg of [theme.DARK_SURFACE, dark.soft]) assert.ok(theme.contrast(dark.strong, bg) >= 4.5, `${item.id} dark on ${bg}`);
    assert.ok(theme.contrast(dark.onStrong, dark.strong) >= 4.5, `${item.id} dark button`);
    assert.ok(theme.contrast(light.accent, theme.LIGHT_SURFACE) >= 3, `${item.id} accent graphic`);
  }
});

test('generated css has light and dark rules for every section', () => {
  const css = theme.sectionThemeCss();
  for (const item of theme.SECTION_THEMES) {
    assert.ok(css.includes(`[data-section="${item.id}"]{`));
    assert.ok(css.includes(`[data-theme="dark"] [data-section="${item.id}"]`));
  }
});

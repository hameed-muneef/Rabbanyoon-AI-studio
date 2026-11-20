import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'src', 'theme-engine.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const lightTokens = [
  '--bg-app', '--bg-page', '--surface-card', '--surface-panel',
  '--text-primary', '--text-secondary', '--text-muted', '--text-inverse',
  '--text-link', '--accent-primary', '--border-default', '--shadow-card',
  '--state-hover', '--status-success', '--status-warning', '--status-error',
];

test('theme engine defines the semantic light palette', () => {
  for (const token of lightTokens) {
    assert.match(css, new RegExp(`${token}\\s*:`), `missing light token ${token}`);
  }
  assert.match(css, /:root,\s*\[data-theme="light"\]/);
});

test('theme engine defines an independent dark palette', () => {
  assert.match(css, /\[data-theme="dark"\]\s*\{/);
  for (const token of lightTokens) {
    const darkBlock = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    assert.match(darkBlock, new RegExp(`${token}\\s*:`), `missing dark token ${token}`);
  }
  assert.match(css, /--bg-app:\s*#091b2b/);
  assert.doesNotMatch(css, /--bg-app:\s*#000(?:000)?\b/);
});

test('theme engine keeps the Quran paper surface light in both themes', () => {
  assert.match(css, /\.quran-reader[\s\S]*--reader-bg:\s*#f4f1e7/);
  assert.match(css, /\.quran-mushaf[\s\S]*background:[^;]*var\(--reader-bg\)/);
  assert.match(css, /\.quran-content-text[\s\S]*color:\s*var\(--reader-text\)\s*!important/);
});

test('theme engine isolates late-loaded Quran route controls in both themes', () => {
  assert.match(css, /html\[data-theme="dark"\][\s\S]*\.azkar-page[\s\S]*!important/);
  assert.match(css, /html\[data-theme="light"\][\s\S]*\.azkar-page[\s\S]*!important/);
  assert.match(css, /\.quran-reader select[\s\S]*color-scheme:\s*light/);
});

test('initial theme boot script prevents a light/dark flash', () => {
  assert.match(index, /localStorage\.getItem\('rabbani-theme-v1'\)/);
  assert.match(index, /setAttribute\('data-theme'/);
});

test('theme engine is loaded after legacy global styles', () => {
  const themeImport = index.length; // index does not own CSS; main.tsx is checked below.
  assert.ok(themeImport > 0);
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  assert.ok(main.lastIndexOf("import './theme-engine.css'") > main.lastIndexOf("import './profile.css'"));
});

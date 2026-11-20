import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/notifications/adhan-validation.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {validateAdhanFile, sniffAudioFormat, normalizeAdhanTitle, ADHAN_MAX_BYTES} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const bytes = (...values) => Uint8Array.from(values);
const ascii = text => [...text].map(char => char.charCodeAt(0));
const mp3 = bytes(...ascii('ID3'), 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
const ogg = bytes(...ascii('OggS'), 0, 2, 0, 0, 0, 0, 0, 0, 0, 0);
const wav = bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'));
const m4a = bytes(0, 0, 0, 24, ...ascii('ftypM4A '), 0, 0, 0, 0);

test('format is detected from file content, not the declared type', () => {
  assert.equal(sniffAudioFormat(mp3), 'mp3');
  assert.equal(sniffAudioFormat(bytes(0xff, 0xfb, 0x90, 0)), 'mp3');
  assert.equal(sniffAudioFormat(ogg), 'ogg');
  assert.equal(sniffAudioFormat(wav), 'wav');
  assert.equal(sniffAudioFormat(m4a), 'm4a');
  assert.equal(sniffAudioFormat(bytes(...ascii('<html>'))), null);
  assert.equal(sniffAudioFormat(new Uint8Array()), null);
});

test('valid adhan files pass and report the real MIME type', () => {
  assert.deepEqual(validateAdhanFile({name: 'adhan.MP3', size: 1000}, mp3), {ok: true, format: 'mp3', mime: 'audio/mpeg'});
  assert.equal(validateAdhanFile({name: 'a.m4a', size: 1000}, m4a).mime, 'audio/mp4');
});

test('disguised, oversized, empty, or mismatched files are rejected', () => {
  assert.equal(validateAdhanFile({name: 'evil.mp3', size: 100}, bytes(...ascii('<script>alert(1)'))).ok, false);
  assert.equal(validateAdhanFile({name: 'a.mp3', size: ADHAN_MAX_BYTES + 1}, mp3).ok, false);
  assert.equal(validateAdhanFile({name: 'a.mp3', size: 0}, mp3).ok, false);
  assert.equal(validateAdhanFile({name: 'a.wav', size: 100}, mp3).ok, false);
  assert.equal(validateAdhanFile({name: 'noext', size: 100}, mp3).ok, false);
});

test('titles are trimmed, collapsed and capped', () => {
  assert.equal(normalizeAdhanTitle('  أذان   الحرم  '), 'أذان الحرم');
  assert.equal(normalizeAdhanTitle('x'.repeat(300)).length, 100);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { editorCss } from '../src/components/entry/editor-css.ts';
import { noteBodyFontSize, noteTextSizeOf, noteTextSizes } from '../src/domain/note-text.ts';

const palette = { accent: '#d99a52', background: '#0b0a09', onAccent: '#1a120a', text: '#f3efe8', textDim: '#8b8378' };

test('the note text is 14 points, or 17 with Larger note text, and the title grows with it', () => {
  assert.match(editorCss(palette, 'dark', noteTextSizes.standard.body), /body \{[^}]*font-size: 14px !important;/);
  assert.match(editorCss(palette, 'dark', noteTextSizes.large.body), /body \{[^}]*font-size: 17px !important;/);
  assert.ok(noteTextSizes.large.title > noteTextSizes.standard.title);
  assert.ok(noteTextSizes.large.titleLineHeight > noteTextSizes.large.title);
});

test('a missing or unknown saved size is standard', () => {
  assert.equal(noteTextSizeOf(undefined), 'standard');
  assert.equal(noteTextSizeOf('huge'), 'standard');
  assert.equal(noteTextSizeOf('large'), 'large');
});

test("the note text follows the iPhone's Text Size, like the rest of the app", () => {
  // The default Text Size leaves the sizes as they are.
  assert.equal(noteBodyFontSize('standard', 1), 14);
  assert.equal(noteBodyFontSize('large', 1), 17);
  // Bigger and smaller Text Size settings, and the largest accessibility size.
  assert.equal(noteBodyFontSize('standard', 1.353), 19);
  assert.equal(noteBodyFontSize('standard', 0.823), 12);
  assert.equal(noteBodyFontSize('large', 3.571), 61);
  // A missing or broken scale is treated as the default.
  assert.equal(noteBodyFontSize('standard', Number.NaN), 14);
  assert.equal(noteBodyFontSize('standard', 0), 14);
});

test('To-Do boxes and spacing grow with the text, and are unchanged at the standard size', () => {
  const standard = editorCss(palette, 'dark', 14);
  assert.match(standard, /height: 18px !important;/);
  assert.match(standard, /center \/ 14px no-repeat/);
  assert.match(standard, /margin: 0 10px 0 0 !important; padding-top: 3px;/);
  const doubled = editorCss(palette, 'dark', 28);
  assert.match(doubled, /height: 36px !important;/);
  assert.match(doubled, /margin: 0 20px 0 0 !important; padding-top: 6px;/);
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// Metro's file watcher matches paths with micromatch, which uses braces. The root package.json points
// braces at vendor/braces: braces 3.0.3 with a nesting-depth limit (GHSA-vfj7-8cjw-p6xm).
const require = createRequire(import.meta.url);
// The metro-file-map that Expo's Metro actually loads, wherever npm put it.
const resolveFrom = (from, request) => path.dirname(require.resolve(`${request}/package.json`, { paths: [from] }));
const expoMetro = resolveFrom(resolveFrom(fileURLToPath(new URL('..', import.meta.url)), 'expo'), '@expo/metro');
const metroFileMap = `${resolveFrom(expoMetro, 'metro-file-map')}/`;
const micromatchPath = require.resolve('micromatch', { paths: [metroFileMap] });
const bracesPath = createRequire(micromatchPath).resolve('braces');
const braces = require(bracesPath);

test("Metro's micromatch uses the fixed braces in vendor/", () => {
  assert.equal(bracesPath, fileURLToPath(new URL('../vendor/braces/index.js', import.meta.url)));
  assert.deepEqual(require(micromatchPath).braces('x/{a,b}', { expand: true }), ['x/a', 'x/b']);
});

test('patterns expand exactly as in braces 3.0.3', () => {
  // Expected values are what the published 3.0.3 returns (checked against it on 24 patterns, both modes).
  assert.deepEqual(braces('a/{b,c}/d', { expand: true }), ['a/b/d', 'a/c/d']);
  assert.deepEqual(braces('a/{b,c}/d'), ['a/(b|c)/d']);
  assert.deepEqual(braces('{1..5}', { expand: true }), ['1', '2', '3', '4', '5']);
  assert.deepEqual(braces('{01..03}', { expand: true }), ['01', '02', '03']);
  assert.deepEqual(braces('file.{js,ts,tsx}', { expand: true }), ['file.js', 'file.ts', 'file.tsx']);
  assert.deepEqual(braces('a{b,c{d,e}f}g', { expand: true }), ['abg', 'acdfg', 'acefg']);
});

test('nesting up to 100 deep works; deeper is refused with a SyntaxError instead of crashing', () => {
  const nested = (depth) => `${'{'.repeat(depth)}a,b${'}'.repeat(depth)}`;
  assert.doesNotThrow(() => braces(nested(100), { expand: true }));
  assert.throws(() => braces(nested(101), { expand: true }), SyntaxError);
  // 3.0.3 overflowed the stack here (RangeError: Maximum call stack size exceeded), which ends a Node process.
  assert.throws(() => braces(nested(4000), { expand: true }), SyntaxError);
  assert.throws(() => braces(`${'('.repeat(4000)}{a,b}${')'.repeat(4000)}`, { expand: true }), SyntaxError);
});

test("Metro's file watcher still matches paths", () => {
  const { includedByGlob } = require(`${metroFileMap}src/watchers/common.js`);
  assert.equal(includedByGlob('f', ['**/*.{js,ts}'], false, 'src/a.ts'), true);
  assert.equal(includedByGlob('f', ['**/*.{js,ts}'], false, 'src/a.png'), false);
  assert.equal(includedByGlob('f', [], false, 'src/a.ts'), true);
});

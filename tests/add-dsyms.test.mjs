import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  expectedWithoutSymbols,
  frameworksWithoutSymbols,
  parseUuids,
  podVersion,
  symbolDownloads,
} from '../scripts/add-dsyms.mjs';

const lock = readFileSync(new URL('../ios/Podfile.lock', import.meta.url), 'utf8');

test('the symbol downloads follow the React Native and Hermes versions that are installed', () => {
  const core = podVersion(lock, 'React-Core-prebuilt');
  const hermes = podVersion(lock, 'hermes-engine');
  assert.equal(
    core,
    JSON.parse(readFileSync(new URL('../node_modules/react-native/package.json', import.meta.url), 'utf8')).version,
  );
  assert.deepEqual(symbolDownloads(lock), [
    `https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/${core}/react-native-artifacts-${core}-reactnative-core-dSYM-release.tar.gz`,
    `https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/${podVersion(lock, 'ReactNativeDependencies')}/react-native-artifacts-${podVersion(lock, 'ReactNativeDependencies')}-reactnative-dependencies-dSYM-release.tar.gz`,
    `https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${hermes}/hermes-ios-${hermes}-hermes-framework-dSYM-release.tar.gz`,
  ]);
  assert.throws(() => podVersion(lock, 'NotAPod'), /NotAPod is not in ios\/Podfile.lock/);
});

test('UUIDs are read from dwarfdump output', () => {
  const output = [
    'UUID: ee15b752-fb46-35f2-b0bb-a46636572385 (arm64) /x/React.framework/React',
    'UUID: 1A2B3C4D-0000-1111-2222-333344445555 (x86_64) /x/React.framework/React',
  ].join('\n');
  assert.deepEqual(
    parseUuids(output),
    new Set(['EE15B752-FB46-35F2-B0BB-A46636572385', '1A2B3C4D-0000-1111-2222-333344445555']),
  );
  assert.equal(parseUuids('no uuids here').size, 0);
});

test('only frameworks without a dSYM in the archive are looked up, and only SDWebImage may stay without', () => {
  const frameworks = [
    'ExpoImage.framework',
    'React.framework',
    'SDWebImage.framework',
    'libavif.framework',
    'Info.plist',
  ];
  const dsyms = ['Bunari.app.dSYM', 'libavif.framework.dSYM'];
  assert.deepEqual(frameworksWithoutSymbols(frameworks, dsyms), ['ExpoImage', 'React', 'SDWebImage']);
  assert.deepEqual(expectedWithoutSymbols, [
    'SDWebImage',
    'SDWebImageAVIFCoder',
    'SDWebImageSVGCoder',
    'SDWebImageWebPCoder',
  ]);
});

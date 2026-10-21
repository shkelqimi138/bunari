// Adds the debug symbols (dSYMs) that prebuilt frameworks are archived without, so App Store Connect
// can show names instead of memory addresses for crashes inside them. Run after archiving, before
// Distribute App:
//   npm run dsyms:add -- "<path to the .xcarchive>"
// React Native publishes the symbols for React, ReactNativeDependencies and Hermes on Maven Central;
// they are downloaded once (about 540 MB) into ~/Library/Caches/bunari-dsyms. ExpoImage's symbols are
// in its xcframework, but CocoaPods loses them: it copies expo-image's six xcframeworks into one folder
// with `rsync --delete`, so only the last one's dSYMs survive. A dSYM is added only when its UUID matches
// the framework in the archive. SDWebImage and its three coders have no published symbols and stay
// without (user, 2026-10-08); building expo-image from source would be the only fix.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const maven = 'https://repo1.maven.org/maven2';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const cacheDir = path.join(homedir(), 'Library', 'Caches', 'bunari-dsyms');

// Frameworks that are known to have no symbols anywhere; any other missing one fails the run.
export const expectedWithoutSymbols = [
  'SDWebImage',
  'SDWebImageAVIFCoder',
  'SDWebImageSVGCoder',
  'SDWebImageWebPCoder',
];

// The installed version of a pod, from ios/Podfile.lock ("  - hermes-engine (250829098.0.17):").
export function podVersion(lock, pod) {
  const escaped = pod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = lock.match(new RegExp(`^  - ${escaped} \\(([^)]+)\\)`, 'm'));
  if (!match?.[1]) throw new Error(`${pod} is not in ios/Podfile.lock`);
  return match[1];
}

// The release dSYM archives for the prebuilt React Native frameworks this project installed.
export function symbolDownloads(lock) {
  const core = podVersion(lock, 'React-Core-prebuilt');
  const dependencies = podVersion(lock, 'ReactNativeDependencies');
  const hermes = podVersion(lock, 'hermes-engine');
  const react = `${maven}/com/facebook/react/react-native-artifacts`;
  return [
    `${react}/${core}/react-native-artifacts-${core}-reactnative-core-dSYM-release.tar.gz`,
    `${react}/${dependencies}/react-native-artifacts-${dependencies}-reactnative-dependencies-dSYM-release.tar.gz`,
    `${maven}/com/facebook/hermes/hermes-ios/${hermes}/hermes-ios-${hermes}-hermes-framework-dSYM-release.tar.gz`,
  ];
}

// The UUIDs in `dwarfdump --uuid` output ("UUID: EE15B752-... (arm64) /path").
export function parseUuids(output) {
  return new Set([...output.matchAll(/UUID: ([0-9A-F-]{36}) /gi)].map((match) => match[1].toUpperCase()));
}

// Frameworks in the app that have no dSYM in the archive.
export function frameworksWithoutSymbols(frameworks, dsyms) {
  const present = new Set(
    dsyms.filter((name) => name.endsWith('.framework.dSYM')).map((name) => name.slice(0, -'.framework.dSYM'.length)),
  );
  return frameworks
    .filter((name) => name.endsWith('.framework'))
    .map((name) => name.slice(0, -'.framework'.length))
    .filter((name) => !present.has(name))
    .sort();
}

const uuidsOf = (target) => parseUuids(execFileSync('/usr/bin/dwarfdump', ['--uuid', target], { encoding: 'utf8' }));

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

// Downloads and unpacks one dSYM archive into the cache, once; returns the unpacked folder.
async function cachedSymbols(url) {
  const name = path.basename(url, '.tar.gz');
  const folder = path.join(cacheDir, name);
  if (existsSync(path.join(folder, '.complete'))) return folder;
  mkdirSync(cacheDir, { recursive: true });
  const tarball = path.join(cacheDir, `${name}.tar.gz`);
  const partial = `${tarball}.part`;
  console.log(`Downloading ${path.basename(url)}…`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const checksum = await fetch(`${url}.sha256`);
  if (!checksum.ok) throw new Error(`No checksum (${checksum.status}): ${url}.sha256`);
  const expected = (await checksum.text()).trim().split(/\s+/)[0]?.toLowerCase();
  if ((await sha256(partial)) !== expected) {
    rmSync(partial, { force: true });
    throw new Error(`Checksum mismatch: ${url}`);
  }
  renameSync(partial, tarball);
  rmSync(folder, { force: true, recursive: true });
  mkdirSync(folder, { recursive: true });
  execFileSync('/usr/bin/tar', ['-xzf', tarball, '-C', folder]);
  rmSync(tarball, { force: true });
  writeFileSync(path.join(folder, '.complete'), '');
  return folder;
}

// Every <name>.framework.dSYM under the given folders.
function findDsyms(name, roots) {
  const output = execFileSync('/usr/bin/find', [...roots, '-type', 'd', '-name', `${name}.framework.dSYM`, '-prune'], {
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean);
}

async function main() {
  const archiveArg = process.argv[2];
  if (!archiveArg) throw new Error('Usage: npm run dsyms:add -- "<path to the .xcarchive>"');
  const archive = path.resolve(archiveArg);
  const frameworksDir = path.join(archive, 'Products', 'Applications', 'Bunari.app', 'Frameworks');
  const dsymsDir = path.join(archive, 'dSYMs');
  if (!existsSync(frameworksDir) || !existsSync(dsymsDir)) throw new Error(`Not a Bunari archive: ${archive}`);

  const missing = frameworksWithoutSymbols(readdirSync(frameworksDir), readdirSync(dsymsDir));
  if (missing.every((name) => expectedWithoutSymbols.includes(name))) {
    console.log(`Nothing to add.${missing.length ? ` Without symbols, as expected: ${missing.join(', ')}` : ''}`);
    return;
  }

  const lock = readFileSync(path.join(projectRoot, 'ios', 'Podfile.lock'), 'utf8');
  const roots = [];
  for (const url of symbolDownloads(lock)) roots.push(await cachedSymbols(url));
  roots.push(path.join(projectRoot, 'ios', 'Pods'));

  const added = [];
  const stillMissing = [];
  for (const name of missing) {
    const wanted = uuidsOf(path.join(frameworksDir, `${name}.framework`, name));
    const match =
      wanted.size === 0
        ? undefined
        : findDsyms(name, roots).find((dsym) => {
            const available = uuidsOf(dsym);
            return [...wanted].every((uuid) => available.has(uuid));
          });
    if (!match) {
      stillMissing.push(name);
      continue;
    }
    execFileSync('/usr/bin/ditto', [match, path.join(dsymsDir, `${name}.framework.dSYM`)]);
    added.push(name);
  }

  console.log(`Added symbols: ${added.join(', ') || 'none'}`);
  if (stillMissing.length) console.log(`Still without symbols: ${stillMissing.join(', ')}`);
  const unexpected = stillMissing.filter((name) => !expectedWithoutSymbols.includes(name));
  if (unexpected.length) throw new Error(`No matching symbols for ${unexpected.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

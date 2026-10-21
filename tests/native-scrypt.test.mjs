import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

// The iOS app derives PIN and recovery wrapping keys with the native Swift scrypt in
// modules/bunari-scrypt. It must match @noble/hashes byte for byte, or data wrapped
// before the switch would no longer open. Compiled on macOS only.
const moduleRoot = fileURLToPath(new URL('../modules/bunari-scrypt/', import.meta.url));
const hasSwift = process.platform === 'darwin' && spawnSync('swiftc', ['--version']).status === 0;
let cli;

before(() => {
  if (!hasSwift) return;
  cli = join(mkdtempSync(join(tmpdir(), 'bunari-scrypt-')), 'scrypt');
  execFileSync('swiftc', ['-O', '-o', cli, join(moduleRoot, 'ios/Scrypt.swift'), join(moduleRoot, 'test/main.swift')]);
});

const native = (password, saltHex, n, r, p, dkLen) =>
  execFileSync(cli, [password, saltHex, String(n), String(r), String(p), String(dkLen)], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();

test('native scrypt matches the RFC 7914 test vectors', { skip: !hasSwift && 'needs swiftc on macOS' }, () => {
  assert.equal(
    native('password', bytesToHex(utf8ToBytes('NaCl')), 1024, 8, 16, 64),
    'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640',
  );
  assert.equal(
    native('pleaseletmein', bytesToHex(utf8ToBytes('SodiumChloride')), 16384, 8, 1, 64),
    '7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887',
  );
});

test(
  'native scrypt matches the JavaScript implementation for PINs and recovery keys',
  { skip: !hasSwift && 'needs swiftc on macOS' },
  () => {
    const params = { N: 32768, r: 8, p: 1, dkLen: 32 };
    const cases = [
      ['123456', '00112233445566778899aabbccddeeff'],
      ['987654321012', 'ffeeddccbbaa99887766554433221100'],
      ['a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', '0f1e2d3c4b5a69788796a5b4c3d2e1f0'],
      ['pässwörd ✓', 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf'],
    ];
    for (const [secret, salt] of cases) {
      const expected = bytesToHex(
        scrypt(utf8ToBytes(secret), hexToBytes(salt), { ...params, maxmem: 64 * 1024 * 1024 }),
      );
      assert.equal(native(secret, salt, params.N, params.r, params.p, params.dkLen), expected, secret);
    }
  },
);

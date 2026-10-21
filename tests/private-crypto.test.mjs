import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decryptPrivateJson,
  encryptPrivateJson,
  generatePrivateMasterKey,
  unwrapPrivateMasterKey,
  wrapPrivateMasterKey,
} from '../src/security/private-crypto.ts';
import { normalizeCiphertext, sealedValueProblem } from '../src/security/sealed-value.ts';

// Saved Private values go through JSON (Keychain, AsyncStorage, Supabase) before they are opened again.
const stored = (value) => JSON.parse(JSON.stringify(value));
const pinContext = 'private-key:v1:user:pin';

test('a PIN envelope still opens after being saved and loaded', async () => {
  const masterKey = await generatePrivateMasterKey();
  const envelope = await wrapPrivateMasterKey(masterKey, '123456', pinContext);
  assert.equal(typeof envelope.ciphertext, 'string', 'the ciphertext is saved as base64 text');
  assert.equal(sealedValueProblem(stored(envelope)), null);
  assert.equal(await unwrapPrivateMasterKey(stored(envelope), '123456', pinContext), masterKey);
  await assert.rejects(unwrapPrivateMasterKey(stored(envelope), '654321', pinContext));
});

test('a Private entry still opens after being saved and loaded', async () => {
  const masterKey = await generatePrivateMasterKey();
  const sealed = await encryptPrivateJson({ title: 'Secret' }, masterKey, 'private-entry:v1');
  assert.deepEqual(await decryptPrivateJson(stored(sealed), masterKey, 'private-entry:v1'), { title: 'Secret' });
});

// Values written by builds 7–11 stored the ciphertext bytes as {"0":…,"1":…}: as an object
// on the device and as its JSON text in Supabase. The bytes are intact, so they still open.
test('values saved in the earlier byte-object format still open', async () => {
  const masterKey = await generatePrivateMasterKey();
  const envelope = await wrapPrivateMasterKey(masterKey, '123456', pinContext);
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  const asObject = Object.fromEntries([...bytes].map((byte, index) => [String(index), byte]));

  const onDevice = { ...envelope, ciphertext: asObject };
  const inSupabase = { ...envelope, ciphertext: JSON.stringify(asObject) };
  assert.equal(normalizeCiphertext(asObject), envelope.ciphertext);
  assert.equal(normalizeCiphertext(JSON.stringify(asObject)), envelope.ciphertext);
  assert.equal(sealedValueProblem(stored(onDevice)), null, 'not reported as damaged');
  assert.equal(await unwrapPrivateMasterKey(stored(onDevice), '123456', pinContext), masterKey);
  assert.equal(await unwrapPrivateMasterKey(inSupabase, '123456', pinContext), masterKey);
});

test('only whole byte objects are repaired', () => {
  assert.equal(normalizeCiphertext({ 0: 1, 2: 3 }), null, 'a gap is not a byte array');
  assert.equal(normalizeCiphertext({ 0: 256 }), null);
  assert.equal(normalizeCiphertext({ a: 1 }), null);
  assert.equal(normalizeCiphertext('{not json'), '{not json', 'other text is left for the base64 check');
  assert.equal(normalizeCiphertext(undefined), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sealedValueProblem, wrappedKeyProblem } from '../src/security/sealed-value.ts';

const nonce = 'AAECAwQFBgcICQoL'; // 12 bytes
const ciphertext = 'AAECAwQFBgcICQoLDA0ODxAREhM='; // 20 bytes

test('a well-formed sealed value has no structural problem', () => {
  assert.equal(sealedValueProblem({ ciphertext, nonce, version: 1 }), null);
});

test('structural problems are described without revealing content', () => {
  assert.equal(
    sealedValueProblem({ ciphertext, nonce: 'not base64!', version: 1 }),
    'nonce is not valid base64 (11 characters)',
  );
  assert.equal(sealedValueProblem({ ciphertext, nonce: '', version: 1 }), 'nonce is empty');
  assert.equal(sealedValueProblem({ ciphertext, version: 1 }), 'nonce is missing');
  assert.equal(sealedValueProblem({ ciphertext, nonce: 'AAECAwQFBgc=', version: 1 }), 'nonce is 8 bytes instead of 12');
  assert.equal(sealedValueProblem({ ciphertext: 'AAECAw==', nonce, version: 1 }), 'ciphertext is too short (4 bytes)');
  assert.equal(
    sealedValueProblem({ ciphertext: 'abc\ndef=', nonce, version: 1 }),
    'ciphertext is not valid base64 (8 characters)',
  );
  assert.equal(sealedValueProblem({ ciphertext, nonce, version: 2 }), 'unsupported encryption version 2');
});

test('a damaged PIN envelope is told apart from a wrong PIN', () => {
  const envelope = { ciphertext, kdf: 'scrypt', nonce, salt: '00112233445566778899aabbccddeeff', version: 1 };
  assert.equal(wrappedKeyProblem(envelope), null, 'a well-formed envelope means a failure is a wrong PIN');
  assert.equal(wrappedKeyProblem({ ...envelope, salt: 'short' }), 'salt is not valid');
  assert.equal(wrappedKeyProblem({ ...envelope, salt: undefined }), 'salt is not valid');
  assert.equal(wrappedKeyProblem({ ...envelope, kdf: 'pbkdf2' }), 'unsupported key derivation pbkdf2');
  assert.equal(wrappedKeyProblem({ ...envelope, nonce: 'bad!' }), 'nonce is not valid base64 (4 characters)');
});

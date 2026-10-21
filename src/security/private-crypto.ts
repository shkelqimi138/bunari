// Private journal encryption: AES-GCM sealing and scrypt-wrapped master keys
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  aesDecryptAsync,
  aesEncryptAsync,
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  getRandomBytes,
} from 'expo-crypto';

import { deriveScryptKey } from '@/security/scrypt';
import { bytesToBase64, normalizeCiphertext } from '@/security/sealed-value';

export type SealedValue = {
  ciphertext: string;
  nonce: string;
  version: 1;
};

export type WrappedPrivateKey = SealedValue & {
  kdf: 'scrypt';
  kdfParameters: typeof kdfParameters;
  salt: string;
};

const kdfParameters = { N: 32768, r: 8, p: 1, dkLen: 32 } as const;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) throw new Error('Invalid encoded value.');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function normalizeRecoveryKey(value: string) {
  return value.replace(/[^a-f0-9]/gi, '').toLowerCase();
}

async function encryptionKeyFromSecret(secret: string, salt: string) {
  const bytes = await deriveScryptKey(secret, hexToBytes(salt), kdfParameters);
  return AESEncryptionKey.import(bytes);
}

async function sealBytes(value: Uint8Array, key: AESEncryptionKey, additionalData: string): Promise<SealedValue> {
  const sealed = await aesEncryptAsync(value, key, { additionalData: utf8ToBytes(additionalData) });
  // Base64 is made here: expo-crypto 57.0.3 on iOS ignores `encoding` and returns bytes,
  // which do not survive being saved as JSON.
  const ciphertext: Uint8Array | string = await sealed.ciphertext({ includeTag: true });
  return {
    ciphertext: typeof ciphertext === 'string' ? ciphertext : bytesToBase64(ciphertext),
    nonce: (await sealed.iv('base64')) as string,
    version: 1,
  };
}

async function openBytes(value: SealedValue, key: AESEncryptionKey, additionalData: string) {
  if (value.version !== 1) throw new Error('Unsupported private encryption version.');
  const ciphertext = normalizeCiphertext(value.ciphertext);
  if (!ciphertext) throw new Error('Private ciphertext is missing.');
  const sealed = AESSealedData.fromParts(value.nonce, ciphertext, 16);
  return aesDecryptAsync(sealed, key, { additionalData: utf8ToBytes(additionalData) });
}

export async function generatePrivateMasterKey() {
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  return key.encoded('base64');
}

export function generateRecoveryKey() {
  const compact = bytesToHex(getRandomBytes(32)).toUpperCase();
  return compact.match(/.{1,4}/g)?.join('-') ?? compact;
}

export async function encryptPrivateJson(value: unknown, masterKey: string, context: string) {
  const key = await AESEncryptionKey.import(masterKey, 'base64');
  return sealBytes(utf8ToBytes(JSON.stringify(value)), key, context);
}

export async function decryptPrivateJson<T>(value: SealedValue, masterKey: string, context: string): Promise<T> {
  const key = await AESEncryptionKey.import(masterKey, 'base64');
  const bytes = await openBytes(value, key, context);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function wrapPrivateMasterKey(
  masterKey: string,
  secret: string,
  context: string,
): Promise<WrappedPrivateKey> {
  const salt = bytesToHex(getRandomBytes(16));
  const normalizedSecret = context.endsWith(':recovery') ? normalizeRecoveryKey(secret) : secret;
  const key = await encryptionKeyFromSecret(normalizedSecret, salt);
  return { ...(await sealBytes(utf8ToBytes(masterKey), key, context)), kdf: 'scrypt', kdfParameters, salt };
}

export async function unwrapPrivateMasterKey(value: WrappedPrivateKey, secret: string, context: string) {
  if (value.kdf !== 'scrypt') throw new Error('Unsupported private key derivation.');
  const normalizedSecret = context.endsWith(':recovery') ? normalizeRecoveryKey(secret) : secret;
  const key = await encryptionKeyFromSecret(normalizedSecret, value.salt);
  const bytes = await openBytes(value, key, context);
  return new TextDecoder().decode(bytes);
}

export function normalizedRecoveryKey(value: string) {
  return normalizeRecoveryKey(value);
}

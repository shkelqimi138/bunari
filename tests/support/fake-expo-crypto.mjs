// In-memory stand-in for expo-crypto that behaves like its iOS module, including the
// expo-crypto 57.0.3 quirk: SealedData.ciphertext() reads `outputFormat`, not the
// documented `encoding`, and otherwise returns bytes.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export { randomUUID } from 'node:crypto';

const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function toBytes(input) {
  if (typeof input === 'string') {
    if (!base64Pattern.test(input)) throw new Error('InvalidBase64Exception: Invalid base64 string');
    return new Uint8Array(Buffer.from(input, 'base64'));
  }
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new Error('Unsupported binary input');
}

const formatted = (bytes, format) =>
  format === 'base64' ? Buffer.from(bytes).toString('base64') : new Uint8Array(bytes);

export const AESKeySize = { AES128: 128, AES192: 192, AES256: 256 };

export function getRandomBytes(length) {
  return new Uint8Array(randomBytes(length));
}

export class AESEncryptionKey {
  constructor(bytes) {
    this.bytes = bytes;
  }
  static async generate(size = 256) {
    return new AESEncryptionKey(getRandomBytes(size / 8));
  }
  static async import(input, encoding) {
    if (typeof input === 'string' && encoding === 'hex')
      return new AESEncryptionKey(new Uint8Array(Buffer.from(input, 'hex')));
    return new AESEncryptionKey(toBytes(input));
  }
  async encoded(format) {
    return formatted(this.bytes, format);
  }
}

export class AESSealedData {
  constructor(iv, ciphertext, tag) {
    this.ivBytes = iv;
    this.ciphertextBytes = ciphertext;
    this.tagBytes = tag;
  }
  static fromParts(iv, ciphertext, tag = 16) {
    const ivBytes = toBytes(iv);
    const body = toBytes(ciphertext);
    if (typeof tag === 'number')
      return new AESSealedData(ivBytes, body.subarray(0, body.length - tag), body.subarray(body.length - tag));
    return new AESSealedData(ivBytes, body, toBytes(tag));
  }
  async iv(format) {
    return formatted(this.ivBytes, format);
  }
  async ciphertext(options) {
    const bytes = options?.includeTag ? Buffer.concat([this.ciphertextBytes, this.tagBytes]) : this.ciphertextBytes;
    return formatted(bytes, options?.outputFormat);
  }
}

export async function aesEncryptAsync(plaintext, key, options = {}) {
  const iv = getRandomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, iv);
  if (options.additionalData) cipher.setAAD(toBytes(options.additionalData));
  const body = Buffer.concat([cipher.update(toBytes(plaintext)), cipher.final()]);
  return new AESSealedData(iv, new Uint8Array(body), new Uint8Array(cipher.getAuthTag()));
}

export async function aesDecryptAsync(sealed, key, options = {}) {
  const decipher = createDecipheriv('aes-256-gcm', key.bytes, sealed.ivBytes);
  if (options.additionalData) decipher.setAAD(toBytes(options.additionalData));
  decipher.setAuthTag(sealed.tagBytes);
  return new Uint8Array(Buffer.concat([decipher.update(sealed.ciphertextBytes), decipher.final()]));
}

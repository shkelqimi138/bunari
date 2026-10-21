// iOS scrypt key derivation using the native module, with a JavaScript fallback
import { requireOptionalNativeModule } from 'expo';

import { deriveScryptKey as deriveInJavaScript, type ScryptParameters } from './scrypt';

export type { ScryptParameters };

type NativeScrypt = {
  scrypt(password: string, saltHex: string, n: number, r: number, p: number, dkLen: number): Promise<string>;
};

// Native scrypt (modules/bunari-scrypt): the same keys as the JavaScript version,
// but in a fraction of a second instead of several seconds on Hermes.
const native = requireOptionalNativeModule<NativeScrypt>('BunariScrypt');

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

export async function deriveScryptKey(secret: string, salt: Uint8Array, parameters: ScryptParameters) {
  if (!native) return deriveInJavaScript(secret, salt, parameters);
  const { N, r, p, dkLen } = parameters;
  return fromHex(await native.scrypt(secret, toHex(salt), N, r, p, dkLen));
}

// JavaScript scrypt key derivation used by tests and the Web preview
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

export type ScryptParameters = { N: number; r: number; p: number; dkLen: number };

// JavaScript scrypt, used where the native module is unavailable (tests and the
// Web preview). The iOS build uses scrypt.ios.ts, which produces the same keys.
export function deriveScryptKey(secret: string, salt: Uint8Array, parameters: ScryptParameters) {
  return scryptAsync(utf8ToBytes(secret), salt, { ...parameters, maxmem: 64 * 1024 * 1024 });
}

// Describes why an encrypted value cannot be opened without reading its contents,
// so an unreadable Private entry can be reported precisely and left untouched.

const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const nonceBytes = 12;
const tagBytes = 16;

function base64ByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function fieldProblem(name: string, value: unknown, minimumBytes: number, exactBytes?: number) {
  if (typeof value !== 'string') return `${name} is missing`;
  if (value.length === 0) return `${name} is empty`;
  if (!base64Pattern.test(value)) return `${name} is not valid base64 (${value.length} characters)`;
  const bytes = base64ByteLength(value);
  if (exactBytes !== undefined && bytes !== exactBytes) return `${name} is ${bytes} bytes instead of ${exactBytes}`;
  if (bytes < minimumBytes) return `${name} is too short (${bytes} bytes)`;
  return null;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function byteObjectToBase64(value: object) {
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const bytes = new Uint8Array(entries.length);
  for (const [key, byte] of entries) {
    const index = Number(key);
    if (!/^\d+$/.test(key) || index >= bytes.length || !Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    bytes[index] = byte;
  }
  return bytesToBase64(bytes);
}

// The ciphertext as base64 text. expo-crypto 57.0.3 returned bytes where base64 was
// asked for, so values saved by builds 7–11 hold them as {"0":…} (on the device) or as
// that object's JSON text (in Supabase). Those bytes are intact and are converted back.
// Returns null when the value is missing or not a byte array.
export function normalizeCiphertext(value: unknown): string | null {
  if (typeof value === 'string') {
    if (!value.startsWith('{')) return value;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (byteObjectToBase64(parsed) ?? value) : value;
    } catch {
      return value;
    }
  }
  if (value instanceof Uint8Array) return bytesToBase64(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) return byteObjectToBase64(value);
  return null;
}

// True when a saved value uses the earlier byte-object format and should be re-saved.
export function hasLegacyCiphertext(value: { ciphertext?: unknown }) {
  const normalized = normalizeCiphertext(value.ciphertext);
  return normalized !== null && normalized !== value.ciphertext;
}

// Returns a content-free description of a structural problem, or null when the
// value is well formed (a failure is then a wrong key or tampered data).
export function sealedValueProblem(value: { ciphertext?: unknown; nonce?: unknown; version?: unknown }) {
  if (value.version !== 1) return `unsupported encryption version ${String(value.version)}`;
  return (
    fieldProblem('nonce', value.nonce, nonceBytes, nonceBytes) ??
    fieldProblem('ciphertext', normalizeCiphertext(value.ciphertext) ?? value.ciphertext, tagBytes + 1)
  );
}

// The same check for a wrapped key (such as the PIN envelope), which also carries
// its key-derivation salt.
export function wrappedKeyProblem(value: {
  ciphertext?: unknown;
  kdf?: unknown;
  nonce?: unknown;
  salt?: unknown;
  version?: unknown;
}) {
  if (value.kdf !== 'scrypt') return `unsupported key derivation ${String(value.kdf)}`;
  if (typeof value.salt !== 'string' || !/^[0-9a-f]{32}$/i.test(value.salt)) return 'salt is not valid';
  return sealedValueProblem(value);
}

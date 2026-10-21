// Secure native storage for the Supabase auth session
import * as SecureStore from 'expo-secure-store';

const chunkSize = 1800;
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function chunkKey(key: string, index: number) {
  return `${key}.chunk.${index}`;
}

function metadataKey(key: string) {
  return `${key}.chunks`;
}

export const authStorage = {
  async getItem(key: string) {
    const countValue = await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions);

    if (!countValue) {
      return SecureStore.getItemAsync(key, secureStoreOptions);
    }

    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1) return null;

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index), secureStoreOptions)),
    );

    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join('');
  },

  async removeItem(key: string) {
    const countValue = await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions);
    const count = Number(countValue ?? 0);

    await Promise.all([
      SecureStore.deleteItemAsync(key, secureStoreOptions),
      SecureStore.deleteItemAsync(metadataKey(key), secureStoreOptions),
      ...Array.from({ length: Number.isInteger(count) ? count : 0 }, (_, index) =>
        SecureStore.deleteItemAsync(chunkKey(key, index), secureStoreOptions),
      ),
    ]);
  },

  async setItem(key: string, value: string) {
    const previousCountValue = await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions);
    const previousCount = Number(previousCountValue ?? 0);
    const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, 'gs')) ?? [''];

    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk, secureStoreOptions)),
    );
    await SecureStore.setItemAsync(metadataKey(key), String(chunks.length), secureStoreOptions);
    await SecureStore.deleteItemAsync(key, secureStoreOptions);

    if (Number.isInteger(previousCount) && previousCount > chunks.length) {
      await Promise.all(
        Array.from({ length: previousCount - chunks.length }, (_, offset) =>
          SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset), secureStoreOptions),
        ),
      );
    }
  },
};

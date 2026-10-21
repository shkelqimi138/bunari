// AsyncStorage helpers for reading and writing local JSON state
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readLocalJson<T>(key: string): Promise<T | null> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export function writeLocalJson(key: string, value: unknown) {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

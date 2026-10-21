// Web preview storage for the Supabase auth session
import AsyncStorage from '@react-native-async-storage/async-storage';

const isServer = typeof window === 'undefined';

export const authStorage = {
  getItem(key: string) {
    return isServer ? Promise.resolve(null) : AsyncStorage.getItem(key);
  },
  removeItem(key: string) {
    return isServer ? Promise.resolve() : AsyncStorage.removeItem(key);
  },
  setItem(key: string, value: string) {
    return isServer ? Promise.resolve() : AsyncStorage.setItem(key, value);
  },
};

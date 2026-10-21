// Keychain storage for the Private configuration and Face ID-protected master key
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { noPinAttempts, type PinAttempts } from './pin-attempts';
import type { PrivateDeviceConfiguration } from './private-key-store';

const standardOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const biometricOptions: SecureStore.SecureStoreOptions = {
  ...standardOptions,
  authenticationPrompt: 'Unlock your Private journal',
  requireAuthentication: true,
};

function configKey(userId: string) {
  return `private.config.v1.${userId}`;
}
function masterKey(userId: string) {
  return `private.master.v1.${userId}`;
}
function pinAttemptsKey(userId: string) {
  return `private.pin-attempts.v1.${userId}`;
}

export const privateKeyStore = {
  async clear(userId: string) {
    await Promise.all([
      SecureStore.deleteItemAsync(configKey(userId), standardOptions),
      SecureStore.deleteItemAsync(masterKey(userId), biometricOptions),
      SecureStore.deleteItemAsync(pinAttemptsKey(userId), standardOptions),
    ]);
  },
  deleteBiometricKey(userId: string) {
    return SecureStore.deleteItemAsync(masterKey(userId), biometricOptions);
  },
  getBiometricKey(userId: string) {
    return SecureStore.getItemAsync(masterKey(userId), biometricOptions);
  },
  async getConfiguration(userId: string) {
    const value = await SecureStore.getItemAsync(configKey(userId), standardOptions);
    return value ? (JSON.parse(value) as PrivateDeviceConfiguration) : null;
  },
  // Kept in the Keychain so reinstalling or clearing app data does not reset it.
  async getPinAttempts(userId: string): Promise<PinAttempts> {
    const value = await SecureStore.getItemAsync(pinAttemptsKey(userId), standardOptions);
    if (!value) return noPinAttempts;
    try {
      const parsed = JSON.parse(value) as Partial<PinAttempts>;
      return {
        failures: Number.isInteger(parsed.failures) ? parsed.failures! : 0,
        lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
      };
    } catch {
      return noPinAttempts;
    }
  },
  async isBiometricAvailable() {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return hardware && enrolled && types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  },
  saveBiometricKey(userId: string, value: string) {
    return SecureStore.setItemAsync(masterKey(userId), value, biometricOptions);
  },
  saveConfiguration(userId: string, configuration: PrivateDeviceConfiguration) {
    return SecureStore.setItemAsync(configKey(userId), JSON.stringify(configuration), standardOptions);
  },
  savePinAttempts(userId: string, attempts: PinAttempts) {
    return SecureStore.setItemAsync(pinAttemptsKey(userId), JSON.stringify(attempts), standardOptions);
  },
};

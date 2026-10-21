// Web preview Private key store (Private is unsupported on Web)
import { noPinAttempts, type PinAttempts } from './pin-attempts';
import type { PrivateDeviceConfiguration } from './private-key-store';

export const privateKeyStore = {
  clear: async (_userId: string) => undefined,
  deleteBiometricKey: async (_userId: string) => undefined,
  getBiometricKey: async (_userId: string) => null,
  getConfiguration: async (_userId: string): Promise<PrivateDeviceConfiguration | null> => null,
  getPinAttempts: async (_userId: string): Promise<PinAttempts> => noPinAttempts,
  isBiometricAvailable: async () => false,
  saveBiometricKey: async (_userId: string, _value: string) => undefined,
  saveConfiguration: async (_userId: string, _configuration: PrivateDeviceConfiguration) => undefined,
  savePinAttempts: async (_userId: string, _attempts: PinAttempts) => undefined,
};

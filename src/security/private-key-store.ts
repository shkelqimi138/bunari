// Platform-neutral declaration of the Private key store
import type { PinAttempts } from './pin-attempts';
import type { WrappedPrivateKey } from './private-crypto';

export type PrivateDeviceConfiguration = {
  biometricEnabled: boolean;
  pinEnabled: boolean;
  pinEnvelope: WrappedPrivateKey | null;
};

export declare const privateKeyStore: {
  clear(userId: string): Promise<void>;
  deleteBiometricKey(userId: string): Promise<void>;
  getBiometricKey(userId: string): Promise<string | null>;
  getConfiguration(userId: string): Promise<PrivateDeviceConfiguration | null>;
  getPinAttempts(userId: string): Promise<PinAttempts>;
  isBiometricAvailable(): Promise<boolean>;
  saveBiometricKey(userId: string, masterKey: string): Promise<void>;
  saveConfiguration(userId: string, configuration: PrivateDeviceConfiguration): Promise<void>;
  savePinAttempts(userId: string, attempts: PinAttempts): Promise<void>;
};

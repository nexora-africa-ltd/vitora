import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { deleteSensitiveValue, getSensitiveValue, setSensitiveValue } from '@/lib/storage/secure-storage';

const BIOMETRIC_ENABLED_KEY = 'vitora.mobile.biometric-enabled';

export type BiometricType = 'face' | 'fingerprint' | 'iris';

export interface BiometricStatus {
  available: boolean;
  enabled: boolean;
  label: string;
  supportedTypes: BiometricType[];
}

function mapAuthenticationType(type: LocalAuthentication.AuthenticationType): BiometricType | null {
  if (type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) {
    return 'face';
  }

  if (type === LocalAuthentication.AuthenticationType.FINGERPRINT) {
    return 'fingerprint';
  }

  if (type === LocalAuthentication.AuthenticationType.IRIS) {
    return 'iris';
  }

  return null;
}

function getBiometricLabel(types: BiometricType[]): string {
  if (types.includes('face')) {
    return Platform.OS === 'ios' ? 'Face ID' : 'Face unlock';
  }

  if (types.includes('fingerprint')) {
    return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  }

  if (types.includes('iris')) {
    return 'Iris';
  }

  return 'device biometrics';
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  return (await getSensitiveValue(BIOMETRIC_ENABLED_KEY)) === 'true';
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const [enabled, hasHardware, enrolled, supported] = await Promise.all([
    isBiometricUnlockEnabled(),
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  const supportedTypes = supported
    .map(mapAuthenticationType)
    .filter((type): type is BiometricType => type != null);

  return {
    available: hasHardware && enrolled && supportedTypes.length > 0,
    enabled,
    label: getBiometricLabel(supportedTypes),
    supportedTypes,
  };
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await deleteSensitiveValue(BIOMETRIC_ENABLED_KEY);
    return;
  }

  const status = await getBiometricStatus();
  if (!status.available) {
    throw new Error('Set up Face ID, fingerprint, or another enrolled biometric first.');
  }

  await setSensitiveValue(BIOMETRIC_ENABLED_KEY, 'true');
}

function getBiometricErrorMessage(error?: LocalAuthentication.LocalAuthenticationError): string {
  if (!error) {
    return 'Biometric authentication was cancelled.';
  }

  if (error === 'user_cancel' || error === 'app_cancel' || error === 'system_cancel') {
    return 'Biometric authentication was cancelled.';
  }

  if (error === 'not_enrolled') {
    return 'No biometric method is enrolled on this device.';
  }

  if (error === 'not_available') {
    return 'Biometric authentication is not available on this device.';
  }

  if (error === 'lockout' || error === 'timeout') {
    return 'Too many attempts. Use your device passcode or try again later.';
  }

  return 'Biometric authentication failed.';
}

export async function promptForBiometricUnlock(promptMessage = 'Unlock Vitora session'): Promise<{ success: boolean; error?: string }> {
  const status = await getBiometricStatus();
  if (!status.available) {
    return {
      success: false,
      error: 'Biometric authentication is not available on this device.',
    };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use device passcode',
    disableDeviceFallback: false,
  });

  if (result.success) {
    return { success: true };
  }

  return {
    success: false,
    error: getBiometricErrorMessage(result.error),
  };
}
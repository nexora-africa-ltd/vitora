import * as LocalAuthentication from 'expo-local-authentication';

import { getBiometricStatus, promptForBiometricUnlock, setBiometricUnlockEnabled } from './biometric';

const mockedLocalAuthentication = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

describe('biometric helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    mockedLocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    mockedLocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);
  });

  it('reports availability and friendly label', async () => {
    const status = await getBiometricStatus();

    expect(status.available).toBe(true);
    expect(status.label).toBeTruthy();
    expect(status.supportedTypes).toEqual(['fingerprint']);
  });

  it('requires enrolled biometrics before enabling biometric unlock', async () => {
    mockedLocalAuthentication.isEnrolledAsync.mockResolvedValue(false);

    await expect(setBiometricUnlockEnabled(true)).rejects.toThrow('Set up Face ID, fingerprint, or another enrolled biometric first.');
  });

  it('returns success after a successful biometric prompt', async () => {
    mockedLocalAuthentication.authenticateAsync.mockResolvedValueOnce({ success: true });

    await expect(promptForBiometricUnlock()).resolves.toEqual({ success: true });
  });
});

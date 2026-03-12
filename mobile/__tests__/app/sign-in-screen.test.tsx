import { fireEvent, render, screen } from '@testing-library/react-native';

import SignInScreen from '@/app/sign-in';
import { lightTheme as mockLightTheme } from '@/constants/theme';

const mockReplace = jest.fn();
const mockUnlockWithBiometrics = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ children }: { children?: React.ReactNode }) => children ?? null,
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: mockLightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({
    apiBaseUrl: 'http://127.0.0.1:9088',
    isAuthenticated: true,
    isHydrating: false,
    login: jest.fn(async () => ({ success: true })),
    updateApiBaseUrl: jest.fn(async () => undefined),
    user: { username: 'jdoe' },
  }),
}));

jest.mock('@/lib/auth/session-timeout', () => ({
  useSessionTimeout: () => ({
    biometric: {
      available: true,
      enabled: true,
      label: 'Fingerprint',
    },
    clearLock: jest.fn(),
    isLocked: true,
    isUnlocking: false,
    refreshSecurityState: jest.fn(async () => undefined),
    unlockWithBiometrics: (...args: unknown[]) => mockUnlockWithBiometrics(...args),
  }),
}));

describe('SignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlockWithBiometrics.mockResolvedValue({ success: true });
  });

  it('shows biometric unlock for a locked session', async () => {
    render(<SignInScreen />);

    expect(screen.getByText('Session locked')).toBeTruthy();

    fireEvent.press(screen.getByText('Unlock with Fingerprint'));

    expect(mockUnlockWithBiometrics).toHaveBeenCalled();
  });
});
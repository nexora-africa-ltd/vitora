import { render, screen } from '@testing-library/react-native';

import MoreScreen from '@/app/(tabs)/more';

const mockPush = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('MoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tailors launchers for pharmacists', () => {
    mockUseAuth.mockReturnValue({
      user: {
        is_staff: true,
        role: 'Pharmacist',
        role_category: 'Pharmacy',
        permissions: [],
      },
    });

    render(<MoreScreen />);

    expect(screen.getByText('Pharmacy workspace')).toBeTruthy();
    expect(screen.getByText('Pharmacy queue')).toBeTruthy();
    expect(screen.getByText('Laboratory orders')).toBeTruthy();
  });

  it('tailors launchers for laboratory users', () => {
    mockUseAuth.mockReturnValue({
      user: {
        is_staff: true,
        role: 'Laboratory Technologist',
        role_category: 'Laboratory',
        permissions: [],
      },
    });

    render(<MoreScreen />);

    expect(screen.getByText('Laboratory workspace')).toBeTruthy();
    expect(screen.getByText('Laboratory results')).toBeTruthy();
    expect(screen.getByText('Prescriptions')).toBeTruthy();
  });
});

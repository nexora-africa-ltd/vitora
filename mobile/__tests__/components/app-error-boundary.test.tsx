import { render, screen } from '@testing-library/react-native';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { lightTheme } from '@/constants/theme';

const mockTheme = lightTheme;

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: mockTheme,
    isDarkMode: false,
  }),
}));

function CrashyComponent() {
  throw new Error('Simulated mobile crash');
  return null;
}

describe('AppErrorBoundary', () => {
  it('renders a recovery state when a child crashes', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <CrashyComponent />
      </AppErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Simulated mobile crash')).toBeTruthy();

    consoleSpy.mockRestore();
  });
});
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AuditLogScreen from '@/app/settings/audit-log';
import { lightTheme as mockLightTheme } from '@/constants/theme';
import { auditApi } from '@/lib/api/audit';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
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
    user: {
      id: 14,
      username: 'jdoe',
    },
  }),
}));

jest.mock('@/lib/api/audit', () => ({
  auditApi: {
    listAuditLogs: jest.fn(),
  },
}));

const mockedAuditApi = auditApi as jest.Mocked<typeof auditApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogScreen />
    </QueryClientProvider>
  );
}

describe('AuditLogScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuditApi.listAuditLogs.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          user: 14,
          username: 'jdoe',
          user_name: 'Jane Doe',
          action: 'patient_view',
          resource_type: 'Patient',
          resource_id: 55,
          timestamp: '2026-03-13T10:15:00Z',
          ip_address: '127.0.0.1',
          user_agent: 'Jest',
          details: {},
          patient_id: 55,
        },
      ],
    });
  });

  it('renders audit entries and lets the user go back', async () => {
    renderScreen();

    expect(await screen.findByText('Your activity')).toBeTruthy();
    expect(screen.getAllByText('patient view').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByText('Back to settings'));

    expect(mockBack).toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import WardListScreen from '@/app/inpatient/index';
import { inpatientApi } from '@/lib/api/inpatient';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/inpatient', () => ({
  inpatientApi: {
    listWards: jest.fn(),
  },
}));

const mockedInpatientApi = inpatientApi as jest.Mocked<typeof inpatientApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <WardListScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('WardListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedInpatientApi.listWards.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: 'Medical Ward 1',
          code: 'MW001',
          ward_type: 'MEDICAL',
          ward_type_display: 'Medical',
          capacity: 20,
          total_beds: 20,
          occupied_beds: 12,
          available_beds: 8,
          occupancy_rate: 60,
          is_active: true,
          gender_restriction: 'MIXED',
          age_group_restriction: 'ALL',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'ICU',
          code: 'ICU001',
          ward_type: 'ICU',
          ward_type_display: 'ICU',
          capacity: 6,
          total_beds: 6,
          occupied_beds: 5,
          available_beds: 1,
          occupancy_rate: 83,
          is_active: true,
          gender_restriction: 'MIXED',
          age_group_restriction: 'ALL',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    } as never);
  });

  it('renders ward list with occupancy stats', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Medical Ward 1')).toBeTruthy();
    expect(screen.getByText('ICU')).toBeTruthy();
    expect(screen.getByText('12/20')).toBeTruthy();
    expect(screen.getByText('5/6')).toBeTruthy();

    await waitFor(() => {
      expect(mockedInpatientApi.listWards).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      );
    });

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('shows aggregate metrics for total, occupied, and available beds', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('26')).toBeTruthy(); // total beds
    expect(screen.getByText('17')).toBeTruthy(); // occupied
    expect(screen.getByText('9')).toBeTruthy(); // available

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('navigates to admissions/new when Admit button is pressed', async () => {
    const { router } = require('expo-router');
    const rendered = renderScreen();

    const button = await screen.findByText('Admit patient');
    fireEvent.press(button);

    expect(router.push).toHaveBeenCalledWith('/inpatient/admissions/new');

    rendered.unmount();
    rendered.queryClient.clear();
  });
});

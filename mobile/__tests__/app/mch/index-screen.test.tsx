import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import MCHScreen from '@/app/mch/index';

const mockPush = jest.fn();

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

jest.mock('@/lib/hooks/use-local-mch', () => ({
  useLocalMCHRegistrations: () => ({
    count: 1,
    isLoading: false,
    registrations: [
      {
        id: 9,
        mch_number: 'MCH-20260313-0009',
        mother: 14,
        mother_name: 'Jane Doe',
        mother_mrn: 'MRN-20260310-0001',
        registration_date: '2026-03-13',
        status: 'ACTIVE',
        is_high_risk: true,
        linda_jamii_beneficiary: true,
        edd: '2026-08-12',
        gestation_display: '18 weeks',
        trimester: 2,
        gravida: 2,
        parity: 1,
        current_gestation_weeks: 18,
        anc_visit_count: 3,
        anc_enrollment: null,
        baby: null,
        baby_name: null,
        baby_mrn: null,
        baby_count: 0,
        is_multiple_pregnancy: false,
        all_babies_info: [],
        inter_pregnancy_interval_days: null,
        risk_factors: 'Previous C-section',
        sha_claimable: true,
        gbv_related: false,
        is_sensitive: false,
        registered_by: null,
        registered_by_name: null,
        notes: '',
        completed_at: null,
        pnc_visit_count: 0,
        created_at: '2026-03-13T08:00:00Z',
        updated_at: '2026-03-13T08:00:00Z',
      },
    ],
  }),
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MCHScreen />
    </QueryClientProvider>
  );
}

describe('MCHScreen', () => {
  it('renders registrations and opens ANC workflow', async () => {
    renderScreen();

    expect(await screen.findByText('Antenatal care')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();

    fireEvent.press(screen.getByText('Open ANC'));

    expect(mockPush).toHaveBeenCalledWith('/mch/anc/9');
  });
});

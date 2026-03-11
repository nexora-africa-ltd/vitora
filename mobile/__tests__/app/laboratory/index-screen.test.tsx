import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LaboratoryScreen from '@/app/laboratory/index';
import { laboratoryApi } from '@/lib/api/laboratory';

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

jest.mock('@/lib/api/laboratory', () => ({
  laboratoryApi: {
    listOrders: jest.fn(),
    listResults: jest.fn(),
  },
}));

const mockedLaboratoryApi = laboratoryApi as jest.Mocked<typeof laboratoryApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <LaboratoryScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('LaboratoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLaboratoryApi.listOrders.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 9,
          order_number: 'LAB-20260311-0009',
          patient: 14,
          patient_name: 'Jane Doe',
          patient_mrn: 'MRN-20260311-0001',
          encounter: 55,
          order_type: 'IN_HOUSE',
          priority: 'URGENT',
          clinical_notes: 'Fever and cough',
          status: 'IN_PROGRESS',
          specimen_collected: true,
          total_cost: 450,
          items: [],
          ordered_at: '2026-03-11T10:00:00Z',
          created_at: '2026-03-11T10:00:00Z',
          updated_at: '2026-03-11T10:00:00Z',
        },
      ],
    });
    mockedLaboratoryApi.listResults.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 101,
          order_item: 44,
          test_name: 'Full Blood Count',
          test_code: 'FBC',
          numeric_value: 12.4,
          text_value: null,
          option_value: null,
          formatted_value: '12.4 g/dL',
          result_unit: 'g/dL',
          reference_low: 11,
          reference_high: 15,
          reference_range_text: '11 - 15 g/dL',
          result_flag: 'HIGH',
          interpretation: 'Above expected range',
          is_critical_result: false,
          verification_status: 'PENDING',
          is_amended: false,
          is_external_result: false,
          created_at: '2026-03-11T10:30:00Z',
          updated_at: '2026-03-11T10:30:00Z',
          entered_at: '2026-03-11T10:30:00Z',
        },
      ],
    });
  });

  it('switches to the results review state and shows abnormal result details', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Laboratory workspace')).toBeTruthy();

    fireEvent.press(screen.getByText('Results (1)'));

    expect(await screen.findByText('Full Blood Count')).toBeTruthy();
    expect(screen.getByText('12.4 g/dL')).toBeTruthy();
    expect(screen.getByText('Range: 11 - 15 g/dL')).toBeTruthy();
    expect(screen.getAllByText('HIGH').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(mockedLaboratoryApi.listResults).toHaveBeenCalled();
    });

    rendered.unmount();
    rendered.queryClient.clear();
  });
});
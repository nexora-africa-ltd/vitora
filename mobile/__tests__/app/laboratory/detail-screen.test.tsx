import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LaboratoryDetailScreen from '@/app/laboratory/[id]';
import { laboratoryApi } from '@/lib/api/laboratory';

let mockParams: Record<string, string> = { id: 'LAB-20260311-0009' };

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/laboratory', () => ({
  laboratoryApi: {
    getOrder: jest.fn(),
    submitOrder: jest.fn(),
    collectSpecimen: jest.fn(),
    cancelOrder: jest.fn(),
    verifyResult: jest.fn(),
  },
}));

const mockedLaboratoryApi = laboratoryApi as jest.Mocked<typeof laboratoryApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <LaboratoryDetailScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('LaboratoryDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'LAB-20260311-0009' };
    mockedLaboratoryApi.getOrder.mockResolvedValue({
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
      items: [
        {
          id: 44,
          lab_order: 9,
          test: 2,
          test_name: 'Full Blood Count',
          test_code: 'FBC',
          status: 'IN_PROGRESS',
          unit_cost: 450,
          special_instructions: '',
          has_result: true,
          created_at: '2026-03-11T10:00:00Z',
          result: {
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
            result_flag: null,
            interpretation: 'Within expected range',
            is_critical_result: false,
            verification_status: 'PENDING',
            entered_by_name: 'Lab Tech',
            entered_at: '2026-03-11T10:30:00Z',
            verified_by_name: null,
            is_amended: false,
            is_external_result: false,
            created_at: '2026-03-11T10:30:00Z',
            updated_at: '2026-03-11T10:30:00Z',
          },
        },
      ],
      ordered_at: '2026-03-11T10:00:00Z',
      created_at: '2026-03-11T10:00:00Z',
      updated_at: '2026-03-11T10:00:00Z',
    } as never);
    mockedLaboratoryApi.verifyResult.mockResolvedValue({
      id: 101,
      order_item: 44,
      formatted_value: '12.4 g/dL',
      verification_status: 'VERIFIED',
      is_critical_result: false,
      is_amended: false,
      is_external_result: false,
      created_at: '2026-03-11T10:30:00Z',
      updated_at: '2026-03-11T10:40:00Z',
    } as never);
  });

  it('verifies a pending result from the lab detail screen', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Full Blood Count')).toBeTruthy();

    fireEvent.press(screen.getByText('Verify result'));

    await waitFor(() => {
      expect(mockedLaboratoryApi.verifyResult).toHaveBeenCalledWith(101, {
        approved: true,
        validation_type: 'TECHNICAL',
        comments: 'Verified from mobile laboratory workspace.',
      });
    });

    rendered.unmount();
    rendered.queryClient.clear();
  });
});
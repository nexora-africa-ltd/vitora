import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LabInterpretCard } from '@/components/lab-interpret-card';
import { aiApi } from '@/lib/api/ai';
import type { LabOrderItem } from '@/lib/types/laboratory';

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/ai', () => ({
  aiApi: {
    interpretLab: jest.fn(),
  },
}));

const mockedAiApi = aiApi as jest.Mocked<typeof aiApi>;

const MOCK_ITEMS: LabOrderItem[] = [
  {
    id: 44,
    lab_order: 9,
    test: 2,
    test_name: 'Full Blood Count',
    test_code: 'FBC',
    status: 'COMPLETED',
    unit_cost: 450,
    special_instructions: '',
    has_result: true,
    created_at: '2026-03-11T10:00:00Z',
    result: {
      id: 101,
      order_item: 44,
      test_name: 'Full Blood Count',
      test_code: 'FBC',
      numeric_value: 3.2,
      text_value: null,
      option_value: null,
      formatted_value: '3.2 g/dL',
      result_unit: 'g/dL',
      reference_low: 11,
      reference_high: 15,
      reference_range_text: '11 - 15 g/dL',
      result_flag: 'LOW',
      interpretation: null,
      is_critical_result: true,
      verification_status: 'VERIFIED',
      verified_by_name: 'Dr. Tests',
      entered_by_name: 'Lab Tech',
      entered_at: '2026-03-11T10:30:00Z',
      verified_at: '2026-03-11T10:40:00Z',
      is_amended: false,
      is_external_result: false,
      created_at: '2026-03-11T10:30:00Z',
      updated_at: '2026-03-11T10:40:00Z',
    },
  },
];

const MOCK_ITEMS_NO_RESULT: LabOrderItem[] = [
  {
    id: 45,
    lab_order: 9,
    test: 3,
    test_name: 'Urinalysis',
    test_code: 'UA',
    status: 'IN_PROGRESS',
    unit_cost: 200,
    special_instructions: '',
    has_result: false,
    created_at: '2026-03-11T10:00:00Z',
    result: null,
  },
];

function renderCard(items: LabOrderItem[] = MOCK_ITEMS) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <LabInterpretCard
        orderItems={items}
        patientAge={34}
        patientSex="F"
        clinicalContext="Fever and cough"
      />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('LabInterpretCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when no items have numeric results', () => {
    const { queryByText, queryClient } = renderCard(MOCK_ITEMS_NO_RESULT);
    expect(queryByText('AI Lab Interpretation')).toBeNull();
    queryClient.clear();
  });

  it('renders the interpret button when results have numeric values', () => {
    const { queryClient } = renderCard();
    expect(screen.getByText('AI Lab Interpretation')).toBeTruthy();
    expect(screen.getByText(/Interpret 1 result/)).toBeTruthy();
    queryClient.clear();
  });

  it('calls interpretLab and renders the summary and findings', async () => {
    mockedAiApi.interpretLab.mockResolvedValue({
      summary: 'Hemoglobin is critically low at 3.2 g/dL, indicating severe anemia.',
      findings: [
        {
          test_name: 'Full Blood Count',
          interpretation: 'Severely reduced hemoglobin consistent with anemia.',
          severity: 'critical',
          clinical_significance: 'Immediate transfusion may be required.',
        },
      ],
      recommendations: [
        'Order urgent cross-match for packed RBC transfusion.',
        'Consider iron studies and reticulocyte count.',
      ],
    });

    const { queryClient } = renderCard();

    fireEvent.press(screen.getByText(/Interpret 1 result/));

    expect(await screen.findByText(/critically low/i)).toBeTruthy();
    expect(screen.getByText('Full Blood Count')).toBeTruthy();
    expect(screen.getByText(/Severely reduced hemoglobin/)).toBeTruthy();
    expect(screen.getByText(/Immediate transfusion/)).toBeTruthy();
    expect(screen.getByText(/urgent cross-match/i)).toBeTruthy();
    expect(screen.getByText(/iron studies/i)).toBeTruthy();

    await waitFor(() => {
      expect(mockedAiApi.interpretLab).toHaveBeenCalledWith({
        lab_results: [
          {
            test_name: 'Full Blood Count',
            value: 3.2,
            unit: 'g/dL',
            reference_low: 11,
            reference_high: 15,
          },
        ],
        patient_age: 34,
        patient_sex: 'F',
        clinical_context: 'Fever and cough',
      });
    });
    queryClient.clear();
  });

  it('shows error card when interpretation fails', async () => {
    mockedAiApi.interpretLab.mockRejectedValue(new Error('Service down'));

    const { queryClient } = renderCard();
    fireEvent.press(screen.getByText(/Interpret 1 result/));

    expect(await screen.findByText(/could not interpret/i)).toBeTruthy();
    queryClient.clear();
  });

  it('shows re-interpret button after interpretation', async () => {
    mockedAiApi.interpretLab.mockResolvedValue({
      summary: 'Results within normal limits.',
      findings: [],
    });

    const { queryClient } = renderCard();
    fireEvent.press(screen.getByText(/Interpret 1 result/));
    expect(await screen.findByText('Re-interpret')).toBeTruthy();
    queryClient.clear();
  });
});

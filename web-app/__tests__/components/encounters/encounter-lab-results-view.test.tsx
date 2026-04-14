/**
 * @jest-environment jsdom
 */
/**
 * Tests for EncounterLabResultsView component
 * Verifies AI lab interpretation panel integration per completed order
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EncounterLabResultsView } from '@/components/encounters/encounter-lab-results-view';
import type { LabOrder } from '@/lib/types/laboratory';

// Mock the LabInterpretPanel to verify it gets the right props
const mockLabInterpretPanel = jest.fn(() => (
  <div data-testid="lab-interpret-panel">AI Interpret Panel</div>
));
jest.mock('@/components/encounters/lab-interpret-panel', () => ({
  LabInterpretPanel: (props: any) => mockLabInterpretPanel(props),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const COMPLETED_ORDER: LabOrder = {
  id: 1,
  order_number: 'LAB-2026-001',
  patient: 42,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  encounter: 10,
  ordered_by: 1,
  ordered_by_name: 'Dr. Smith',
  order_type: 'IN_HOUSE',
  status: 'COMPLETED',
  priority: 'ROUTINE',
  specimen_collected: true,
  specimen_collected_at: '2026-04-10T10:00:00Z',
  ordered_at: '2026-04-10T09:00:00Z',
  completed_at: '2026-04-10T14:00:00Z',
  items: [
    {
      id: 101,
      lab_order: 1,
      test: 5,
      test_code: 'CBC',
      test_name: 'Complete Blood Count',
      unit_cost: 500,
      status: 'COMPLETED',
      has_result: true,
      result: {
        id: 201,
        order_item: 101,
        numeric_value: 12.5,
        text_value: null,
        option_value: null,
        result_unit: 'g/dL',
        result_flag: 'NORMAL',
        interpretation: 'Within normal range',
        is_critical_result: false,
        verification_status: 'VERIFIED',
        entered_by: 2,
        entered_at: '2026-04-10T13:00:00Z',
        is_amended: false,
        is_external_result: false,
        created_at: '2026-04-10T13:00:00Z',
        updated_at: '2026-04-10T13:00:00Z',
      },
      created_at: '2026-04-10T09:00:00Z',
    },
    {
      id: 102,
      lab_order: 1,
      test: 6,
      test_code: 'WBC',
      test_name: 'White Blood Cells',
      unit_cost: 300,
      status: 'COMPLETED',
      has_result: true,
      result: {
        id: 202,
        order_item: 102,
        numeric_value: 15.2,
        text_value: null,
        option_value: null,
        result_unit: '10^3/uL',
        result_flag: 'HIGH',
        interpretation: 'Elevated WBC count',
        is_critical_result: false,
        verification_status: 'VERIFIED',
        entered_by: 2,
        entered_at: '2026-04-10T13:00:00Z',
        is_amended: false,
        is_external_result: false,
        created_at: '2026-04-10T13:00:00Z',
        updated_at: '2026-04-10T13:00:00Z',
      },
      created_at: '2026-04-10T09:00:00Z',
    },
  ],
  total_cost: 800,
  created_at: '2026-04-10T09:00:00Z',
  updated_at: '2026-04-10T14:00:00Z',
};

const PENDING_ORDER: LabOrder = {
  ...COMPLETED_ORDER,
  id: 2,
  order_number: 'LAB-2026-002',
  status: 'ORDERED',
  completed_at: undefined,
  items: [
    {
      id: 103,
      lab_order: 2,
      test: 7,
      test_code: 'LFT',
      test_name: 'Liver Function Test',
      unit_cost: 1200,
      status: 'ORDERED',
      has_result: false,
      result: null,
      created_at: '2026-04-10T09:00:00Z',
    },
  ],
};

const PATIENT_DEMOGRAPHICS = {
  patientAge: 35,
  patientSex: 'female' as const,
};

describe('EncounterLabResultsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty state when no orders have results', () => {
    render(
      <EncounterLabResultsView orders={[PENDING_ORDER]} />,
      { wrapper },
    );

    expect(screen.getByText('No lab results available yet')).toBeInTheDocument();
  });

  it('should render completed order results', () => {
    render(
      <EncounterLabResultsView orders={[COMPLETED_ORDER]} />,
      { wrapper },
    );

    expect(screen.getByText('LAB-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.getByText('White Blood Cells')).toBeInTheDocument();
  });

  it('should show critical results alert when critical result exists', () => {
    const criticalOrder: LabOrder = {
      ...COMPLETED_ORDER,
      items: [
        {
          ...COMPLETED_ORDER.items[0]!,
          result: {
            ...COMPLETED_ORDER.items[0]!.result!,
            is_critical_result: true,
            result_flag: 'CRITICAL_HIGH',
          },
        },
      ],
    };

    render(
      <EncounterLabResultsView orders={[criticalOrder]} />,
      { wrapper },
    );

    expect(screen.getByText('Critical Results Detected')).toBeInTheDocument();
  });

  it('should render LabInterpretPanel when patient demographics are provided', () => {
    render(
      <EncounterLabResultsView
        orders={[COMPLETED_ORDER]}
        encounterId={10}
        patientDemographics={PATIENT_DEMOGRAPHICS}
      />,
      { wrapper },
    );

    expect(screen.getByTestId('lab-interpret-panel')).toBeInTheDocument();
    // Verify correct props passed to LabInterpretPanel
    expect(mockLabInterpretPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        patientAge: 35,
        patientSex: 'female',
        encounterId: 10,
        autoTrigger: true,
      }),
    );
  });

  it('should pass lab results from completed items to LabInterpretPanel', () => {
    render(
      <EncounterLabResultsView
        orders={[COMPLETED_ORDER]}
        encounterId={10}
        patientDemographics={PATIENT_DEMOGRAPHICS}
      />,
      { wrapper },
    );

    const call = mockLabInterpretPanel.mock.calls[0]?.[0];
    expect(call.labResults).toHaveLength(2);
    expect(call.labResults[0]).toEqual(
      expect.objectContaining({
        test_name: 'Complete Blood Count',
        value: 12.5,
        unit: 'g/dL',
      }),
    );
    expect(call.labResults[1]).toEqual(
      expect.objectContaining({
        test_name: 'White Blood Cells',
        value: 15.2,
        unit: '10^3/uL',
      }),
    );
  });

  it('should NOT render LabInterpretPanel when patient demographics are missing', () => {
    render(
      <EncounterLabResultsView
        orders={[COMPLETED_ORDER]}
        encounterId={10}
      />,
      { wrapper },
    );

    expect(screen.queryByTestId('lab-interpret-panel')).not.toBeInTheDocument();
    expect(mockLabInterpretPanel).not.toHaveBeenCalled();
  });

  it('should render one LabInterpretPanel per completed order', () => {
    const secondOrder: LabOrder = {
      ...COMPLETED_ORDER,
      id: 3,
      order_number: 'LAB-2026-003',
      items: [
        {
          id: 104,
          lab_order: 3,
          test: 8,
          test_code: 'RBS',
          test_name: 'Random Blood Sugar',
          unit_cost: 200,
          status: 'COMPLETED',
          has_result: true,
          result: {
            id: 203,
            order_item: 104,
            numeric_value: 180,
            text_value: null,
            option_value: null,
            result_unit: 'mg/dL',
            result_flag: 'HIGH',
            interpretation: null,
            is_critical_result: false,
            verification_status: 'VERIFIED',
            entered_by: 2,
            entered_at: '2026-04-10T15:00:00Z',
            is_amended: false,
            is_external_result: false,
            created_at: '2026-04-10T15:00:00Z',
            updated_at: '2026-04-10T15:00:00Z',
          },
          created_at: '2026-04-10T09:30:00Z',
        },
      ],
    };

    render(
      <EncounterLabResultsView
        orders={[COMPLETED_ORDER, secondOrder]}
        encounterId={10}
        patientDemographics={PATIENT_DEMOGRAPHICS}
      />,
      { wrapper },
    );

    const panels = screen.getAllByTestId('lab-interpret-panel');
    expect(panels).toHaveLength(2);
    expect(mockLabInterpretPanel).toHaveBeenCalledTimes(2);
  });

  it('should pass diagnoses to LabInterpretPanel', () => {
    const diagnoses = ['Malaria (B54)', 'Anemia (D64.9)'];

    render(
      <EncounterLabResultsView
        orders={[COMPLETED_ORDER]}
        encounterId={10}
        patientDemographics={PATIENT_DEMOGRAPHICS}
        diagnoses={diagnoses}
      />,
      { wrapper },
    );

    expect(mockLabInterpretPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnoses,
      }),
    );
  });

  it('should pass first result id as labResultId for persistence', () => {
    render(
      <EncounterLabResultsView
        orders={[COMPLETED_ORDER]}
        encounterId={10}
        patientDemographics={PATIENT_DEMOGRAPHICS}
      />,
      { wrapper },
    );

    expect(mockLabInterpretPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        labResultId: 201, // First completed item's result ID
      }),
    );
  });

  it('should render loading skeleton', () => {
    const { container } = render(
      <EncounterLabResultsView orders={[]} isLoading />,
      { wrapper },
    );

    // Skeletons should be present
    expect(container.querySelectorAll('[class*="skeleton"], [data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});

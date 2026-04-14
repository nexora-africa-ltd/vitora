import { render, screen } from '@/__tests__/utils/test-utils';
import KardexPage from '@/app/(dashboard)/admissions/[id]/kardex/page';

const mockSetEncounterAwareContext = jest.fn();
const mockSetQuickActions = jest.fn();
const mockClearPanelAction = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/auth', () => ({
  useUser: jest.fn(() => ({ id: 1, username: 'nurse1' })),
}));

jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/components/clinics/staff-search-combobox', () => ({
  StaffSearchCombobox: () => <div>Staff Search</div>,
}));

jest.mock('@/components/inpatient', () => ({
  ConsumableUsagePanel: ({ admissionId, isActive }: { admissionId: number; isActive: boolean }) => (
    <div data-testid="consumable-usage-panel">
      Consumable Usage Panel {admissionId} {String(isActive)}
    </div>
  ),
}));

jest.mock('@/components/encounters/care-plan-panel', () => ({
  CarePlanPanel: ({
    admissionId,
    primaryDiagnosis,
    autoTrigger,
  }: {
    admissionId?: number;
    primaryDiagnosis?: string;
    autoTrigger?: boolean;
  }) => (
    <div data-testid="ai-care-plan-panel">
      AI Care Plan Panel {admissionId} {primaryDiagnosis} {String(autoTrigger)}
    </div>
  ),
}));

jest.mock('@/lib/context/ai-chat-context', () => ({
  useOptionalAIChatContext: jest.fn(),
}));

jest.mock('@/lib/hooks/use-inpatient', () => ({
  useAdmission: jest.fn(),
  useKardexByAdmission: jest.fn(),
  useUpdateKardex: jest.fn(),
  useAddKardexShiftNote: jest.fn(),
  useAddKardexHandoverNote: jest.fn(),
  useAddCarePlanEntry: jest.fn(),
  useUpdateCarePlanEntry: jest.fn(),
}));

jest.mock('@/lib/hooks/use-ai', () => ({
  useAIEnabled: jest.fn(),
  useAIStatus: jest.fn(),
}));

import {
  useAdmission,
  useKardexByAdmission,
  useUpdateKardex,
  useAddKardexShiftNote,
  useAddKardexHandoverNote,
  useAddCarePlanEntry,
  useUpdateCarePlanEntry,
} from '@/lib/hooks/use-inpatient';
import { useAIEnabled, useAIStatus } from '@/lib/hooks/use-ai';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';

describe('KardexPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useOptionalAIChatContext as jest.Mock).mockReturnValue({
      setEncounterAwareContext: mockSetEncounterAwareContext,
      setQuickActions: mockSetQuickActions,
      activePanelAction: null,
      clearPanelAction: mockClearPanelAction,
    });

    (useAdmission as jest.Mock).mockReturnValue({
      data: {
        id: 1,
        admission_number: 'ADM-20260309-0001',
        patient: 12,
        patient_name: 'Jane Doe',
        patient_age: 34,
        patient_gender: 'F',
        ward_name: 'Medical Ward',
        bed_number: 'MW-03',
        admission_status: 'ACTIVE',
        admission_date: '2026-03-09T08:00:00Z',
        payer_type: 'CASH',
      },
      isLoading: false,
      error: null,
    });

    (useKardexByAdmission as jest.Mock).mockReturnValue({
      data: {
        id: 5,
        admission: 1,
        patient_name: 'Jane Doe',
        ward_name: 'Medical Ward',
        bed_number: 'MW-03',
        allergies: 'Penicillin',
        dietary_requirements: 'Regular',
        mobility_status: 'Ambulatory',
        iv_access: 'Left arm cannula',
        fall_risk: 'LOW',
        pressure_sore_risk: 'LOW',
        isolation_required: false,
        shift_notes: [],
        handover_notes: [],
        care_plan_entries: [],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    (useUpdateKardex as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAddKardexShiftNote as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAddKardexHandoverNote as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAddCarePlanEntry as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useUpdateCarePlanEntry as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAIEnabled as jest.Mock).mockReturnValue(true);
    (useAIStatus as jest.Mock).mockReturnValue({
      data: { enabled: true, service_available: true, demo_mode: false },
      isLoading: false,
    });
  });

  it('renders the consumable usage panel on the dedicated kardex page', () => {
    render(<KardexPage />);

    expect(screen.getByTestId('consumable-usage-panel')).toBeInTheDocument();
    expect(screen.getByText(/Consumable Usage Panel 1 true/i)).toBeInTheDocument();
  });

  it('renders the AI care plan panel when Tibabot is online and no nursing care plan exists', () => {
    render(<KardexPage />);

    const panel = screen.getByTestId('ai-care-plan-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('AI Care Plan Panel 1');
    expect(panel).toHaveTextContent('false');
  });

  it('does not render the AI care plan panel when Tibabot is unavailable', () => {
    (useAIStatus as jest.Mock).mockReturnValue({
      data: { enabled: true, service_available: false, demo_mode: false },
      isLoading: false,
    });

    render(<KardexPage />);

    expect(screen.queryByTestId('ai-care-plan-panel')).not.toBeInTheDocument();
  });

  it('does not render the AI care plan panel when a nursing care plan entry already exists', () => {
    (useKardexByAdmission as jest.Mock).mockReturnValue({
      data: {
        id: 5,
        admission: 1,
        patient_name: 'Jane Doe',
        ward_name: 'Medical Ward',
        bed_number: 'MW-03',
        allergies: 'Penicillin',
        dietary_requirements: 'Regular',
        mobility_status: 'Ambulatory',
        iv_access: 'Left arm cannula',
        fall_risk: 'LOW',
        pressure_sore_risk: 'LOW',
        isolation_required: false,
        shift_notes: [],
        handover_notes: [],
        care_plan_entries: [
          {
            id: 99,
            recorded_at: '2026-03-09T09:00:00Z',
            recorded_by: 1,
            recorded_by_username: 'nurse1',
            assessment: 'Pain at incision site',
            nursing_diagnosis: 'Acute pain',
            goal_and_outcome_criteria: 'Pain reduced to 2/10',
            plan_of_action: 'Administer analgesics',
            scientific_rationale: 'Analgesia improves recovery',
            implementation: '',
            evaluation: '',
            status: 'ACTIVE',
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<KardexPage />);

    expect(screen.queryByTestId('ai-care-plan-panel')).not.toBeInTheDocument();
  });

  it('registers encounter-aware AI context and quick actions for the kardex route', () => {
    render(<KardexPage />);

    expect(mockSetEncounterAwareContext).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_age: 34,
        patient_sex: 'F',
        allergies: ['Penicillin'],
      }),
      expect.objectContaining({
        admission_diagnosis: undefined,
        ward_name: 'Medical Ward',
        bed_number: 'MW-03',
        admission_status: 'ACTIVE',
        diet: 'Regular',
      })
    );

    expect(mockSetQuickActions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ panelAction: 'care-plan', label: 'Suggest care plan' }),
      ])
    );
  });

  it('passes auto-trigger to the AI care plan panel when the widget requests care plan generation', () => {
    (useOptionalAIChatContext as jest.Mock).mockReturnValue({
      setEncounterAwareContext: mockSetEncounterAwareContext,
      setQuickActions: mockSetQuickActions,
      activePanelAction: 'care-plan',
      clearPanelAction: mockClearPanelAction,
    });

    render(<KardexPage />);

    expect(mockClearPanelAction).toHaveBeenCalled();
    const panel = screen.getByTestId('ai-care-plan-panel');
    expect(panel).toHaveTextContent('AI Care Plan Panel 1');
    expect(panel).toHaveTextContent('true');
  });
});

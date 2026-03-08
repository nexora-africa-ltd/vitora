import { render, screen } from '@/__tests__/utils/test-utils';
import KardexPage from '@/app/(dashboard)/admissions/[id]/kardex/page';

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

jest.mock('@/lib/hooks/use-inpatient', () => ({
  useAdmission: jest.fn(),
  useKardexByAdmission: jest.fn(),
  useUpdateKardex: jest.fn(),
  useAddKardexShiftNote: jest.fn(),
  useAddKardexHandoverNote: jest.fn(),
  useAddCarePlanEntry: jest.fn(),
  useUpdateCarePlanEntry: jest.fn(),
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

describe('KardexPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useAdmission as jest.Mock).mockReturnValue({
      data: {
        id: 1,
        admission_number: 'ADM-20260309-0001',
        patient: 12,
        patient_name: 'Jane Doe',
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
  });

  it('renders the consumable usage panel on the dedicated kardex page', () => {
    render(<KardexPage />);

    expect(screen.getByTestId('consumable-usage-panel')).toBeInTheDocument();
    expect(screen.getByText(/Consumable Usage Panel 1 true/i)).toBeInTheDocument();
  });
});
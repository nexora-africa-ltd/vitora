import { fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import ProfilePage from '@/app/(dashboard)/profile/page';
import { shaApi } from '@/lib/api/sha';
import { useAuth } from '@/lib/auth/context';

const mockLogout = jest.fn();
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockValidatePractitioner = shaApi.validatePractitioner as jest.MockedFunction<typeof shaApi.validatePractitioner>;

const mockPractitioner = {
  membership: {
    id: 'PUID-0022840-4',
    status: 'Licensed',
    salutation: 'Dr.',
    full_name: 'Jane Doe',
    gender: 'F',
    first_name: 'Jane',
    middle_name: '',
    last_name: 'Doe',
    registration_id: 'PUID-059839',
    external_reference_id: '24120',
    licensing_body: 'Clinical Officers Council',
    specialty: 'CLINICAL OFFICER',
    is_active: 1,
    is_withdrawn: 0,
    withdrawal_reason: '',
    withdrawal_date: '',
    license_expires_in_days: 120,
  },
  licenses: [],
  professional_details: {
    professional_cadre: 'CLINICAL OFFICER',
    practice_type: 'Clinical Officer',
    specialty: 'Primary Care',
    subspecialty: '',
    discipline_name: 'Clinical Officer',
    educational_qualifications: 'DIPLOMA',
  },
  contacts: {
    phone: '0712345678',
    email: 'jdoe@example.com',
    postal_address: 'P.O. Box 123',
  },
  identifiers: {
    identification_type: 'National ID',
    identification_number: '12345678',
    client_registry_id: 'CR-1',
    student_id: '',
  },
};

jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({
    user: {
      id: 7,
      username: 'jdoe',
      email: 'jdoe@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      is_staff: true,
      is_superuser: false,
      permissions: [
        'patients.view_patient',
        'encounters.add_encounter',
        'billing.view_invoice',
        'billing.change_invoice',
        'inventory.view_stock',
        'inventory.change_stock',
        'laboratory.view_order',
        'laboratory.add_result',
        'pharmacy.view_prescription',
        'pharmacy.change_prescription',
      ],
      role: 'BILLING_CLERK',
    },
  })),
}));

jest.mock('@/lib/auth/hooks', () => ({
  useLogout: jest.fn(() => mockLogout),
}));

jest.mock('@/lib/hooks/use-rbac', () => ({
  useMyStaffProfile: jest.fn(() => ({
    data: {
      id: 11,
      user: 7,
      user_username: 'jdoe',
      user_email: 'jdoe@example.com',
      user_first_name: 'Jane',
      user_last_name: 'Doe',
      full_name: 'Jane Doe',
      employee_id: 'EMP-001',
      primary_role_name: 'DOCTOR',
      hwr_id: 'HWR-12345',
      license_number: 'LIC-100',
    },
    isLoading: false,
  })),
}));

jest.mock('@/lib/api/sha', () => ({
  shaApi: {
    validatePractitioner: jest.fn(),
  },
}));

jest.mock('@/components/sha', () => ({
  DHAPractitionerSearch: ({ onSelect }: { onSelect?: (practitioner: typeof mockPractitioner) => void }) => (
    <button type="button" onClick={() => onSelect?.(mockPractitioner)}>
      Mock HWR Search
    </button>
  ),
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    mockLogout.mockClear();
    mockValidatePractitioner.mockResolvedValue({
      valid: true,
      practitioner: {
        hwr_number: 'HWR-12345',
        name: 'Dr. Jane Doe',
        cadre: 'Medical Officer',
        license_status: 'Active',
        registration_board: 'KMPDC',
      },
      errors: [],
    });
    mockUseAuth.mockReturnValue({
      user: {
        id: 7,
        username: 'jdoe',
        email: 'jdoe@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
        is_staff: true,
        is_superuser: false,
        permissions: [
          'patients.view_patient',
          'encounters.add_encounter',
          'billing.view_invoice',
          'billing.change_invoice',
          'inventory.view_stock',
          'inventory.change_stock',
          'laboratory.view_order',
          'laboratory.add_result',
          'pharmacy.view_prescription',
          'pharmacy.change_prescription',
        ],
        role: 'BILLING_CLERK',
      },
    } as ReturnType<typeof useAuth>);
  });

  it('renders the current user profile details', async () => {
    render(<ProfilePage />);

    expect(screen.getByRole('heading', { name: /^profile$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /jane doe/i })).toBeInTheDocument();
    expect(screen.getByText('@jdoe')).toBeInTheDocument();
    expect(screen.getByText('jdoe@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Billing Clerk').length).toBeGreaterThan(0);
    expect(screen.getByText('10 assigned permissions')).toBeInTheDocument();
    expect(await screen.findByText('HWR-12345')).toBeInTheDocument();
  });

  it('shows settings actions and paginates formatted permissions', async () => {
    render(<ProfilePage />);

    await screen.findByText('HWR-12345');

    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: /go to settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('Patients / View Patient')).toBeInTheDocument();
    expect(screen.getByText('Encounters / Add Encounter')).toBeInTheDocument();
    expect(screen.getByText('Showing 1-8 of 10')).toBeInTheDocument();
    expect(screen.queryByText('Pharmacy / View Prescription')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Showing 9-10 of 10')).toBeInTheDocument();
    expect(screen.getByText('Pharmacy / View Prescription')).toBeInTheDocument();
    expect(screen.getByText('Pharmacy / Change Prescription')).toBeInTheDocument();
  });

  it('renders HWR compliance cards after practitioner verification', async () => {
    render(<ProfilePage />);

    await screen.findByText('HWR-12345');

    fireEvent.click(screen.getByRole('button', { name: /mock hwr search/i }));

    expect(screen.getAllByText('Compliant').length).toBeGreaterThan(0);
    expect(screen.getByText('Active and licensed')).toBeInTheDocument();
    expect(screen.getByText('Clinical Officers Council')).toBeInTheDocument();
    expect(screen.getByText('User profile matches registry')).toBeInTheDocument();
    expect(screen.getByText('PUID-059839')).toBeInTheDocument();
  });

  it('validates the stored HWR ID from the staff profile', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(mockValidatePractitioner).toHaveBeenCalledWith({ hwr_number: 'HWR-12345' });
    });

    expect(await screen.findByText('Verified by HWR ID')).toBeInTheDocument();
    expect(screen.getByText('Matched via staff HWR link')).toBeInTheDocument();
    expect(screen.getByText('Medical Officer at KMPDC')).toBeInTheDocument();
  });

  it('allows the user to sign out', async () => {
    render(<ProfilePage />);

    await screen.findByText('HWR-12345');

    screen.getByRole('button', { name: /sign out/i }).click();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

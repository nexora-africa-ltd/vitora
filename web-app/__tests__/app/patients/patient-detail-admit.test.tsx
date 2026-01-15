/**
 * BDD Tests: Patient detail -> Admission entry point
 *
 * Ensures patient flow integration (Patient -> Admissions).
 */

import { render, screen } from '@/__tests__/utils/test-utils';
import PatientDetailPage from '@/app/(dashboard)/patients/[id]/page';
import { PatientProvider } from '@/lib/context/patient-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
    getEmergencyContacts: jest.fn(),
  },
}));

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    list: jest.fn(),
  },
}));

jest.mock('@/lib/api/sha', () => ({
  shaApi: {
    getMemberByNationalId: jest.fn(),
  },
}));

// Mock auth context
jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 1, username: 'testuser', role: 'ADMIN', permissions: ['edit_patient'] },
    isAuthenticated: true,
  })),
}));

import { patientsApi } from '@/lib/api/patients';
import { encountersApi } from '@/lib/api/encounters';

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260101-0001',
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '1985-03-15',
  gender: 'M',
  phone_number: '+254712345678',
  email: 'john.doe@example.com',
  county: 47,
  county_name: 'Nairobi',
  sub_county: 3,
  sub_county_name: 'Westlands',
  ward: 3,
  ward_name: 'Parklands',
  village: 'Parklands Estate',
  emergency_contact_name: 'Jane Doe',
  emergency_contact_phone: '+254723456789',
  emergency_contact_relationship: 'Spouse',
  referral_source: 'self',
  consent_given: true,
  consent_date: '2026-01-01T09:00:00Z',
  is_sensitive: false,
  registered_by: 1,
  created_at: '2026-01-01T09:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('PatientDetailPage -> Admissions integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (patientsApi.getPatient as jest.Mock).mockResolvedValue(mockPatient);
    (patientsApi.getEmergencyContacts as jest.Mock).mockResolvedValue([]);
    (encountersApi.list as jest.Mock).mockResolvedValue({ results: [], count: 0, next: null, previous: null });
  });

  it('shows an Admit action that links into Admissions', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PatientProvider patientId={1}>
          <PatientDetailPage />
        </PatientProvider>
      </Wrapper>
    );

    // Wait for data to load
    const admitLink = await screen.findByRole('link', { name: /admit/i });
    expect(admitLink).toHaveAttribute('href', '/admissions/new?patient=1');
  });
});

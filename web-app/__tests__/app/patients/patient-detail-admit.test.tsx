/**
 * BDD Tests: Patient detail -> Admission entry point
 *
 * Ensures patient flow integration (Patient -> Admissions).
 */

import { render, screen } from '@/__tests__/utils/test-utils';
import PatientDetailPage from '@/app/(dashboard)/patients/[id]/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-patients-enhanced', () => ({
  usePatient: jest.fn(),
  usePatientEmergencyContacts: jest.fn(),
  usePatientEncounters: jest.fn(),
}));

import { usePatient, usePatientEmergencyContacts, usePatientEncounters } from '@/lib/hooks/use-patients-enhanced';

describe('PatientDetailPage -> Admissions integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (usePatient as jest.Mock).mockReturnValue({
      data: {
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
      },
      isLoading: false,
      error: null,
    });

    (usePatientEmergencyContacts as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    (usePatientEncounters as jest.Mock).mockReturnValue({
      data: { results: [], count: 0, next: null, previous: null },
      isLoading: false,
      error: null,
    });
  });

  it('shows an Admit action that links into Admissions', () => {
    render(<PatientDetailPage />);

    const admitLink = screen.getByRole('link', { name: /admit/i });
    expect(admitLink).toHaveAttribute('href', '/admissions/new?patient=1');
  });
});

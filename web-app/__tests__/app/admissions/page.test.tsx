/**
 * Tests for Admissions (IPD) Module Page
 * Sprint 1.5-1.6 Track D: Inpatient Foundation
 *
 * TDD/BDD: These tests are written BEFORE the implementation.
 */

import { render, screen } from '@/__tests__/utils/test-utils';
import AdmissionsPage from '@/app/(dashboard)/admissions/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/admissions',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock inpatient hooks (to be implemented)
jest.mock('@/lib/hooks/use-inpatient', () => ({
  useAdmissionRecommendations: jest.fn(),
  useAdmissions: jest.fn(),
}));

import { useAdmissionRecommendations, useAdmissions } from '@/lib/hooks/use-inpatient';

describe('AdmissionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useAdmissionRecommendations as jest.Mock).mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            encounter: 156,
            recommended_by_username: 'Dr. Ochieng',
            reason: 'Severe malaria requiring IV treatment',
            provisional_diagnosis: 'B50.0',
            provisional_diagnosis_text: 'Severe falciparum malaria',
            urgency: 'URGENT',
            preferred_ward_type: 'MEDICAL',
            status: 'PENDING',
            expires_at: '2026-01-04T10:00:00Z',
          },
        ],
        count: 1,
        next: null,
        previous: null,
      },
      isLoading: false,
      error: null,
    });

    (useAdmissions as jest.Mock).mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            admission_number: 'ADM-20260103-0001',
            patient: 42,
            patient_name: 'John Doe',
            ward_name: 'Medical Ward',
            bed_number: 'M-15',
            admission_status: 'ACTIVE',
            admission_date: '2026-01-03T09:00:00Z',
            payer_type: 'CASH',
            length_of_stay: 0,
          },
        ],
        count: 1,
        next: null,
        previous: null,
      },
      isLoading: false,
      error: null,
    });
  });

  it('renders the Admissions page title and help popover', () => {
    render(<AdmissionsPage />);

    expect(
      screen.getByRole('heading', { name: /^admissions$/i })
    ).toBeInTheDocument();

    // Description is now in HelpPopover, check that popover trigger exists
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('shows admission recommendations section', () => {
    render(<AdmissionsPage />);

    // CardTitle is not necessarily a semantic heading element
    expect(screen.getByText(/pending admission recommendations/i)).toBeInTheDocument();

    expect(
      screen.getByText(/severe malaria requiring iv treatment/i)
    ).toBeInTheDocument();

    // Shows diagnosis text, not code
    expect(screen.getByText(/severe falciparum malaria/i)).toBeInTheDocument();
  });

  it('shows active admissions section', () => {
    render(<AdmissionsPage />);

    // Page renders admissions data - use getAllByText since admission number may appear multiple times
    expect(screen.getAllByText(/ADM-20260103-0001/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/John Doe/i).length).toBeGreaterThan(0);
  });

  it('provides a New Admission link', () => {
    render(<AdmissionsPage />);

    const link = screen.getByRole('link', { name: /new admission/i });
    expect(link).toHaveAttribute('href', '/admissions/new');
  });
});

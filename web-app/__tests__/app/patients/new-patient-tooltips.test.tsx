/**
 * Tooltip tests for New Patient registration success actions.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewPatientPage from '@/app/(dashboard)/patients/new/page';

beforeAll(() => {
  // Radix Tooltip relies on PointerEvent; JSDOM may not implement it.
  // This polyfill allows pointer* events to work in tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = window.MouseEvent;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

const mockToast = jest.fn();

jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockCreatePatientMutateAsync = jest.fn();
jest.mock('@/lib/hooks/use-patients-enhanced', () => ({
  useCreatePatient: () => ({
    mutateAsync: mockCreatePatientMutateAsync,
    isPending: false,
  }),
}));

const mockCheckInMutateAsync = jest.fn();
jest.mock('@/lib/hooks/use-triage', () => ({
  useCheckInPatient: () => ({
    mutateAsync: mockCheckInMutateAsync,
  }),
}));

// Mock PatientForm to avoid filling large form fields.
jest.mock('@/components/patients/patient-form', () => ({
  PatientForm: ({ onSubmit }: { onSubmit: (data: any) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          first_name: 'John',
          last_name: 'Kamau',
          date_of_birth: '1980-01-01',
          gender: 'M',
          county: 1,
          sub_county: 1,
          referral_source: 'self',
        })
      }
    >
      Submit
    </button>
  ),
}));

describe('NewPatientPage tooltips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows tooltip for "Check In to Triage Queue" button on hover', async () => {
    const user = userEvent.setup();

    mockCreatePatientMutateAsync.mockResolvedValueOnce({
      id: 123,
      mrn: 'MRN-20260104-0001',
      first_name: 'John',
      last_name: 'Kamau',
      date_of_birth: '1980-01-01',
    });

    render(<NewPatientPage />);

    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Patient Registered/i)).toBeInTheDocument();
    });

    const checkInButton = screen.getByRole('button', { name: /Check In to Triage Queue/i });
    expect(checkInButton).toHaveAttribute(
      'title',
      'Adds the patient to the triage waiting queue so vitals/triage can begin.'
    );
  });

  it('shows tooltip for "Start Encounter Directly" action on hover', async () => {
    const user = userEvent.setup();

    mockCreatePatientMutateAsync.mockResolvedValueOnce({
      id: 123,
      mrn: 'MRN-20260104-0001',
      first_name: 'John',
      last_name: 'Kamau',
      date_of_birth: '1980-01-01',
    });

    render(<NewPatientPage />);

    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Patient Registered/i)).toBeInTheDocument();
    });

    // With Button asChild + Link, this will be role=link
    const startEncounterLink = screen.getByRole('link', { name: /Start Encounter Directly/i });
    expect(startEncounterLink).toHaveAttribute(
      'title',
      'Skip the triage queue and start clinical documentation now.'
    );
  });
});

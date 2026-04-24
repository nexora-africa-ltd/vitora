import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickCheckinDialog } from '@/components/patients/quick-checkin-dialog';

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = window.MouseEvent;
});

const mockToast = jest.fn();
const mockMutateAsync = jest.fn();

jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/hooks/use-checkin', () => ({
  useCheckinPatient: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  usePatientLookup: () => ({
    data: null,
  }),
}));

jest.mock('@/lib/hooks/use-clinics', () => ({
  useClinics: () => ({
    data: {
      results: [
        { id: 7, name: 'Eye Clinic', clinic_type: 'SPECIALIST' },
      ],
    },
  }),
}));

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <QuickCheckinDialog
        patientId={12}
        patientName="Jane Wanjiku"
        patientMrn="MRN-20260309-0001"
      />
    </QueryClientProvider>
  );
};

describe('QuickCheckinDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockResolvedValue({
      checkin_id: 1,
      patient_name: 'Jane Wanjiku',
      patient_mrn: 'MRN-20260309-0001',
      destination: 'TRIAGE',
      destination_clinic_id: null,
      destination_clinic_name: null,
      visit_type: 'NEW',
      visit_reason: 'NEW_COMPLAINT',
      skip_triage: false,
      status: 'CHECKED_IN',
      queue_position: 1,
      estimated_wait_minutes: 10,
      checked_in_at: '2026-03-09T10:00:00Z',
      encounter_id: 18,
      linked_encounter_id: null,
      clinic_visit_id: null,
    });
  });

  it('shows triage as the explicit default submit action', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /check-in patient/i }));

    expect(screen.getByText(/default workflow for assessment and vitals capture/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^check-in to triage$/i })).toBeInTheDocument();
  });

  it('switches the primary action to direct routing after selecting a clinic', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /check-in patient/i }));
    await user.click(screen.getByRole('button', { name: /direct to clinic/i }));
    await user.click(screen.getByRole('button', { name: /select eye clinic/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^route to clinic$/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/selected/i)).toBeInTheDocument();
  });
});

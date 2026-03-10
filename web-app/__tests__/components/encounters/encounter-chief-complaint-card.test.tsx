import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EncounterChiefComplaintCard } from '@/components/encounters/encounter-chief-complaint-card';
import type { Encounter } from '@/lib/types/encounter';

const mockCanAccessModule = jest.fn(() => true);
const mockCanPerformAction = jest.fn(() => true);
const mockToast = jest.fn();
const mockMutateAsync = jest.fn();

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: jest.fn(() => ({
    canAccessModule: mockCanAccessModule,
    canPerformAction: mockCanPerformAction,
  })),
}));

jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: jest.fn(() => ({ toast: mockToast })),
}));

jest.mock('@/lib/hooks/use-encounters', () => ({
  useEditChiefComplaint: jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
}));

jest.mock('@/components/encounters/chief-complaint-edit-dialog', () => ({
  ChiefComplaintEditDialog: ({ open, onConfirm }: any) => (
    open ? (
      <div data-testid="chief-complaint-edit-dialog">
        <button
          type="button"
          onClick={() => onConfirm({
            chief_complaint: 'Updated complaint',
            edit_reason: 'CLARIFICATION',
            edit_reason_other: '',
          })}
        >
          Confirm Edit
        </button>
      </div>
    ) : null
  ),
}));

const mockEncounter: Encounter = {
  id: 100,
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260115-0001',
  encounter_type: 'OPD',
  encounter_date: '2026-01-15',
  status: 'IN_PROGRESS',
  triage_status: 'COMPLETED',
  chief_complaint: 'Persistent headache',
  temperature: null,
  pulse: null,
  blood_pressure: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  notes: '',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T11:30:00Z',
};

describe('EncounterChiefComplaintCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessModule.mockReturnValue(true);
    mockCanPerformAction.mockReturnValue(true);
    mockMutateAsync.mockResolvedValue({ ...mockEncounter, chief_complaint: 'Updated complaint' });
  });

  it('shows edit action for users with encounter edit permission on editable encounters', () => {
    render(<EncounterChiefComplaintCard encounter={mockEncounter} />);

    expect(screen.getByText('Persistent headache')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('hides edit action when user lacks encounters.edit permission', () => {
    mockCanPerformAction.mockImplementation((action: string) => action !== 'encounters.edit');

    render(<EncounterChiefComplaintCard encounter={mockEncounter} />);

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('hides edit action when encounter triage is not completed', () => {
    render(
      <EncounterChiefComplaintCard
        encounter={{ ...mockEncounter, triage_status: 'PENDING' }}
      />
    );

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('submits audited chief complaint edit through the dedicated mutation', async () => {
    render(<EncounterChiefComplaintCard encounter={mockEncounter} />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm edit/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        encounterId: 100,
        data: {
          chief_complaint: 'Updated complaint',
          edit_reason: 'CLARIFICATION',
          edit_reason_other: '',
        },
      });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Chief complaint updated',
      })
    );
  });
});
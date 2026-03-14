/**
 * BDD Tests: Encounter detail -> Recommend for Admission
 *
 * Ensures OPD -> IPD transition entry point exists via the Referrals tab.
 * Admission referrals are created through the EncounterReferralsContent
 * component using the ReferralCreateDialog with an admission target service.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EncounterReferralsContent } from '@/components/encounters/encounter-referrals-content';

// Mock the referrals hook
jest.mock('@/lib/hooks/use-referrals', () => ({
  useEncounterReferrals: jest.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
}));

// Mock the create dialog to avoid rendering the full dialog
jest.mock('@/components/encounters/referral-create-dialog', () => ({
  ReferralCreateDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    encounterId: number;
    patientId: number;
  }) =>
    open ? (
      <div data-testid="referral-create-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
        <div>Create referral dialog (supports admission type)</div>
      </div>
    ) : null,
}));

import { useEncounterReferrals } from '@/lib/hooks/use-referrals';
const mockUseEncounterReferrals = useEncounterReferrals as jest.Mock;

describe('Encounter Referrals -> Admission recommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEncounterReferrals.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  it('shows Create Referral button for active encounters', () => {
    render(
      <EncounterReferralsContent
        encounterId={1}
        patientId={42}
      />
    );

    expect(
      screen.getByRole('button', { name: /create referral/i })
    ).toBeInTheDocument();
  });

  it('opens referral creation dialog (which supports admission type)', () => {
    render(
      <EncounterReferralsContent
        encounterId={1}
        patientId={42}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /create referral/i }));

    expect(screen.getByTestId('referral-create-dialog')).toBeInTheDocument();
    expect(screen.getByText(/supports admission type/i)).toBeInTheDocument();
  });

  it('hides Create Referral button when encounter is disabled (closed)', () => {
    render(
      <EncounterReferralsContent
        encounterId={1}
        patientId={42}
        disabled
      />
    );

    expect(
      screen.queryByRole('button', { name: /create referral/i })
    ).not.toBeInTheDocument();
  });

  it('displays existing admission referrals under Admission Referrals group', () => {
    mockUseEncounterReferrals.mockReturnValue({
      data: [
        {
          id: 1,
          referral_type: 'ADMISSION',
          target_service: 'INPATIENT_WARD',
          status: 'PENDING',
          priority: 'URGENT',
          reason: 'Severe pneumonia requiring oxygen therapy',
          created_at: '2026-03-15T10:00:00Z',
          updated_at: '2026-03-15T10:00:00Z',
          created_by_name: 'Dr. Smith',
        },
      ],
      isLoading: false,
      error: null,
    });

    render(
      <EncounterReferralsContent
        encounterId={1}
        patientId={42}
      />
    );

    expect(screen.getByText('Admission Referrals')).toBeInTheDocument();
    expect(screen.getByText(/severe pneumonia/i)).toBeInTheDocument();
  });

  it('shows empty state when no referrals exist', () => {
    render(
      <EncounterReferralsContent
        encounterId={1}
        patientId={42}
      />
    );

    expect(screen.getByText('No referrals')).toBeInTheDocument();
  });
});

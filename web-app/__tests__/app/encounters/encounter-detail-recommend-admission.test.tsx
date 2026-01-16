/**
 * BDD Tests: Encounter detail -> Recommend for Admission
 *
 * Ensures OPD -> IPD transition entry point exists as per ideal flow.
 */

import React from 'react';
import { render, screen } from '@/__tests__/utils/test-utils';
import EncounterDetailPage from '@/app/(dashboard)/encounters/[id]/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-encounters', () => ({
  useEncounter: jest.fn(),
  useEncounterDiagnoses: jest.fn(),
  useEncounterTreatmentPlan: jest.fn(),
}));

// Mock the encounter context
jest.mock('@/lib/context/encounter-context', () => ({
  EncounterProvider: ({ children }: { children: React.ReactNode }) => children,
  useEncounterContext: jest.fn(() => ({
    encounter: {
      id: 1,
      patient: 42,
      patient_name: 'John Doe',
      patient_mrn: 'MRN-20260103-0042',
      encounter_type: 'OPD',
      encounter_date: '2026-01-03',
      chief_complaint: 'Fever and chills',
      status: 'COMPLETED',
    },
    isLoading: false,
    error: null,
    vitals: null,
    diagnoses: [],
    treatmentPlan: null,
    prescriptions: [],
    labOrders: [],
    notes: [],
    updateEncounter: jest.fn(),
    addDiagnosis: jest.fn(),
    removeDiagnosis: jest.fn(),
    updateTreatmentPlan: jest.fn(),
    addPrescription: jest.fn(),
    addLabOrder: jest.fn(),
    addNote: jest.fn(),
  })),
}));

import { useEncounter, useEncounterDiagnoses, useEncounterTreatmentPlan } from '@/lib/hooks/use-encounters';

describe('EncounterDetailPage -> Admission recommendation integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useEncounter as jest.Mock).mockReturnValue({
      data: {
        id: 1,
        patient: 42,
        patient_name: 'John Doe',
        patient_mrn: 'MRN-20260103-0042',
        encounter_type: 'OPD',
        encounter_date: '2026-01-03',
        chief_complaint: 'Fever and chills',
        status: 'COMPLETED',
        created_at: '2026-01-03T09:00:00Z',
        updated_at: '2026-01-03T10:00:00Z',
      },
      isLoading: false,
      error: null,
    });

    (useEncounterDiagnoses as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    (useEncounterTreatmentPlan as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it('shows a Recommend for Admission action for OPD encounters', () => {
    render(<EncounterDetailPage />);

    const link = screen.getByRole('link', { name: /recommend for admission/i });
    expect(link).toHaveAttribute('href', '/admissions/recommendations/new?encounter=1');
  });
});

/**
 * TDD Tests for TreatmentPlanView Component
 * Tests display of treatment plan with medications and follow-up
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { TreatmentPlanView } from '@/components/encounters/treatment-plan-view';
import type { TreatmentPlan } from '@/lib/types/encounter';

// Mock EmptyState
jest.mock('@/components/shared/empty-state', () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

const mockTreatmentPlan: TreatmentPlan = {
  id: 1,
  encounter: 1,
  clinical_notes: 'Rest at home, take medication as prescribed, and follow up in one week.',
  follow_up_date: '2025-01-15',
  referral_needed: false,
  referral_specialty: null,
  referral_notes: null,
  medications: [
    {
      id: 1,
      name: 'Paracetamol',
      dosage: '500mg',
      frequency: 'Every 6 hours',
      duration: '5 days',
      route: 'Oral',
      instructions: 'Take after meals',
    },
  ],
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
};

describe('TreatmentPlanView', () => {
  it('should render empty state when no treatment plan', () => {
    render(<TreatmentPlanView treatmentPlan={null} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No treatment plan')).toBeInTheDocument();
  });

  it('should render clinical notes', () => {
    render(<TreatmentPlanView treatmentPlan={mockTreatmentPlan} />);

    expect(screen.getByText(/Rest at home, take medication as prescribed/)).toBeInTheDocument();
  });

  it('should render medications count', () => {
    render(<TreatmentPlanView treatmentPlan={mockTreatmentPlan} />);

    expect(screen.getByText(/Medications \(1\)/)).toBeInTheDocument();
  });

  it('should render medication name', () => {
    render(<TreatmentPlanView treatmentPlan={mockTreatmentPlan} />);

    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
  });

  it('should render medication dosage', () => {
    render(<TreatmentPlanView treatmentPlan={mockTreatmentPlan} />);

    expect(screen.getByText('500mg')).toBeInTheDocument();
  });

  it('should render medication frequency', () => {
    render(<TreatmentPlanView treatmentPlan={mockTreatmentPlan} />);

    expect(screen.getByText('Every 6 hours')).toBeInTheDocument();
  });

  it('should render medication instructions', () => {
    render(<TreatmentPlanView treatmentPlan={mockTreatmentPlan} />);

    expect(screen.getByText(/Take after meals/)).toBeInTheDocument();
  });

  it('should render multiple medications', () => {
    const planWithMultipleMeds = {
      ...mockTreatmentPlan,
      medications: [
        ...mockTreatmentPlan.medications,
        {
          id: 2,
          name: 'Ibuprofen',
          dosage: '400mg',
          frequency: 'Twice daily',
          duration: '3 days',
          route: 'Oral',
          instructions: null,
        },
      ],
    };
    render(<TreatmentPlanView treatmentPlan={planWithMultipleMeds} />);

    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.getByText('Ibuprofen')).toBeInTheDocument();
    expect(screen.getByText(/Medications \(2\)/)).toBeInTheDocument();
  });
});

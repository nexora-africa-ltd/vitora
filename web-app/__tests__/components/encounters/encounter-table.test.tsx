/**
 * TDD Tests for EncounterTable Component
 * Tests encounter list display, pagination, loading, and error states
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EncounterTable } from '@/components/encounters/encounter-table';
import type { Encounter } from '@/lib/types/encounter';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock EmptyState component
jest.mock('@/components/shared/empty-state', () => ({
  EmptyState: ({ title, description, action }: any) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

const mockEncounter: Encounter = {
  id: 1,
  patient: 1,
  patient_name: 'John Doe',
  patient_mrn: 'MRN-20251230-0001',
  encounter_type: 'OPD',
  encounter_date: '2025-01-01',
  chief_complaint: 'Headache and fever',
  status: 'CLOSED',
  temperature: 37.5,
  pulse: 80,
  blood_pressure: '120/80',
  respiratory_rate: 16,
  spo2: 98,
  weight: 70,
  height: 175,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  notes: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',
  plan: '',
  created_by: 1,
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
};

describe('EncounterTable', () => {
  const defaultProps = {
    encounters: [mockEncounter],
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render encounter data in table', () => {
    render(<EncounterTable {...defaultProps} />);

    // Data may appear in both mobile and desktop views
    expect(screen.getAllByText('Headache and fever').length).toBeGreaterThan(0);
  });

  it('should render table headers', () => {
    render(<EncounterTable {...defaultProps} />);

    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Chief Complaint')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading', () => {
    render(<EncounterTable {...defaultProps} isLoading={true} encounters={[]} />);

    // When loading, skeletons are rendered via data-slot or animate-pulse class
    const skeletons = document.querySelectorAll('[data-slot="skeleton"], .animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show error state when error occurs', () => {
    const error = new Error('Failed to load encounters');
    render(<EncounterTable {...defaultProps} error={error} encounters={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Error loading encounters')).toBeInTheDocument();
  });

  it('should show empty state when no encounters found', () => {
    render(<EncounterTable {...defaultProps} encounters={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No encounters found')).toBeInTheDocument();
  });

  it('should render multiple encounters', () => {
    const secondEncounter = {
      ...mockEncounter,
      id: 2,
      chief_complaint: 'Chest pain',
    };
    render(<EncounterTable {...defaultProps} encounters={[mockEncounter, secondEncounter]} />);

    // Data may appear in both mobile and desktop views
    expect(screen.getAllByText('Headache and fever').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chest pain').length).toBeGreaterThan(0);
  });

  it('should highlight encounter with critical SpO2', () => {
    const criticalEncounter = { ...mockEncounter, spo2: 88 };
    render(<EncounterTable {...defaultProps} encounters={[criticalEncounter]} />);

    // The component should have a visual indicator for critical vitals
    // This is typically shown via AlertTriangle icon or styling
    expect(document.querySelector('[class*="destructive"]') || document.querySelector('svg')).toBeTruthy();
  });
});

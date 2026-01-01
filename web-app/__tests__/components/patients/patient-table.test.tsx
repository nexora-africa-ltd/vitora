/**
 * TDD Tests for PatientTable Component
 * Tests patient list display, pagination, loading, and error states
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatientTable } from '@/components/patients/patient-table';
import type { Patient } from '@/lib/types/patient';

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

const mockPatient: Patient = {
  id: 1,
  mrn: 'MRN-20251230-0001',
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '1990-05-15',
  gender: 'M',
  phone_number: '0712345678',
  national_id: null,
  email: null,
  county: 1,
  county_name: 'Nairobi',
  sub_county: 1,
  sub_county_name: 'Westlands',
  ward: null,
  ward_name: null,
  village: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  referral_source: 'self',
  referred_from_facility: '',
  consent_given: true,
  consent_date: '2025-01-01',
  is_sensitive: false,
  registered_by: 1,
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
};

describe('PatientTable', () => {
  const defaultProps = {
    patients: [mockPatient],
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render patient data in table', () => {
    render(<PatientTable {...defaultProps} />);

    expect(screen.getByText('MRN-20251230-0001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Nairobi')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading', () => {
    render(<PatientTable {...defaultProps} isLoading={true} patients={[]} />);

    // When loading, the table body should have skeleton rows (animated placeholders)
    // The component renders 5 skeleton rows
    const tableRows = document.querySelectorAll('tbody tr');
    expect(tableRows.length).toBe(5);
  });

  it('should show error state when error occurs', () => {
    const error = new Error('Failed to load patients');
    render(<PatientTable {...defaultProps} error={error} patients={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Error loading patients')).toBeInTheDocument();
  });

  it('should show empty state when no patients found', () => {
    render(<PatientTable {...defaultProps} patients={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No patients found')).toBeInTheDocument();
  });

  it('should navigate to patient detail on row click', () => {
    render(<PatientTable {...defaultProps} />);

    const row = screen.getByText('MRN-20251230-0001').closest('tr');
    fireEvent.click(row!);

    expect(mockPush).toHaveBeenCalledWith('/patients/1');
  });

  it('should display gender badge correctly', () => {
    render(<PatientTable {...defaultProps} />);

    expect(screen.getByText('Male')).toBeInTheDocument();
  });

  it('should show sensitive badge for sensitive patients', () => {
    const sensitivePatient = { ...mockPatient, is_sensitive: true };
    render(<PatientTable {...defaultProps} patients={[sensitivePatient]} />);

    expect(screen.getByText('Sensitive')).toBeInTheDocument();
  });

  it('should render table headers', () => {
    render(<PatientTable {...defaultProps} />);

    expect(screen.getByText('MRN')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age/Gender')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('County')).toBeInTheDocument();
  });

  it('should display dash for missing phone number', () => {
    const patientWithoutPhone = { ...mockPatient, phone_number: null };
    render(<PatientTable {...defaultProps} patients={[patientWithoutPhone]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should render multiple patients', () => {
    const secondPatient = { ...mockPatient, id: 2, mrn: 'MRN-20251230-0002', first_name: 'Jane' };
    render(<PatientTable {...defaultProps} patients={[mockPatient, secondPatient]} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });
});

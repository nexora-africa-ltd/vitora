/**
 * TDD Tests for PatientEncounters Component
 * Tests display of patient's encounter history
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PatientEncounters } from '@/components/patients/patient-encounters';

// Mock the hook
jest.mock('@/lib/hooks/use-patients-enhanced', () => ({
  usePatientEncounters: jest.fn(),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock EmptyState
jest.mock('@/components/shared/empty-state', () => ({
  EmptyState: ({ title, description, icon }: any) => (
    <div data-testid="empty-state">
      <span data-testid="empty-title">{title}</span>
      {description && <span data-testid="empty-description">{description}</span>}
    </div>
  ),
}));

// Mock format utilities
jest.mock('@/lib/utils/format', () => ({
  formatDate: (date: string) => date,
  formatRelativeTime: (date: string) => 'recently',
}));

// Mock constants
jest.mock('@/lib/utils/constants', () => ({
  ENCOUNTER_STATUS: [
    { value: 'active', label: 'Active', color: 'bg-green-500' },
    { value: 'completed', label: 'Completed', color: 'bg-blue-500' },
  ],
  ENCOUNTER_TYPES: [
    { value: 'OPD', label: 'Outpatient' },
    { value: 'IPD', label: 'Inpatient' },
    { value: 'EMERGENCY', label: 'Emergency' },
  ],
}));

import { usePatientEncounters } from '@/lib/hooks/use-patients-enhanced';

const mockUsePatientEncounters = usePatientEncounters as jest.MockedFunction<typeof usePatientEncounters>;

describe('PatientEncounters Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading skeleton while loading', () => {
    mockUsePatientEncounters.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    const { container } = render(<PatientEncounters patientId={1} />);

    // Should show skeleton elements
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show error state when loading fails', () => {
    mockUsePatientEncounters.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-title')).toHaveTextContent('Error loading encounters');
  });

  it('should show empty state when no encounters', () => {
    mockUsePatientEncounters.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-title')).toHaveTextContent('No encounters');
  });

  it('should render encounter list', () => {
    const mockEncounters = [
      {
        id: 1,
        encounter_type: 'OPD',
        status: 'active',
        chief_complaint: 'Headache and fever',
        encounter_date: '2025-01-01',
        created_at: '2025-01-01T10:00:00Z',
      },
      {
        id: 2,
        encounter_type: 'EMERGENCY',
        status: 'completed',
        chief_complaint: 'Injury from fall',
        encounter_date: '2025-01-02',
        created_at: '2025-01-02T14:00:00Z',
      },
    ];

    mockUsePatientEncounters.mockReturnValue({
      data: mockEncounters,
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByText('Headache and fever')).toBeInTheDocument();
    expect(screen.getByText('Injury from fall')).toBeInTheDocument();
  });

  it('should render encounter type label', () => {
    const mockEncounters = [
      {
        id: 1,
        encounter_type: 'OPD',
        status: 'active',
        chief_complaint: 'Test complaint',
        encounter_date: '2025-01-01',
        created_at: '2025-01-01T10:00:00Z',
      },
    ];

    mockUsePatientEncounters.mockReturnValue({
      data: mockEncounters,
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByText('Outpatient')).toBeInTheDocument();
  });

  it('should render encounter status badge', () => {
    const mockEncounters = [
      {
        id: 1,
        encounter_type: 'OPD',
        status: 'active',
        chief_complaint: 'Test',
        encounter_date: '2025-01-01',
        created_at: '2025-01-01T10:00:00Z',
      },
    ];

    mockUsePatientEncounters.mockReturnValue({
      data: mockEncounters,
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should link to encounter detail page', () => {
    const mockEncounters = [
      {
        id: 123,
        encounter_type: 'OPD',
        status: 'active',
        chief_complaint: 'Test',
        encounter_date: '2025-01-01',
        created_at: '2025-01-01T10:00:00Z',
      },
    ];

    mockUsePatientEncounters.mockReturnValue({
      data: mockEncounters,
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/encounters/123');
  });

  it('should display encounter date', () => {
    const mockEncounters = [
      {
        id: 1,
        encounter_type: 'OPD',
        status: 'active',
        chief_complaint: 'Test',
        encounter_date: '2025-01-15',
        created_at: '2025-01-15T10:00:00Z',
      },
    ];

    mockUsePatientEncounters.mockReturnValue({
      data: mockEncounters,
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByText('2025-01-15')).toBeInTheDocument();
  });

  it('should fall back to encounter_type when type not found', () => {
    const mockEncounters = [
      {
        id: 1,
        encounter_type: 'UNKNOWN_TYPE',
        status: 'active',
        chief_complaint: 'Test',
        encounter_date: '2025-01-01',
        created_at: '2025-01-01T10:00:00Z',
      },
    ];

    mockUsePatientEncounters.mockReturnValue({
      data: mockEncounters,
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={1} />);

    expect(screen.getByText('UNKNOWN_TYPE')).toBeInTheDocument();
  });

  it('should call hook with correct patientId', () => {
    mockUsePatientEncounters.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<PatientEncounters patientId={42} />);

    expect(mockUsePatientEncounters).toHaveBeenCalledWith(42);
  });
});

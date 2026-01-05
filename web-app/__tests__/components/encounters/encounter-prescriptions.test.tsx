/**
 * @jest-environment jsdom
 */
/**
 * Tests for EncounterPrescriptions component
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EncounterPrescriptions } from '@/components/encounters/encounter-prescriptions';

// Mock the hook
jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useEncounterPrescriptions: jest.fn(),
}));

import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';

const mockUseEncounterPrescriptions = useEncounterPrescriptions as jest.MockedFunction<typeof useEncounterPrescriptions>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('EncounterPrescriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state', () => {
    mockUseEncounterPrescriptions.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useEncounterPrescriptions>);

    render(
      <EncounterPrescriptions encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('Prescriptions')).toBeInTheDocument();
  });

  it('should render empty state when no prescriptions', () => {
    mockUseEncounterPrescriptions.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterPrescriptions>);

    render(
      <EncounterPrescriptions encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('No prescriptions for this encounter')).toBeInTheDocument();
  });

  it('should render prescriptions when available', () => {
    mockUseEncounterPrescriptions.mockReturnValue({
      data: [
        {
          id: 1,
          prescription_number: 'RX-2025-001',
          status: 'PENDING',
          items: [{ drug_name: 'Amoxicillin 500mg' }],
          prescribed_date: '2025-01-05',
          prescriber_name: 'Dr. Smith',
          valid_until: '2025-02-05',
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterPrescriptions>);

    render(
      <EncounterPrescriptions encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('RX-2025-001')).toBeInTheDocument();
    expect(screen.getByText(/Amoxicillin 500mg/)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('should show New Prescription button when not disabled', () => {
    mockUseEncounterPrescriptions.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterPrescriptions>);

    render(
      <EncounterPrescriptions encounterId={1} patientId={1} disabled={false} />,
      { wrapper }
    );

    expect(screen.getByRole('link', { name: /new prescription/i })).toBeInTheDocument();
  });

  it('should hide New Prescription button when disabled', () => {
    mockUseEncounterPrescriptions.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterPrescriptions>);

    render(
      <EncounterPrescriptions encounterId={1} patientId={1} disabled={true} />,
      { wrapper }
    );

    expect(screen.queryByRole('link', { name: /new prescription/i })).not.toBeInTheDocument();
  });

  it('should separate pending and dispensed prescriptions', () => {
    mockUseEncounterPrescriptions.mockReturnValue({
      data: [
        {
          id: 1,
          prescription_number: 'RX-001',
          status: 'PENDING',
          items: [],
          prescribed_date: '2025-01-05',
          valid_until: '2025-02-05',
        },
        {
          id: 2,
          prescription_number: 'RX-002',
          status: 'DISPENSED',
          items: [],
          prescribed_date: '2025-01-04',
          valid_until: '2025-02-04',
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterPrescriptions>);

    render(
      <EncounterPrescriptions encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('Awaiting Dispensing (1)')).toBeInTheDocument();
    expect(screen.getByText('Dispensed (1)')).toBeInTheDocument();
  });
});

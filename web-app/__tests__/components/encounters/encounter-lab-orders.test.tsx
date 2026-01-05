/**
 * @jest-environment jsdom
 */
/**
 * Tests for EncounterLabOrders component
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EncounterLabOrders } from '@/components/encounters/encounter-lab-orders';

// Mock the hook
jest.mock('@/lib/hooks/use-laboratory', () => ({
  useEncounterLabOrders: jest.fn(),
}));

import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';

const mockUseEncounterLabOrders = useEncounterLabOrders as jest.MockedFunction<typeof useEncounterLabOrders>;

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

describe('EncounterLabOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state', () => {
    mockUseEncounterLabOrders.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useEncounterLabOrders>);

    render(
      <EncounterLabOrders encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('Lab Orders')).toBeInTheDocument();
  });

  it('should render empty state when no orders', () => {
    mockUseEncounterLabOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterLabOrders>);

    render(
      <EncounterLabOrders encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('No lab orders for this encounter')).toBeInTheDocument();
  });

  it('should render lab orders when available', () => {
    mockUseEncounterLabOrders.mockReturnValue({
      data: [
        {
          id: 1,
          order_number: 'LAB-2025-001',
          status: 'ORDERED',
          priority: 'ROUTINE',
          items: [{ test_name: 'Complete Blood Count' }],
          created_at: '2025-01-05T10:00:00Z',
          ordered_by_name: 'Dr. Smith',
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterLabOrders>);

    render(
      <EncounterLabOrders encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('LAB-2025-001')).toBeInTheDocument();
    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.getByText('Ordered')).toBeInTheDocument();
  });

  it('should show Order Lab Test button when not disabled', () => {
    mockUseEncounterLabOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterLabOrders>);

    render(
      <EncounterLabOrders encounterId={1} patientId={1} disabled={false} />,
      { wrapper }
    );

    expect(screen.getByRole('link', { name: /order lab test/i })).toBeInTheDocument();
  });

  it('should hide Order Lab Test button when disabled', () => {
    mockUseEncounterLabOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterLabOrders>);

    render(
      <EncounterLabOrders encounterId={1} patientId={1} disabled={true} />,
      { wrapper }
    );

    expect(screen.queryByRole('link', { name: /order lab test/i })).not.toBeInTheDocument();
  });

  it('should separate pending and completed orders', () => {
    mockUseEncounterLabOrders.mockReturnValue({
      data: [
        {
          id: 1,
          order_number: 'LAB-001',
          status: 'ORDERED',
          priority: 'ROUTINE',
          items: [],
          created_at: '2025-01-05T10:00:00Z',
        },
        {
          id: 2,
          order_number: 'LAB-002',
          status: 'COMPLETED',
          priority: 'ROUTINE',
          items: [],
          created_at: '2025-01-04T10:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterLabOrders>);

    render(
      <EncounterLabOrders encounterId={1} patientId={1} />,
      { wrapper }
    );

    expect(screen.getByText('Pending (1)')).toBeInTheDocument();
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();
  });
});

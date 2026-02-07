/**
 * Tests for EncounterImagingOrders component.
 * Phase B: Frontend Order Management
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EncounterImagingOrders } from '@/components/encounters/encounter-imaging-orders';
import { useEncounterImagingOrders } from '@/lib/hooks/use-imaging';
import { useRouter } from 'next/navigation';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/hooks/use-imaging', () => ({
  useEncounterImagingOrders: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseEncounterImagingOrders = useEncounterImagingOrders as jest.MockedFunction<
  typeof useEncounterImagingOrders
>;

describe('EncounterImagingOrders', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    });
  });

  it('renders loading state', () => {
    mockUseEncounterImagingOrders.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    expect(screen.getByText('Imaging Orders')).toBeInTheDocument();
    // Should show skeletons during loading
  });

  it('renders error state', () => {
    mockUseEncounterImagingOrders.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    } as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    expect(screen.getByText('Failed to load imaging orders.')).toBeInTheDocument();
  });

  it('renders empty state with description', () => {
    mockUseEncounterImagingOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    expect(
      screen.getByText(/No imaging orders for this encounter/)
    ).toBeInTheDocument();
  });

  it('renders orders when data is available', () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 1,
        encounter: 1,
        ordered_by: 1,
        priority: 'ROUTINE' as const,
        clinical_indication: 'Rule out pneumonia',
        status: 'ORDERED' as const,
        total_cost: 1500,
        is_paid: false,
        items: [
          {
            id: 1,
            procedure: 1,
            procedure_name: 'Chest X-Ray',
            procedure_code: 'XR-CHEST',
            modality: 'XR' as const,
            laterality: 'NA' as const,
            is_completed: false,
            unit_cost: 1500,
          },
        ],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockUseEncounterImagingOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    expect(screen.getByText('IMG-2026-0001')).toBeInTheDocument();
    // Clinical indication is displayed
    expect(screen.getByText('Rule out pneumonia')).toBeInTheDocument();
  });

  it('navigates to new order page on button click', async () => {
    mockUseEncounterImagingOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={123} patientId={456} />);

    const button = screen.getByRole('button', { name: /Order Imaging/i });
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledWith(
      '/imaging/orders/new?encounter=123&patient=456'
    );
  });

  it('calls onBeforeNavigate before navigating', async () => {
    const onBeforeNavigate = jest.fn().mockResolvedValue(undefined);

    mockUseEncounterImagingOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(
      <EncounterImagingOrders
        encounterId={123}
        patientId={456}
        onBeforeNavigate={onBeforeNavigate}
      />
    );

    const button = screen.getByRole('button', { name: /Order Imaging/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onBeforeNavigate).toHaveBeenCalled();
    });

    expect(mockPush).toHaveBeenCalled();
  });

  it('disables order button when disabled prop is true', () => {
    mockUseEncounterImagingOrders.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(
      <EncounterImagingOrders encounterId={1} patientId={1} disabled={true} />
    );

    const button = screen.getByRole('button', { name: /Order Imaging/i });
    expect(button).toBeDisabled();
  });

  it('renders order card as link to detail page', () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 1,
        encounter: 1,
        ordered_by: 1,
        priority: 'STAT' as const,
        clinical_indication: 'Emergency',
        status: 'IN_PROGRESS' as const,
        total_cost: 5000,
        is_paid: false,
        items: [
          {
            id: 1,
            procedure: 1,
            procedure_name: 'CT Head',
            procedure_code: 'CT-HEAD',
            modality: 'CT' as const,
            laterality: 'NA' as const,
            is_completed: false,
            unit_cost: 5000,
          },
        ],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockUseEncounterImagingOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    // The order card should be a link to the detail page
    const orderLink = screen.getByRole('link', { name: /IMG-2026-0001/i });
    expect(orderLink).toHaveAttribute('href', '/imaging/orders/IMG-2026-0001');
  });

  it('shows pending and completed sections', () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 1,
        encounter: 1,
        ordered_by: 1,
        priority: 'ROUTINE' as const,
        clinical_indication: 'Test 1',
        status: 'ORDERED' as const,
        total_cost: 1500,
        is_paid: false,
        items: [],
        ordered_at: '2026-02-06T10:00:00Z',
      },
      {
        id: 2,
        order_number: 'IMG-2026-0002',
        patient: 1,
        encounter: 1,
        ordered_by: 1,
        priority: 'ROUTINE' as const,
        clinical_indication: 'Test 2',
        status: 'REPORTED' as const,
        total_cost: 2500,
        is_paid: true,
        items: [],
        ordered_at: '2026-02-05T10:00:00Z',
      },
    ];

    mockUseEncounterImagingOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    expect(screen.getByText('Pending (1)')).toBeInTheDocument();
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();
  });

  it('shows priority badge for urgent orders', () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 1,
        encounter: 1,
        ordered_by: 1,
        priority: 'STAT' as const,
        clinical_indication: 'Emergency',
        status: 'ORDERED' as const,
        total_cost: 5000,
        is_paid: false,
        items: [],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockUseEncounterImagingOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEncounterImagingOrders>);

    render(<EncounterImagingOrders encounterId={1} patientId={1} />);

    // Check for STAT priority badge - uses the full label
    expect(screen.getByText(/STAT/i)).toBeInTheDocument();
  });
});

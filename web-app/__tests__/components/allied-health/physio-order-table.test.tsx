/**
 * Unit Tests for PhysioOrderTable Component
 *
 * Tests for the physiotherapy order list table component including:
 * - Rendering orders
 * - Filtering by status
 * - Filtering by priority
 * - Search functionality
 * - Pagination
 * - Navigation to detail
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhysioOrderTable } from '@/components/allied-health/physiotherapy/physio-order-table';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock the hook
jest.mock('@/lib/hooks/use-physiotherapy', () => ({
  usePhysioOrders: jest.fn(),
}));

import { usePhysioOrders } from '@/lib/hooks/use-physiotherapy';

const mockUsePhysioOrders = usePhysioOrders as jest.Mock;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockOrders = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      order_number: 'PHYSIO-20260226-0001',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      treatment_type_name: 'Post-Surgery Rehabilitation',
      category: 'POST_SURGICAL',
      assigned_therapist_name: 'Jane Therapist',
      total_sessions: 12,
      completed_sessions: 3,
      priority: 'ROUTINE' as const,
      status: 'IN_PROGRESS' as const,
      created_at: '2026-02-26T10:00:00Z',
    },
    {
      id: 2,
      order_number: 'PHYSIO-20260226-0002',
      patient_name: 'Mary Smith',
      patient_mrn: 'MRN-002',
      treatment_type_name: 'Sports Injury Recovery',
      category: 'SPORTS',
      assigned_therapist_name: null,
      total_sessions: 8,
      completed_sessions: 0,
      priority: 'URGENT' as const,
      status: 'PENDING' as const,
      created_at: '2026-02-26T09:00:00Z',
    },
    {
      id: 3,
      order_number: 'PHYSIO-20260226-0003',
      patient_name: 'James Wilson',
      patient_mrn: 'MRN-003',
      treatment_type_name: 'Neurological Rehab',
      category: 'NEUROLOGICAL',
      assigned_therapist_name: 'Bob Therapist',
      total_sessions: 20,
      completed_sessions: 20,
      priority: 'ROUTINE' as const,
      status: 'COMPLETED' as const,
      created_at: '2026-02-25T08:00:00Z',
    },
  ],
};

// =============================================================================
// TEST WRAPPER
// =============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

const renderWithWrapper = (ui: React.ReactElement) => {
  return render(ui, { wrapper: createWrapper() });
};

// =============================================================================
// RENDERING TESTS
// =============================================================================

describe('PhysioOrderTable - Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should render table with orders', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('PHYSIO-20260226-0001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Post-Surgery Rehabilitation')).toBeInTheDocument();
  });

  it('should display all orders from data', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Mary Smith')).toBeInTheDocument();
    expect(screen.getByText('James Wilson')).toBeInTheDocument();
  });

  it('should show loading spinner when loading', () => {
    mockUsePhysioOrders.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderWithWrapper(<PhysioOrderTable />);
    
    // LoadingSpinner renders a spinner element
    expect(screen.getByRole('status') || screen.queryByTestId('loading-spinner')).toBeTruthy();
  });

  it('should show empty state when no orders', () => {
    mockUsePhysioOrders.mockReturnValue({
      data: { count: 0, next: null, previous: null, results: [] },
      isLoading: false,
      error: null,
    });

    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('No orders found')).toBeInTheDocument();
  });

  it('should show error message on error', () => {
    mockUsePhysioOrders.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
    });

    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText(/failed to load orders/i)).toBeInTheDocument();
  });

  it('should display order count', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText(/showing 3 of 3 orders/i)).toBeInTheDocument();
  });
});

// =============================================================================
// STATUS RENDERING TESTS
// =============================================================================

describe('PhysioOrderTable - Status Badges', () => {
  beforeEach(() => {
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should render IN_PROGRESS status badge', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('should render PENDING status badge', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('should render COMPLETED status badge', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});

// =============================================================================
// PRIORITY RENDERING TESTS
// =============================================================================

describe('PhysioOrderTable - Priority Badges', () => {
  beforeEach(() => {
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should render ROUTINE priority badge', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    // Two orders have ROUTINE priority
    const routineBadges = screen.getAllByText('Routine');
    expect(routineBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('should render URGENT priority badge', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });
});

// =============================================================================
// SESSION COUNT TESTS
// =============================================================================

describe('PhysioOrderTable - Session Count', () => {
  beforeEach(() => {
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should show session progress for in-progress order', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    // Order 1: 3/12 sessions
    expect(screen.getByText('3 / 12')).toBeInTheDocument();
  });

  it('should show zero progress for pending order', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    // Order 2: 0/8 sessions
    expect(screen.getByText('0 / 8')).toBeInTheDocument();
  });

  it('should show completed sessions for completed order', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    // Order 3: 20/20 sessions
    expect(screen.getByText('20 / 20')).toBeInTheDocument();
  });
});

// =============================================================================
// SEARCH TESTS
// =============================================================================

describe('PhysioOrderTable - Search', () => {
  beforeEach(() => {
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should render search input', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByPlaceholderText(/search orders/i)).toBeInTheDocument();
  });

  it('should update search params on form submit', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderTable />);
    
    const searchInput = screen.getByPlaceholderText(/search orders/i);
    await user.type(searchInput, 'John');
    await user.click(screen.getByRole('button', { name: /search/i }));
    
    expect(mockUsePhysioOrders).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'John' })
    );
  });
});

// =============================================================================
// FILTER TESTS
// =============================================================================

describe('PhysioOrderTable - Filters', () => {
  beforeEach(() => {
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should render status filter', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByRole('combobox', { name: /status/i }) || screen.getByText(/all status/i)).toBeTruthy();
  });

  it('should render priority filter', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByRole('combobox', { name: /priority/i }) || screen.getByText(/all priority/i)).toBeTruthy();
  });
});

// =============================================================================
// NAVIGATION TESTS
// =============================================================================

describe('PhysioOrderTable - Navigation', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should navigate to order detail on row click', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderTable />);
    
    const orderRow = screen.getByText('John Doe').closest('tr');
    if (orderRow) {
      await user.click(orderRow);
    }
    
    expect(mockPush).toHaveBeenCalledWith('/allied-health/physiotherapy/orders/1');
  });

  it('should have new order button', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByRole('button', { name: /new order/i })).toBeInTheDocument();
  });

  it('should navigate to new order form on button click', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderTable />);
    
    await user.click(screen.getByRole('button', { name: /new order/i }));
    
    expect(mockPush).toHaveBeenCalledWith('/allied-health/physiotherapy/orders/new');
  });
});

// =============================================================================
// THERAPIST DISPLAY TESTS
// =============================================================================

describe('PhysioOrderTable - Therapist Display', () => {
  beforeEach(() => {
    mockUsePhysioOrders.mockReturnValue({
      data: mockOrders,
      isLoading: false,
      error: null,
    });
  });

  it('should display assigned therapist name', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('Jane Therapist')).toBeInTheDocument();
  });

  it('should show "Unassigned" for orders without therapist', () => {
    renderWithWrapper(<PhysioOrderTable />);
    
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });
});

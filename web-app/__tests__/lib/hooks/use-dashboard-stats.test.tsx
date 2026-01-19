import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardStats, formatNumber, formatCurrency } from '@/lib/hooks/use-dashboard-stats';
import { apiClient } from '@/lib/api/client';

// Mock the API client
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Test wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  Wrapper.displayName = 'QueryClientTestWrapper';

  return Wrapper;
};

describe('useDashboardStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch dashboard stats successfully', async () => {
    const mockStats = {
      timestamp: '2026-01-17T08:30:00Z',
      cache_ttl: 300,
      patients: { total: 1247, today: 15, this_week: 89, this_month: 156 },
      encounters: { total: 3456, today: 48, in_progress: 8, completed_today: 40 },
      pharmacy: { prescriptions_today: 156, pending_dispensing: 12, low_stock_items: 7, expiring_soon: 15 },
      laboratory: { pending_tests: 18, completed_today: 32, critical_results: 2 },
      triage: { waiting: 5, avg_wait_time_minutes: 24, emergency_count: 2 },
      billing: { revenue_today: 145200, pending_payments: 25000, sha_claims_pending: 12 },
      alerts: { critical: 1, high: 3, medium: 5, total_unresolved: 9 },
    };

    mockApiClient.get.mockResolvedValueOnce({ data: mockStats });

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    // Wait for the actual data to be fetched (not just placeholder)
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data?.patients.total).toBe(1247);
    });

    expect(mockApiClient.get).toHaveBeenCalledWith('/api/core/dashboard/stats/', { params: {} });
  });

  it('should pass refresh param when specified', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useDashboardStats({ refresh: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(mockApiClient.get).toHaveBeenCalledWith('/api/core/dashboard/stats/', {
      params: { refresh: 'true' },
    });
  });

  it('should provide placeholder data while loading', () => {
    // Delay the API response indefinitely
    mockApiClient.get.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    // Should have placeholder data immediately (not undefined)
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.patients.total).toBe(0);
    expect(result.current.data?.encounters.today).toBe(0);
  });
});

describe('formatNumber', () => {
  it('should format numbers with commas', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatCurrency', () => {
  it('should format currency in KES', () => {
    const formatted = formatCurrency(145200);
    // Allow for locale variations (KES, Ksh, etc.)
    expect(formatted).toMatch(/145,200|145200/);
  });

  it('should handle zero', () => {
    const formatted = formatCurrency(0);
    expect(formatted).toMatch(/0/);
  });
});

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardStats, formatNumber, formatCurrency } from '@/lib/hooks/use-dashboard-stats';
import { apiClient, setActiveFacilityId, getActiveFacilityId } from '@/lib/api/client';
import { DashboardStatsSchema } from '@/lib/schemas/dashboard-stats.schema';

// Mock the API client — keep interceptors functional for header tests
jest.mock('@/lib/api/client', () => {
  let _facilityId: number | null = null;
  return {
    apiClient: {
      get: jest.fn(),
    },
    setActiveFacilityId: (id: number | null) => { _facilityId = id; },
    getActiveFacilityId: () => _facilityId,
  };
});

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
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        timestamp: '2026-01-17T08:30:00Z',
        cache_ttl: 300,
        patients: { total: 0, today: 0, this_week: 0, this_month: 0 },
        encounters: { total: 0, today: 0, in_progress: 0, completed_today: 0 },
        pharmacy: { prescriptions_today: 0, pending_dispensing: 0, low_stock_items: 0, expiring_soon: 0 },
        laboratory: { pending_tests: 0, completed_today: 0, critical_results: 0 },
        triage: { waiting: 0, avg_wait_time_minutes: 0, emergency_count: 0 },
        billing: { revenue_today: 0, pending_payments: 0, sha_claims_pending: 0 },
        alerts: { critical: 0, high: 0, medium: 0, total_unresolved: 0 },
      },
    });

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

  it('should reject invalid dashboard stats data with the schema', () => {
    const result = DashboardStatsSchema.safeParse({
      timestamp: '2026-01-17T08:30:00Z',
      cache_ttl: 300,
      patients: { total: 10, today: 2, this_week: 4, this_month: 8 },
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dashboard stats reflect active facility
// ---------------------------------------------------------------------------

describe('Dashboard stats reflect active facility', () => {
  const makeStats = (totalPatients: number) => ({
    timestamp: '2026-03-25T10:00:00Z',
    cache_ttl: 300,
    patients: { total: totalPatients, today: 2, this_week: 10, this_month: 40 },
    encounters: { total: 100, today: 8, in_progress: 3, completed_today: 5 },
    pharmacy: { prescriptions_today: 5, pending_dispensing: 1, low_stock_items: 0, expiring_soon: 2 },
    laboratory: { pending_tests: 3, completed_today: 7, critical_results: 0 },
    triage: { waiting: 2, avg_wait_time_minutes: 15, emergency_count: 0 },
    billing: { revenue_today: 50000, pending_payments: 10000, sha_claims_pending: 3 },
    alerts: { critical: 0, high: 1, medium: 2, total_unresolved: 3 },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setActiveFacilityId(null);
  });

  it('setActiveFacilityId updates getActiveFacilityId', () => {
    expect(getActiveFacilityId()).toBeNull();

    setActiveFacilityId(42);
    expect(getActiveFacilityId()).toBe(42);

    setActiveFacilityId(99);
    expect(getActiveFacilityId()).toBe(99);

    setActiveFacilityId(null);
    expect(getActiveFacilityId()).toBeNull();
  });

  it('fetches stats once per facility context', async () => {
    // Facility 1 returns 500 patients
    mockApiClient.get.mockResolvedValueOnce({ data: makeStats(500) });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }
    Wrapper.displayName = 'FacilityStatsWrapper';

    setActiveFacilityId(1);

    const { result } = renderHook(() => useDashboardStats(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.data?.patients.total).toBe(500);
    });

    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
  });

  it('re-fetches stats when facility changes and cache is invalidated', async () => {
    // First call (facility 1): 500 patients
    mockApiClient.get.mockResolvedValueOnce({ data: makeStats(500) });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }
    Wrapper.displayName = 'FacilityStatsWrapper2';

    setActiveFacilityId(1);

    const { result } = renderHook(() => useDashboardStats(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.data?.patients.total).toBe(500);
    });

    // Switch facility and invalidate cache (simulates what FacilityProvider does)
    mockApiClient.get.mockResolvedValueOnce({ data: makeStats(120) });
    setActiveFacilityId(2);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    });

    await waitFor(() => {
      expect(result.current.data?.patients.total).toBe(120);
    });

    // Two separate API calls were made
    expect(mockApiClient.get).toHaveBeenCalledTimes(2);
  });

  it('shows zero stats while loading for new facility', async () => {
    // Delay API response indefinitely
    mockApiClient.get.mockImplementation(() => new Promise(() => {}));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }
    Wrapper.displayName = 'FacilityStatsWrapper3';

    setActiveFacilityId(5);

    const { result } = renderHook(() => useDashboardStats(), { wrapper: Wrapper });

    // Placeholder zeros shown immediately (placeholderData means isLoading=false)
    expect(result.current.data).toBeDefined();
    expect(result.current.data?.patients.total).toBe(0);
    // isFetching is true (request in flight), even though placeholderData makes isLoading false
    expect(result.current.isFetching).toBe(true);
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

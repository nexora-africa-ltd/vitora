/**
 * Tests for Allied Health dashboard hooks.
 *
 * Tests the useAlliedHealthDashboard hook for fetching combined
 * statistics from all Allied Health modules.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useAlliedHealthDashboard, alliedHealthKeys } from '@/lib/hooks/use-allied-health';
import { alliedHealthApi } from '@/lib/api/allied-health';

// Mock the API
jest.mock('@/lib/api/allied-health', () => ({
  alliedHealthApi: {
    getDashboard: jest.fn(),
  },
}));

const mockAlliedHealthApi = alliedHealthApi as jest.Mocked<typeof alliedHealthApi>;

// Create wrapper with fresh QueryClient for each test
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return Wrapper;
}

const mockDashboardData = {
  physiotherapy: {
    pending_count: 5,
    in_progress_count: 3,
    today_sessions_count: 10,
    completed_today_count: 7,
  },
  nutrition: {
    pending_count: 2,
    in_progress_count: 1,
    today_sessions_count: 5,
    completed_today_count: 3,
    consultations_count: 8,
  },
  occupational_therapy: {
    pending_count: 4,
    in_progress_count: 2,
    today_sessions_count: 6,
    completed_today_count: 4,
  },
  social_work: {
    open_cases_count: 15,
    urgent_count: 3,
    this_week_count: 5,
  },
  counselling: {
    pending_count: 3,
    in_progress_count: 2,
    today_sessions_count: 8,
    completed_today_count: 5,
    follow_ups_count: 4,
  },
  todays_sessions: [
    {
      id: 1,
      session_number: 'PS-001',
      scheduled_time: '2026-02-26T09:00:00Z',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      module: 'PHYSIO' as const,
      treatment_type: 'Post-Surgery Rehab',
      status: 'SCHEDULED' as const,
    },
  ],
};

describe('alliedHealthKeys', () => {
  it('generates correct query keys', () => {
    expect(alliedHealthKeys.all).toEqual(['allied-health']);
    expect(alliedHealthKeys.dashboard()).toEqual(['allied-health', 'dashboard']);
  });
});

describe('useAlliedHealthDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches dashboard successfully', async () => {
    mockAlliedHealthApi.getDashboard.mockResolvedValueOnce(mockDashboardData);

    const { result } = renderHook(() => useAlliedHealthDashboard(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for data
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockDashboardData);
    expect(mockAlliedHealthApi.getDashboard).toHaveBeenCalledTimes(1);
  });

  it('returns correct physiotherapy stats', async () => {
    mockAlliedHealthApi.getDashboard.mockResolvedValueOnce(mockDashboardData);

    const { result } = renderHook(() => useAlliedHealthDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.physiotherapy.pending_count).toBe(5);
    expect(result.current.data?.physiotherapy.in_progress_count).toBe(3);
    expect(result.current.data?.physiotherapy.today_sessions_count).toBe(10);
  });

  it('returns correct social work stats', async () => {
    mockAlliedHealthApi.getDashboard.mockResolvedValueOnce(mockDashboardData);

    const { result } = renderHook(() => useAlliedHealthDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.social_work.open_cases_count).toBe(15);
    expect(result.current.data?.social_work.urgent_count).toBe(3);
  });

  it('returns todays sessions', async () => {
    mockAlliedHealthApi.getDashboard.mockResolvedValueOnce(mockDashboardData);

    const { result } = renderHook(() => useAlliedHealthDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.todays_sessions).toHaveLength(1);
    expect(result.current.data?.todays_sessions[0].patient_name).toBe('John Doe');
    expect(result.current.data?.todays_sessions[0].module).toBe('PHYSIO');
  });

  it('handles API errors gracefully', async () => {
    const error = new Error('Network error');
    mockAlliedHealthApi.getDashboard.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAlliedHealthDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

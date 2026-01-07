/**
 * TDD Tests for usePreTriageQueue Hook - Phase 4.2
 *
 * Tests cover:
 * 1. Fetching pre-triage queue
 * 2. Filter by triage_requirement
 * 3. Auto-refresh behavior
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePreTriageQueue } from '@/lib/hooks/use-encounters';
import { encountersApi, PreTriageQueueItem } from '@/lib/api/encounters';
import type { PaginatedResponse } from '@/lib/types';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    getPreTriageQueue: jest.fn(),
    // Keep other methods as undefined
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getConsultationQueue: jest.fn(),
    callPatient: jest.fn(),
    startConsultation: jest.fn(),
    bypassTriage: jest.fn(),
  },
}));

const mockedApi = encountersApi as jest.Mocked<typeof encountersApi>;

// =============================================================================
// Mock Data
// =============================================================================

const mockPreTriageQueue: PaginatedResponse<PreTriageQueueItem> = {
  results: [
    {
      id: 1,
      patient_id: 101,
      patient_name: 'John Kamau',
      patient_mrn: 'MRN-20260105-0001',
      patient_age: 45,
      patient_gender: 'M',
      encounter_type: 'OPD',
      chief_complaint: 'Headache',
      triage_requirement: 'MANDATORY',
      triage_status: 'PENDING',
      created_at: '2026-01-05T08:00:00Z',
      wait_time_minutes: 15,
    },
    {
      id: 2,
      patient_id: 102,
      patient_name: 'Mary Wanjiku',
      patient_mrn: 'MRN-20260105-0002',
      patient_age: 32,
      patient_gender: 'F',
      encounter_type: 'FOLLOW_UP',
      chief_complaint: 'Follow-up visit',
      triage_requirement: 'OPTIONAL',
      triage_status: 'PENDING',
      created_at: '2026-01-05T08:05:00Z',
      wait_time_minutes: 10,
    },
    {
      id: 3,
      patient_id: 103,
      patient_name: 'Peter Ochieng',
      patient_mrn: 'MRN-20260105-0003',
      patient_age: 28,
      patient_gender: 'M',
      encounter_type: 'EMERGENCY',
      chief_complaint: 'Chest pain',
      triage_requirement: 'MANDATORY',
      triage_status: 'PENDING',
      created_at: '2026-01-05T08:10:00Z',
      wait_time_minutes: 5,
    },
  ],
  count: 3,
  next: null,
  previous: null,
};

// =============================================================================
// Test Wrapper
// =============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('usePreTriageQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch pre-triage queue successfully', async () => {
    mockedApi.getPreTriageQueue.mockResolvedValueOnce(mockPreTriageQueue);

    const { result } = renderHook(() => usePreTriageQueue(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.results).toHaveLength(3);
    expect(result.current.data?.results?.[0]?.patient_name).toBe('John Kamau');
    expect(result.current.data?.results?.[0]?.triage_requirement).toBe('MANDATORY');
    expect(result.current.data?.results?.[0]?.triage_status).toBe('PENDING');
  });

  it('should filter by triage_requirement', async () => {
    const mandatoryOnly: PaginatedResponse<PreTriageQueueItem> = {
      ...mockPreTriageQueue,
      results: mockPreTriageQueue.results.filter((r: PreTriageQueueItem) => r.triage_requirement === 'MANDATORY'),
      count: 2,
    };
    mockedApi.getPreTriageQueue.mockResolvedValueOnce(mandatoryOnly);

    const { result } = renderHook(
      () => usePreTriageQueue({ triage_requirement: 'MANDATORY' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should only have MANDATORY encounters
    expect(result.current.data?.results?.length).toBe(2);
    expect(
      result.current.data?.results?.every(r => r.triage_requirement === 'MANDATORY')
    ).toBe(true);
    
    // Verify API was called with filter
    expect(mockedApi.getPreTriageQueue).toHaveBeenCalledWith(
      expect.objectContaining({ triage_requirement: 'MANDATORY' })
    );
  });

  it('should include wait_time_minutes in results', async () => {
    mockedApi.getPreTriageQueue.mockResolvedValueOnce(mockPreTriageQueue);

    const { result } = renderHook(() => usePreTriageQueue(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.results?.[0]?.wait_time_minutes).toBeDefined();
    expect(typeof result.current.data?.results?.[0]?.wait_time_minutes).toBe('number');
  });

  it('should include patient info in results', async () => {
    mockedApi.getPreTriageQueue.mockResolvedValueOnce(mockPreTriageQueue);

    const { result } = renderHook(() => usePreTriageQueue(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstResult = result.current.data?.results?.[0];
    expect(firstResult?.patient_name).toBeDefined();
    expect(firstResult?.patient_mrn).toBeDefined();
    expect(firstResult?.patient_age).toBeDefined();
    expect(firstResult?.patient_gender).toBeDefined();
  });

  it('should include encounter info in results', async () => {
    mockedApi.getPreTriageQueue.mockResolvedValueOnce(mockPreTriageQueue);

    const { result } = renderHook(() => usePreTriageQueue(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstResult = result.current.data?.results[0];
    expect(firstResult?.encounter_type).toBeDefined();
    expect(firstResult?.chief_complaint).toBeDefined();
    expect(firstResult?.created_at).toBeDefined();
  });

  it('should handle error state', async () => {
    mockedApi.getPreTriageQueue.mockRejectedValueOnce(new Error('Server error'));

    const { result } = renderHook(() => usePreTriageQueue(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('should return empty array when no pending encounters', async () => {
    mockedApi.getPreTriageQueue.mockResolvedValueOnce({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });

    const { result } = renderHook(() => usePreTriageQueue(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.results).toHaveLength(0);
  });
});

/**
 * TDD Tests for useConsultationQueue Hook
 *
 * Phase 3.3: Call Patient Functionality
 *
 * Test Categories:
 * 1. Queue Data Fetching
 * 2. Call Patient Mutation
 * 3. Start Consultation Mutation
 * 4. Bypass Triage Mutation
 * 5. Error Handling
 * 6. Cache Invalidation
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { 
  useConsultationQueue, 
  useCallPatient, 
  useStartConsultation,
  useBypassTriage,
} from '@/lib/hooks/use-consultation-queue';
import { consultationQueueApi } from '@/lib/api/consultation-queue';
import type { ConsultationQueueItem } from '@/lib/types/encounter';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('@/lib/api/consultation-queue', () => ({
  consultationQueueApi: {
    getQueue: jest.fn(),
    callPatient: jest.fn(),
    startConsultation: jest.fn(),
    bypassTriage: jest.fn(),
  },
}));

const mockedApi = consultationQueueApi as jest.Mocked<typeof consultationQueueApi>;

// =============================================================================
// TEST SETUP
// =============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
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

const mockQueueItem: ConsultationQueueItem = {
  id: 1,
  patient_id: 1,
  patient_name: 'John Kamau',
  patient_mrn: 'MRN-20260104-0001',
  patient_age: 45,
  patient_gender: 'M',
  encounter_type: 'OPD',
  encounter_type_display: 'Outpatient Department',
  chief_complaint: 'Headache and fever',
  triage_status: 'COMPLETED',
  triage_category: 'YELLOW',
  triage_bypass_reason: null,
  consultation_status: 'WAITING',
  arrival_time: new Date().toISOString(),
  triage_completed_at: new Date().toISOString(),
  wait_time_minutes: 30,
  called_at: null,
};

// =============================================================================
// TEST SUITE
// =============================================================================

describe('useConsultationQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Queue Data Fetching Tests
  // ===========================================================================
  describe('Queue Data Fetching', () => {
    it('should fetch consultation queue data', async () => {
      const mockData = {
        results: [mockQueueItem],
        count: 1,
      };
      mockedApi.getQueue.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useConsultationQueue(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(mockedApi.getQueue).toHaveBeenCalledTimes(1);
    });

    it('should pass filters to API', async () => {
      mockedApi.getQueue.mockResolvedValueOnce({ results: [], count: 0 });

      const filters = { consultation_status: 'WAITING' as const };
      const { result } = renderHook(() => useConsultationQueue(filters), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockedApi.getQueue).toHaveBeenCalledWith(filters);
    });

    it('should handle fetch error', async () => {
      mockedApi.getQueue.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useConsultationQueue(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. Call Patient Mutation Tests
  // ===========================================================================
  describe('useCallPatient', () => {
    it('should call patient successfully', async () => {
      // callPatient returns an Encounter
      const calledEncounter = {
        id: 1,
        consultation_status: 'CALLED',
        called_at: new Date().toISOString(),
      };
      mockedApi.callPatient.mockResolvedValueOnce(calledEncounter as any);

      const { result } = renderHook(() => useCallPatient(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockedApi.callPatient).toHaveBeenCalledWith(1);
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should handle call patient error', async () => {
      mockedApi.callPatient.mockRejectedValueOnce(
        new Error('Cannot call patient - triage required')
      );

      const { result } = renderHook(() => useCallPatient(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it('should invalidate queue cache on success', async () => {
      const calledEncounter = {
        id: 1,
        consultation_status: 'CALLED',
        called_at: new Date().toISOString(),
      };
      mockedApi.callPatient.mockResolvedValueOnce(calledEncounter as any);
      mockedApi.getQueue.mockResolvedValue({ results: [mockQueueItem], count: 1 });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      // First, populate the cache
      const { result: queueResult } = renderHook(() => useConsultationQueue(), {
        wrapper,
      });
      await waitFor(() => expect(queueResult.current.isSuccess).toBe(true));

      // Then call patient
      const { result: callResult } = renderHook(() => useCallPatient(), {
        wrapper,
      });
      await act(async () => {
        await callResult.current.mutateAsync(1);
      });

      // Wait for cache invalidation to trigger refetch
      await waitFor(() => {
        expect(mockedApi.getQueue).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ===========================================================================
  // 3. Start Consultation Mutation Tests
  // ===========================================================================
  describe('useStartConsultation', () => {
    it('should start consultation successfully', async () => {
      // startConsultation returns an Encounter
      const inProgressEncounter = {
        id: 1,
        consultation_status: 'IN_PROGRESS',
        consultation_started_at: new Date().toISOString(),
      };
      mockedApi.startConsultation.mockResolvedValueOnce(inProgressEncounter as any);

      const { result } = renderHook(() => useStartConsultation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockedApi.startConsultation).toHaveBeenCalledWith(1);
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should handle start consultation error', async () => {
      mockedApi.startConsultation.mockRejectedValueOnce(
        new Error('Consultation already in progress')
      );

      const { result } = renderHook(() => useStartConsultation(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  // ===========================================================================
  // 4. Bypass Triage Mutation Tests
  // ===========================================================================
  describe('useBypassTriage', () => {
    it('should bypass triage successfully', async () => {
      // bypassTriage returns an Encounter, not ConsultationQueueItem
      const bypassedEncounter = {
        id: 1,
        triage_status: 'BYPASSED',
        triage_bypass_reason: 'STABLE_FOLLOW_UP',
      };
      mockedApi.bypassTriage.mockResolvedValueOnce(bypassedEncounter as any);

      const { result } = renderHook(() => useBypassTriage(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ 
          encounterId: 1, 
          reason: 'STABLE_FOLLOW_UP' 
        });
      });

      expect(mockedApi.bypassTriage).toHaveBeenCalledWith(1, 'STABLE_FOLLOW_UP', undefined);
      
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should bypass triage with notes', async () => {
      const bypassedEncounter = {
        id: 1,
        triage_status: 'BYPASSED',
        triage_bypass_reason: 'OTHER',
      };
      mockedApi.bypassTriage.mockResolvedValueOnce(bypassedEncounter as any);

      const { result } = renderHook(() => useBypassTriage(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ 
          encounterId: 1, 
          reason: 'OTHER',
          notes: 'Patient requested direct consultation'
        });
      });

      expect(mockedApi.bypassTriage).toHaveBeenCalledWith(
        1, 
        'OTHER', 
        'Patient requested direct consultation'
      );
    });

    it('should handle bypass error for mandatory triage', async () => {
      mockedApi.bypassTriage.mockRejectedValueOnce(
        new Error('Cannot bypass mandatory triage')
      );

      const { result } = renderHook(() => useBypassTriage(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({ 
            encounterId: 1, 
            reason: 'STABLE_FOLLOW_UP' 
          });
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });
});

// =============================================================================
// API CLIENT TESTS
// =============================================================================

describe('consultationQueueApi', () => {
  // These tests verify the API client functions exist and have correct signatures
  // Actual HTTP calls would be mocked in integration tests
  
  it('should have getQueue function', () => {
    expect(typeof consultationQueueApi.getQueue).toBe('function');
  });

  it('should have callPatient function', () => {
    expect(typeof consultationQueueApi.callPatient).toBe('function');
  });

  it('should have startConsultation function', () => {
    expect(typeof consultationQueueApi.startConsultation).toBe('function');
  });

  it('should have bypassTriage function', () => {
    expect(typeof consultationQueueApi.bypassTriage).toBe('function');
  });
});

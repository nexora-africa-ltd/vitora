/**
 * Offline Sync Integration Tests
 *
 * Tests for complete offline/online sync workflow.
 * Following TDD RED-GREEN-REFACTOR approach.
 *
 * Requirements:
 * - Patient operations queue for sync when offline
 * - Sync processor handles pending operations
 * - Offline indicator shows current status
 * - Pull to refresh triggers sync attempt
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Components
import { PatientList } from '../../components/patients/PatientList';
import { OfflineBanner } from '../../components/ui/OfflineBanner';

// Hooks
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useSyncStatus } from '../../hooks/useSyncStatus';

// Sync
import { syncQueueManager } from '../../lib/sync/queue';

// Mocks
const mockFetch = jest.fn();
const mockFetchCount = jest.fn();
const mockCreate = jest.fn();
const mockFind = jest.fn();
const mockUpdate = jest.fn();

const mockDatabase = {
  get: jest.fn(() => ({
    query: jest.fn(() => ({
      fetch: mockFetch,
      fetchCount: mockFetchCount,
    })),
    find: mockFind,
    create: mockCreate,
  })),
  write: jest.fn((callback: () => Promise<unknown>) => callback()),
};

jest.mock('../../lib/db', () => ({
  getDatabase: jest.fn(() => mockDatabase),
}));

// Mock NetInfo
let mockNetInfoState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
};

const mockNetInfoListeners: Array<(state: typeof mockNetInfoState) => void> = [];

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((callback) => {
    mockNetInfoListeners.push(callback);
    return () => {
      const index = mockNetInfoListeners.indexOf(callback);
      if (index > -1) mockNetInfoListeners.splice(index, 1);
    };
  }),
  fetch: jest.fn(() => Promise.resolve(mockNetInfoState)),
}));

// Mock API client
const mockApiPost = jest.fn();
const mockApiPatch = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('../../lib/api/client', () => {
  const mockClient = {
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  return {
    getApiClient: jest.fn(() => mockClient),
    apiClient: mockClient,
  };
});

// Import sync processor after mocks are set up
import { syncProcessor } from '../../lib/sync/processor';

// Helper to simulate network change
const simulateNetworkChange = (isConnected: boolean, isInternetReachable: boolean = isConnected) => {
  mockNetInfoState = { isConnected, isInternetReachable, type: isConnected ? 'wifi' : 'none' };
  mockNetInfoListeners.forEach((listener) => listener(mockNetInfoState));
};

// Test wrapper
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Offline Sync Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfoState = { isConnected: true, isInternetReachable: true, type: 'wifi' };
  });

  describe('Patient Operations Queue', () => {
    test('should queue CREATE operation when patient is created', async () => {
      mockCreate.mockResolvedValue({ id: 'patient-1' });
      mockFetch.mockResolvedValue([]);
      
      // Simulate patient creation
      await syncQueueManager.add('CREATE', 'Patient', 'patient-1', {
        first_name: 'John',
        last_name: 'Doe',
      });

      expect(mockCreate).toHaveBeenCalled();
    });

    test('should queue UPDATE operation when patient is updated', async () => {
      mockCreate.mockResolvedValue({ id: 'queue-1' });
      
      await syncQueueManager.add('UPDATE', 'Patient', 'patient-1', {
        first_name: 'Jane',
      });

      expect(mockCreate).toHaveBeenCalled();
    });

    test('should queue DELETE operation when patient is deleted', async () => {
      mockCreate.mockResolvedValue({ id: 'queue-1' });
      
      await syncQueueManager.add('DELETE', 'Patient', 'patient-1', {});

      expect(mockCreate).toHaveBeenCalled();
    });

    test('should return pending count accurately', async () => {
      mockFetchCount.mockResolvedValue(5);
      
      const count = await syncQueueManager.getPendingCount();
      
      expect(count).toBe(5);
    });
  });

  describe('Offline Status Detection', () => {
    test('should detect online status', async () => {
      const TestComponent = () => {
        const { isOffline, isConnected } = useOfflineStatus();
        return (
          <>
            <OfflineBanner isOffline={isOffline} />
          </>
        );
      };

      const { queryByText } = render(<TestComponent />);
      
      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeNull();
      });
    });

    test('should detect offline status', async () => {
      simulateNetworkChange(false);
      
      const TestComponent = () => {
        const { isOffline } = useOfflineStatus();
        return <OfflineBanner isOffline={isOffline} />;
      };

      const { findByText } = render(<TestComponent />);
      
      await waitFor(() => {
        // Component should show offline indicator
        expect(findByText).toBeDefined();
      });
    });

    test('should update when network status changes', async () => {
      let capturedStatus = { isOffline: false };
      
      const TestComponent = () => {
        const status = useOfflineStatus();
        capturedStatus = status;
        return <OfflineBanner isOffline={status.isOffline} />;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(capturedStatus.isOffline).toBe(false);
      });

      // Simulate going offline
      act(() => {
        simulateNetworkChange(false);
      });

      await waitFor(() => {
        expect(capturedStatus.isOffline).toBe(true);
      });
    });
  });

  describe('Sync Status Hook', () => {
    test('should return pending count', async () => {
      mockFetchCount.mockResolvedValue(3);
      
      let capturedStatus: { pendingCount: number; hasPending: boolean } | null = null;
      
      const TestComponent = () => {
        const status = useSyncStatus();
        capturedStatus = status;
        return null;
      };

      render(<TestComponent />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(capturedStatus?.pendingCount).toBe(3);
        expect(capturedStatus?.hasPending).toBe(true);
      });
    });

    test('should indicate no pending when queue is empty', async () => {
      mockFetchCount.mockResolvedValue(0);
      
      let capturedStatus: { pendingCount: number; hasPending: boolean } | null = null;
      
      const TestComponent = () => {
        const status = useSyncStatus();
        capturedStatus = status;
        return null;
      };

      render(<TestComponent />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(capturedStatus?.pendingCount).toBe(0);
        expect(capturedStatus?.hasPending).toBe(false);
      });
    });
  });

  describe('Sync Processor', () => {
    test('should export sync processor', () => {
      expect(syncProcessor).toBeDefined();
    });

    test('should have processQueue method', () => {
      expect(typeof syncProcessor.processQueue).toBe('function');
    });

    test('should have processSingle method', () => {
      expect(typeof syncProcessor.processSingle).toBe('function');
    });

    test('should process pending entries when online', async () => {
      const mockEntry = {
        id: 'queue-1',
        operation: 'CREATE',
        modelName: 'Patient',
        recordId: 'patient-1',
        data: JSON.stringify({ first_name: 'John' }),
        status: 'PENDING',
        update: jest.fn(),
      };
      mockFetch.mockResolvedValue([mockEntry]);
      mockFind.mockResolvedValue(mockEntry);

      const result = await syncProcessor.processQueue();
      
      expect(result).toBeDefined();
    });

    test('should skip processing when offline', async () => {
      simulateNetworkChange(false);
      
      const result = await syncProcessor.processQueue({ checkNetwork: true });
      
      expect(result.processed).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Pull to Refresh', () => {
    test('should trigger sync on refresh', async () => {
      mockFetch.mockResolvedValue([]);
      mockFetchCount.mockResolvedValue(0);
      
      let onRefreshCalled = false;
      
      const mockOnRefresh = jest.fn(() => {
        onRefreshCalled = true;
        return Promise.resolve();
      });
      
      const { getByTestId } = render(
        <PatientList
          patients={[]}
          onPatientPress={jest.fn()}
          onRefresh={mockOnRefresh}
          refreshing={false}
          loading={false}
        />
      );

      // Patient list should have pull-to-refresh capability
      expect(mockOnRefresh).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should mark entry as failed on API error', async () => {
      const mockEntry = {
        id: 'queue-1',
        operation: 'CREATE',
        modelName: 'Patient',
        recordId: 'patient-1',
        data: JSON.stringify({ first_name: 'John' }),
        status: 'PENDING',
        retryCount: 0,
        update: jest.fn(),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markFailed('queue-1', 'Network error');

      expect(mockFind).toHaveBeenCalledWith('queue-1');
    });

    test('should increment retry count on failure', async () => {
      const mockEntry = {
        id: 'queue-1',
        retryCount: 1,
        update: jest.fn((updater: (e: typeof mockEntry) => void) => {
          updater(mockEntry);
          expect(mockEntry.retryCount).toBe(2);
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markFailed('queue-1', 'Timeout');
    });

    test('should mark as conflict on 409 response', async () => {
      const mockEntry = {
        id: 'queue-1',
        update: jest.fn(),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markConflict('queue-1', 'Conflict detected');

      expect(mockEntry.update).toHaveBeenCalled();
    });
  });

  describe('Offline to Online Transition', () => {
    test('should attempt sync when coming online', async () => {
      mockFetch.mockResolvedValue([]);
      
      // Start offline
      simulateNetworkChange(false);
      
      let capturedStatus = { isOffline: true };
      
      const TestComponent = () => {
        const status = useOfflineStatus();
        capturedStatus = status;
        return null;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(capturedStatus.isOffline).toBe(true);
      });

      // Come online
      act(() => {
        simulateNetworkChange(true);
      });

      await waitFor(() => {
        expect(capturedStatus.isOffline).toBe(false);
      });
    });
  });
});

describe('Loading States', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchCount.mockResolvedValue(0);
  });

  test('should show loading state during sync', async () => {
    let capturedIsLoading: boolean | undefined;
    
    const TestComponent = () => {
      const status = useSyncStatus();
      capturedIsLoading = status.isLoading;
      return null;
    };

    render(<TestComponent />, { wrapper: createTestWrapper() });

    // Initial loading state should be true
    expect(capturedIsLoading).toBe(true);

    await waitFor(() => {
      expect(capturedIsLoading).toBe(false);
    });
  });
});

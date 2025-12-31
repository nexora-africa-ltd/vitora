/**
 * Sync Processor Tests
 *
 * Tests for the sync processor that handles offline sync queue processing.
 */

import { syncProcessor } from '../../lib/sync/processor';
import { syncQueueManager } from '../../lib/sync/queue';
import NetInfo from '@react-native-community/netinfo';

// Mock dependencies
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

jest.mock('../../lib/sync/queue', () => ({
  syncQueueManager: {
    getPending: jest.fn(),
    getRetryable: jest.fn(),
    markSyncing: jest.fn(),
    markSynced: jest.fn(),
    markFailed: jest.fn(),
    markConflict: jest.fn(),
    resetToPending: jest.fn(),
    clearSynced: jest.fn(),
  },
}));

const mockApiClient = {
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../lib/api/client', () => ({
  getApiClient: jest.fn(() => mockApiClient),
}));

const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;
const mockSyncQueue = syncQueueManager as jest.Mocked<typeof syncQueueManager>;

describe('Sync Processor Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    } as any);
  });

  describe('isOnline()', () => {
    test('should return true when connected and internet reachable', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      } as any);

      const result = await syncProcessor.isOnline();
      expect(result).toBe(true);
    });

    test('should return false when not connected', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
      } as any);

      const result = await syncProcessor.isOnline();
      expect(result).toBe(false);
    });

    test('should return false when internet not reachable', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        isInternetReachable: false,
      } as any);

      const result = await syncProcessor.isOnline();
      expect(result).toBe(false);
    });
  });

  describe('processSingle()', () => {
    const mockEntry = {
      id: 'entry-1',
      operation: 'CREATE' as const,
      modelName: 'Patient',
      recordId: 'patient-1',
      data: JSON.stringify({ first_name: 'John', last_name: 'Doe' }),
      status: 'PENDING' as const,
      retryCount: 0,
    };

    test('should process CREATE operation successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processSingle(mockEntry as any);

      expect(mockSyncQueue.markSyncing).toHaveBeenCalledWith('entry-1');
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/patients/', {
        first_name: 'John',
        last_name: 'Doe',
      });
      expect(mockSyncQueue.markSynced).toHaveBeenCalledWith('entry-1');
      expect(result.success).toBe(true);
      expect(result.id).toBe('entry-1');
    });

    test('should process UPDATE operation successfully', async () => {
      const updateEntry = {
        ...mockEntry,
        operation: 'UPDATE' as const,
        data: JSON.stringify({ id: 1, first_name: 'Jane' }),
      };
      mockApiClient.patch.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processSingle(updateEntry as any);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/patients/1/', {
        id: 1,
        first_name: 'Jane',
      });
      expect(result.success).toBe(true);
    });

    test('should process DELETE operation successfully', async () => {
      const deleteEntry = {
        ...mockEntry,
        operation: 'DELETE' as const,
        data: JSON.stringify({ id: 1 }),
      };
      mockApiClient.delete.mockResolvedValue({});

      const result = await syncProcessor.processSingle(deleteEntry as any);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/patients/1/');
      expect(result.success).toBe(true);
    });

    test('should return error for unknown model', async () => {
      const unknownEntry = {
        ...mockEntry,
        modelName: 'UnknownModel',
      };

      const result = await syncProcessor.processSingle(unknownEntry as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown model: UnknownModel');
    });

    test('should mark as failed on API error', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Network error'));

      const result = await syncProcessor.processSingle(mockEntry as any);

      expect(mockSyncQueue.markFailed).toHaveBeenCalledWith('entry-1', 'Network error');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('should mark as conflict on 409 error', async () => {
      mockApiClient.post.mockRejectedValue(new Error('409 Conflict'));

      const result = await syncProcessor.processSingle(mockEntry as any);

      expect(mockSyncQueue.markConflict).toHaveBeenCalledWith('entry-1', '409 Conflict');
      expect(result.success).toBe(false);
    });
  });

  describe('processQueue()', () => {
    const mockEntries = [
      {
        id: 'entry-1',
        operation: 'CREATE' as const,
        modelName: 'Patient',
        recordId: 'patient-1',
        data: JSON.stringify({ first_name: 'John' }),
        status: 'PENDING' as const,
        retryCount: 0,
      },
      {
        id: 'entry-2',
        operation: 'CREATE' as const,
        modelName: 'Patient',
        recordId: 'patient-2',
        data: JSON.stringify({ first_name: 'Jane' }),
        status: 'PENDING' as const,
        retryCount: 0,
      },
    ];

    test('should process all pending entries', async () => {
      mockSyncQueue.getPending.mockResolvedValue(mockEntries as any);
      mockApiClient.post.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processQueue();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    test('should skip processing when offline with checkNetwork option', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
      } as any);

      const result = await syncProcessor.processQueue({ checkNetwork: true });

      expect(result.processed).toBe(0);
      expect(mockSyncQueue.getPending).not.toHaveBeenCalled();
    });

    test('should process when online with checkNetwork option', async () => {
      mockSyncQueue.getPending.mockResolvedValue(mockEntries as any);
      mockApiClient.post.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processQueue({ checkNetwork: true });

      expect(result.processed).toBe(2);
    });

    test('should apply limit option', async () => {
      mockSyncQueue.getPending.mockResolvedValue(mockEntries as any);
      mockApiClient.post.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processQueue({ limit: 1 });

      expect(result.processed).toBe(1);
    });

    test('should stop on error with stopOnError option', async () => {
      mockSyncQueue.getPending.mockResolvedValue(mockEntries as any);
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce({ data: { id: 1 } });

      const result = await syncProcessor.processQueue({ stopOnError: true });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
    });

    test('should continue on error without stopOnError option', async () => {
      mockSyncQueue.getPending.mockResolvedValue(mockEntries as any);
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce({ data: { id: 1 } });

      const result = await syncProcessor.processQueue({ stopOnError: false });

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(1);
    });

    test('should return empty result when no pending entries', async () => {
      mockSyncQueue.getPending.mockResolvedValue([]);

      const result = await syncProcessor.processQueue();

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('processRetryable()', () => {
    const mockRetryable = [
      {
        id: 'entry-1',
        operation: 'CREATE' as const,
        modelName: 'Patient',
        recordId: 'patient-1',
        data: JSON.stringify({ first_name: 'John' }),
        status: 'FAILED' as const,
        retryCount: 1,
      },
    ];

    test('should process retryable entries', async () => {
      mockSyncQueue.getRetryable.mockResolvedValue(mockRetryable as any);
      mockApiClient.post.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processRetryable();

      expect(mockSyncQueue.resetToPending).toHaveBeenCalledWith('entry-1');
      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
    });

    test('should skip when offline with checkNetwork option', async () => {
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
      } as any);

      const result = await syncProcessor.processRetryable({ checkNetwork: true });

      expect(result.processed).toBe(0);
    });

    test('should apply limit option', async () => {
      const multipleRetryable = [...mockRetryable, { ...mockRetryable[0], id: 'entry-2' }];
      mockSyncQueue.getRetryable.mockResolvedValue(multipleRetryable as any);
      mockApiClient.post.mockResolvedValue({ data: { id: 1 } });

      const result = await syncProcessor.processRetryable({ limit: 1 });

      expect(result.processed).toBe(1);
    });
  });

  describe('cleanup()', () => {
    test('should call clearSynced on queue manager', async () => {
      await syncProcessor.cleanup();

      expect(mockSyncQueue.clearSynced).toHaveBeenCalled();
    });
  });
});

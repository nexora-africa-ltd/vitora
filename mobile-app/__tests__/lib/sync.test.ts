/**
 * Sync Queue Tests
 *
 * Tests for sync queue manager and related hooks.
 * Following TDD RED-GREEN-REFACTOR approach.
 *
 * Requirements:
 * - Queue manager with add/getPending/mark methods
 * - useOfflineStatus hook for network detection
 * - useSyncStatus hook for pending count
 */

import { syncQueueManager, SyncQueueEntry } from '../../lib/sync/queue';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useSyncStatus } from '../../hooks/useSyncStatus';

// Mock WatermelonDB
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockMarkAsDeleted = jest.fn();
const mockFetch = jest.fn();
const mockFetchCount = jest.fn();
const mockFind = jest.fn();

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

// Mock NetInfo for offline status
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
    })
  ),
}));

describe('Sync Queue Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('add()', () => {
    test('should add CREATE operation to queue', async () => {
      const data = { first_name: 'John', last_name: 'Doe' };
      mockCreate.mockResolvedValue({ id: 'queue-1' });

      await syncQueueManager.add('CREATE', 'Patient', 'patient-123', data);

      expect(mockCreate).toHaveBeenCalled();
    });

    test('should add UPDATE operation to queue', async () => {
      const data = { first_name: 'Jane' };
      mockCreate.mockResolvedValue({ id: 'queue-2' });

      await syncQueueManager.add('UPDATE', 'Patient', 'patient-123', data);

      expect(mockCreate).toHaveBeenCalled();
    });

    test('should add DELETE operation to queue', async () => {
      mockCreate.mockResolvedValue({ id: 'queue-3' });

      await syncQueueManager.add('DELETE', 'Patient', 'patient-123', {});

      expect(mockCreate).toHaveBeenCalled();
    });

    test('should set initial status to PENDING', async () => {
      mockCreate.mockImplementation((creator: any) => {
        const entry: any = {};
        creator(entry);
        expect(entry.status).toBe('PENDING');
        return Promise.resolve({ id: 'queue-4' });
      });

      await syncQueueManager.add('CREATE', 'Patient', 'patient-123', {});
    });

    test('should set retry count to 0', async () => {
      mockCreate.mockImplementation((creator: any) => {
        const entry: any = {};
        creator(entry);
        expect(entry.retryCount).toBe(0);
        return Promise.resolve({ id: 'queue-5' });
      });

      await syncQueueManager.add('CREATE', 'Patient', 'patient-123', {});
    });

    test('should serialize data as JSON string', async () => {
      const data = { first_name: 'John', age: 30 };
      mockCreate.mockImplementation((creator: any) => {
        const entry: any = {};
        creator(entry);
        expect(entry.data).toBe(JSON.stringify(data));
        return Promise.resolve({ id: 'queue-6' });
      });

      await syncQueueManager.add('CREATE', 'Patient', 'patient-123', data);
    });
  });

  describe('getPending()', () => {
    test('should return all pending entries', async () => {
      const mockEntries = [
        { id: '1', status: 'PENDING', operation: 'CREATE' },
        { id: '2', status: 'PENDING', operation: 'UPDATE' },
      ];
      mockFetch.mockResolvedValue(mockEntries);

      const result = await syncQueueManager.getPending();

      expect(result).toEqual(mockEntries);
    });

    test('should return empty array when no pending entries', async () => {
      mockFetch.mockResolvedValue([]);

      const result = await syncQueueManager.getPending();

      expect(result).toEqual([]);
    });
  });

  describe('getPendingCount()', () => {
    test('should return count of pending entries', async () => {
      mockFetchCount.mockResolvedValue(5);

      const result = await syncQueueManager.getPendingCount();

      expect(result).toBe(5);
    });

    test('should return 0 when no pending entries', async () => {
      mockFetchCount.mockResolvedValue(0);

      const result = await syncQueueManager.getPendingCount();

      expect(result).toBe(0);
    });
  });

  describe('markSyncing()', () => {
    test('should update entry status to SYNCING', async () => {
      const mockEntry = {
        id: 'queue-1',
        update: jest.fn((updater: any) => {
          const entry: any = {};
          updater(entry);
          expect(entry.status).toBe('SYNCING');
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markSyncing('queue-1');

      expect(mockEntry.update).toHaveBeenCalled();
    });
  });

  describe('markSynced()', () => {
    test('should update entry status to SYNCED', async () => {
      const mockEntry = {
        id: 'queue-1',
        update: jest.fn((updater: any) => {
          const entry: any = {};
          updater(entry);
          expect(entry.status).toBe('SYNCED');
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markSynced('queue-1');

      expect(mockEntry.update).toHaveBeenCalled();
    });

    test('should set syncedAt timestamp', async () => {
      const mockEntry = {
        id: 'queue-1',
        update: jest.fn((updater: any) => {
          const entry: any = {};
          updater(entry);
          expect(entry.syncedAt).toBeInstanceOf(Date);
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markSynced('queue-1');
    });
  });

  describe('markFailed()', () => {
    test('should update entry status to FAILED', async () => {
      const mockEntry = {
        id: 'queue-1',
        retryCount: 0,
        update: jest.fn((updater: any) => {
          const entry: any = { retryCount: 0 };
          updater(entry);
          expect(entry.status).toBe('FAILED');
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markFailed('queue-1', 'Network error');

      expect(mockEntry.update).toHaveBeenCalled();
    });

    test('should store error message', async () => {
      const mockEntry = {
        id: 'queue-1',
        retryCount: 0,
        update: jest.fn((updater: any) => {
          const entry: any = { retryCount: 0 };
          updater(entry);
          expect(entry.errorMessage).toBe('Network error');
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markFailed('queue-1', 'Network error');
    });

    test('should increment retry count', async () => {
      const mockEntry = {
        id: 'queue-1',
        retryCount: 1,
        update: jest.fn((updater: any) => {
          const entry: any = { retryCount: 1 };
          updater(entry);
          expect(entry.retryCount).toBe(2);
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markFailed('queue-1', 'Timeout');
    });
  });

  describe('clearSynced()', () => {
    test('should delete all synced entries', async () => {
      const mockEntries = [
        { id: '1', markAsDeleted: jest.fn() },
        { id: '2', markAsDeleted: jest.fn() },
      ];
      mockFetch.mockResolvedValue(mockEntries);

      await syncQueueManager.clearSynced();

      expect(mockEntries[0].markAsDeleted).toHaveBeenCalled();
      expect(mockEntries[1].markAsDeleted).toHaveBeenCalled();
    });

    test('should handle empty synced list', async () => {
      mockFetch.mockResolvedValue([]);

      await expect(syncQueueManager.clearSynced()).resolves.not.toThrow();
    });
  });

  describe('getByRecordId()', () => {
    test('should find queue entries by record ID', async () => {
      const mockEntries = [{ id: 'queue-1', recordId: 'patient-123' }];
      mockFetch.mockResolvedValue(mockEntries);

      const result = await syncQueueManager.getByRecordId('patient-123');

      expect(result).toEqual(mockEntries);
    });
  });
});

describe('Sync Hooks', () => {
  describe('useOfflineStatus', () => {
    test('should export useOfflineStatus hook', () => {
      expect(useOfflineStatus).toBeDefined();
      expect(typeof useOfflineStatus).toBe('function');
    });
  });

  describe('useSyncStatus', () => {
    test('should export useSyncStatus hook', () => {
      expect(useSyncStatus).toBeDefined();
      expect(typeof useSyncStatus).toBe('function');
    });
  });
});

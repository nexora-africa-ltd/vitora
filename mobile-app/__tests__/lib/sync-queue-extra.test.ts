/**
 * Sync Queue Additional Tests
 *
 * Additional tests for sync queue manager to improve branch coverage.
 */

import { syncQueueManager } from '../../lib/sync/queue';

// Mock WatermelonDB
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockMarkAsDeleted = jest.fn();
const mockFetch = jest.fn();
const mockFetchCount = jest.fn();
const mockFind = jest.fn();
const mockObserve = jest.fn(() => ({
  subscribe: jest.fn(),
}));

const mockDatabase = {
  get: jest.fn(() => ({
    query: jest.fn(() => ({
      fetch: mockFetch,
      fetchCount: mockFetchCount,
      observe: mockObserve,
    })),
    find: mockFind,
    create: mockCreate,
  })),
  write: jest.fn((callback: () => Promise<unknown>) => callback()),
};

jest.mock('../../lib/db', () => ({
  getDatabase: jest.fn(() => mockDatabase),
}));

describe('Sync Queue Manager Additional Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getByRecordId()', () => {
    test('should return entries for a specific record', async () => {
      const mockEntries = [
        { id: '1', recordId: 'patient-123', operation: 'UPDATE' },
      ];
      mockFetch.mockResolvedValue(mockEntries);

      const result = await syncQueueManager.getByRecordId('patient-123');

      expect(result).toEqual(mockEntries);
    });

    test('should return empty array when no entries found', async () => {
      mockFetch.mockResolvedValue([]);

      const result = await syncQueueManager.getByRecordId('non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('getStatusSummary()', () => {
    test('should return counts by status', async () => {
      mockFetchCount
        .mockResolvedValueOnce(5) // PENDING
        .mockResolvedValueOnce(2) // SYNCING
        .mockResolvedValueOnce(10) // SYNCED
        .mockResolvedValueOnce(1) // FAILED
        .mockResolvedValueOnce(0); // CONFLICT

      const result = await syncQueueManager.getStatusSummary();

      expect(result).toEqual({
        PENDING: 5,
        SYNCING: 2,
        SYNCED: 10,
        FAILED: 1,
        CONFLICT: 0,
      });
    });
  });

  describe('clearSynced()', () => {
    test('should delete all synced entries', async () => {
      const mockSyncedEntries = [
        { id: '1', markAsDeleted: jest.fn() },
        { id: '2', markAsDeleted: jest.fn() },
      ];
      mockFetch.mockResolvedValue(mockSyncedEntries);

      await syncQueueManager.clearSynced();

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('markConflict()', () => {
    test('should update entry status to CONFLICT with error message', async () => {
      const mockEntry = {
        id: 'queue-1',
        update: jest.fn((updater: (entry: any) => void) => {
          const entry: any = {};
          updater(entry);
          expect(entry.status).toBe('CONFLICT');
          expect(entry.errorMessage).toBe('Conflict detected');
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.markConflict('queue-1', 'Conflict detected');

      expect(mockEntry.update).toHaveBeenCalled();
    });
  });

  describe('resetToPending()', () => {
    test('should reset entry status to PENDING', async () => {
      const mockEntry = {
        id: 'queue-1',
        update: jest.fn((updater: (entry: any) => void) => {
          const entry: any = {};
          updater(entry);
          expect(entry.status).toBe('PENDING');
        }),
      };
      mockFind.mockResolvedValue(mockEntry);

      await syncQueueManager.resetToPending('queue-1');

      expect(mockEntry.update).toHaveBeenCalled();
    });
  });
});

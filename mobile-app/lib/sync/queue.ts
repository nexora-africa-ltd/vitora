/**
 * Sync Queue Manager
 *
 * Manages the offline sync queue for pending operations.
 * Operations are queued when offline and synced when connectivity is restored.
 *
 * @module lib/sync/queue
 */

import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '@/lib/db';
import { SyncQueue, SyncOperation, SyncStatus } from '@/lib/db/models/SyncQueue';

/**
 * Entry in the sync queue
 */
export interface SyncQueueEntry {
  id: string;
  operation: SyncOperation;
  modelName: string;
  recordId: string;
  data: string;
  status: SyncStatus;
  retryCount: number;
  errorMessage?: string;
  createdAt: Date;
  syncedAt?: Date;
}

/**
 * Sync Queue Manager
 *
 * Provides methods for managing the offline sync queue.
 */
export const syncQueueManager = {
  /**
   * Add an operation to the sync queue
   */
  async add(
    operation: SyncOperation,
    modelName: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<SyncQueue> {
    const database = getDatabase();
    return database.write(async () => {
      const entry = await database.get<SyncQueue>('sync_queue').create((record) => {
        record.operation = operation;
        record.modelName = modelName;
        record.recordId = recordId;
        record.data = JSON.stringify(data);
        record.status = 'PENDING';
        record.retryCount = 0;
      });
      return entry;
    });
  },

  /**
   * Get all pending entries in the queue
   */
  async getPending(): Promise<SyncQueue[]> {
    const database = getDatabase();
    return database
      .get<SyncQueue>('sync_queue')
      .query(
        Q.where('status', 'PENDING'),
        Q.sortBy('created_at', Q.asc)
      )
      .fetch();
  },

  /**
   * Get count of pending entries
   */
  async getPendingCount(): Promise<number> {
    const database = getDatabase();
    return database
      .get<SyncQueue>('sync_queue')
      .query(Q.where('status', 'PENDING'))
      .fetchCount();
  },

  /**
   * Get entries that need retry (failed with retries remaining)
   */
  async getRetryable(): Promise<SyncQueue[]> {
    const database = getDatabase();
    return database
      .get<SyncQueue>('sync_queue')
      .query(
        Q.where('status', 'FAILED'),
        Q.where('retry_count', Q.lt(3)),
        Q.sortBy('created_at', Q.asc)
      )
      .fetch();
  },

  /**
   * Get entries by record ID
   */
  async getByRecordId(recordId: string): Promise<SyncQueue[]> {
    const database = getDatabase();
    return database
      .get<SyncQueue>('sync_queue')
      .query(Q.where('record_id', recordId))
      .fetch();
  },

  /**
   * Mark an entry as syncing
   */
  async markSyncing(id: string): Promise<void> {
    const database = getDatabase();
    await database.write(async () => {
      const entry = await database.get<SyncQueue>('sync_queue').find(id);
      await entry.update((record) => {
        record.status = 'SYNCING';
      });
    });
  },

  /**
   * Mark an entry as successfully synced
   */
  async markSynced(id: string): Promise<void> {
    const database = getDatabase();
    await database.write(async () => {
      const entry = await database.get<SyncQueue>('sync_queue').find(id);
      await entry.update((record) => {
        record.status = 'SYNCED';
        record.syncedAt = new Date();
      });
    });
  },

  /**
   * Mark an entry as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<void> {
    const database = getDatabase();
    await database.write(async () => {
      const entry = await database.get<SyncQueue>('sync_queue').find(id);
      await entry.update((record) => {
        record.status = 'FAILED';
        record.errorMessage = errorMessage;
        record.retryCount = entry.retryCount + 1;
      });
    });
  },

  /**
   * Mark an entry as having a conflict
   */
  async markConflict(id: string, errorMessage: string): Promise<void> {
    const database = getDatabase();
    await database.write(async () => {
      const entry = await database.get<SyncQueue>('sync_queue').find(id);
      await entry.update((record) => {
        record.status = 'CONFLICT';
        record.errorMessage = errorMessage;
      });
    });
  },

  /**
   * Clear all synced entries from the queue
   */
  async clearSynced(): Promise<void> {
    const database = getDatabase();
    await database.write(async () => {
      const syncedEntries = await database
        .get<SyncQueue>('sync_queue')
        .query(Q.where('status', 'SYNCED'))
        .fetch();

      for (const entry of syncedEntries) {
        await entry.markAsDeleted();
      }
    });
  },

  /**
   * Reset a failed entry to pending (for manual retry)
   */
  async resetToPending(id: string): Promise<void> {
    const database = getDatabase();
    await database.write(async () => {
      const entry = await database.get<SyncQueue>('sync_queue').find(id);
      await entry.update((record) => {
        record.status = 'PENDING';
        record.errorMessage = undefined;
      });
    });
  },

  /**
   * Get sync status summary
   */
  async getStatusSummary(): Promise<Record<SyncStatus, number>> {
    const database = getDatabase();
    const statuses: SyncStatus[] = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT'];
    const summary: Record<string, number> = {};

    for (const status of statuses) {
      summary[status] = await database
        .get<SyncQueue>('sync_queue')
        .query(Q.where('status', status))
        .fetchCount();
    }

    return summary as Record<SyncStatus, number>;
  },
};

export default syncQueueManager;

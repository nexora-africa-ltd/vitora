/**
 * Sync Processor
 *
 * Processes the offline sync queue when network connectivity is available.
 * Handles API calls for CREATE/UPDATE/DELETE operations.
 *
 * @module lib/sync/processor
 */

import { syncQueueManager } from './queue';
import { getApiClient } from '@/lib/api/client';
import NetInfo from '@react-native-community/netinfo';
import { SyncQueue } from '@/lib/db/models/SyncQueue';

/**
 * API endpoint mapping for models
 */
const API_ENDPOINTS: Record<string, string> = {
  Patient: '/api/patients/',
  Encounter: '/api/encounters/',
};

/**
 * Result of processing a single sync entry
 */
export interface ProcessResult {
  id: string;
  success: boolean;
  error?: string;
}

/**
 * Result of processing the entire queue
 */
export interface QueueProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: ProcessResult[];
}

/**
 * Options for processing the queue
 */
export interface ProcessOptions {
  /** Whether to check network status before processing */
  checkNetwork?: boolean;
  /** Maximum number of entries to process */
  limit?: number;
  /** Whether to stop on first error */
  stopOnError?: boolean;
}

/**
 * Sync Processor
 *
 * Provides methods for processing the offline sync queue.
 */
export const syncProcessor = {
  /**
   * Check if device is online
   */
  async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable === true;
  },

  /**
   * Process a single sync queue entry
   */
  async processSingle(entry: SyncQueue): Promise<ProcessResult> {
    const endpoint = API_ENDPOINTS[entry.modelName];
    
    if (!endpoint) {
      return {
        id: entry.id,
        success: false,
        error: `Unknown model: ${entry.modelName}`,
      };
    }

    try {
      // Mark as syncing
      await syncQueueManager.markSyncing(entry.id);
      
      const data = JSON.parse(entry.data);
      const client = getApiClient();

      switch (entry.operation) {
        case 'CREATE':
          await client.post(endpoint, data);
          break;
        case 'UPDATE':
          await client.patch(`${endpoint}${data.id}/`, data);
          break;
        case 'DELETE':
          await client.delete(`${endpoint}${data.id}/`);
          break;
      }

      // Mark as synced
      await syncQueueManager.markSynced(entry.id);

      return {
        id: entry.id,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's a conflict (409)
      if (errorMessage.includes('409') || errorMessage.includes('conflict')) {
        await syncQueueManager.markConflict(entry.id, errorMessage);
      } else {
        await syncQueueManager.markFailed(entry.id, errorMessage);
      }

      return {
        id: entry.id,
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Process all pending entries in the queue
   */
  async processQueue(options: ProcessOptions = {}): Promise<QueueProcessResult> {
    const { checkNetwork = false, limit, stopOnError = false } = options;

    // Check network if requested
    if (checkNetwork) {
      const online = await this.isOnline();
      if (!online) {
        return {
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          results: [],
        };
      }
    }

    // Get pending entries
    let pending = await syncQueueManager.getPending();
    
    // Apply limit if specified
    if (limit && limit > 0) {
      pending = pending.slice(0, limit);
    }

    const results: ProcessResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const entry of pending) {
      const result = await this.processSingle(entry);
      results.push(result);
      
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        if (stopOnError) {
          break;
        }
      }
    }

    return {
      processed: results.length,
      succeeded,
      failed,
      skipped: pending.length - results.length,
      results,
    };
  },

  /**
   * Process retryable (failed) entries
   */
  async processRetryable(options: ProcessOptions = {}): Promise<QueueProcessResult> {
    const { checkNetwork = false, limit, stopOnError = false } = options;

    if (checkNetwork) {
      const online = await this.isOnline();
      if (!online) {
        return {
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          results: [],
        };
      }
    }

    let retryable = await syncQueueManager.getRetryable();
    
    if (limit && limit > 0) {
      retryable = retryable.slice(0, limit);
    }

    const results: ProcessResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const entry of retryable) {
      // Reset to pending first
      await syncQueueManager.resetToPending(entry.id);
      
      const result = await this.processSingle(entry);
      results.push(result);
      
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        if (stopOnError) {
          break;
        }
      }
    }

    return {
      processed: results.length,
      succeeded,
      failed,
      skipped: retryable.length - results.length,
      results,
    };
  },

  /**
   * Cleanup synced entries
   */
  async cleanup(): Promise<void> {
    await syncQueueManager.clearSynced();
  },
};

export default syncProcessor;

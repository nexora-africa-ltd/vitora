/**
 * SyncQueue Model
 * 
 * WatermelonDB model for offline sync queue.
 * Tracks CREATE/UPDATE/DELETE operations that need to be synced to backend.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export class SyncQueue extends Model {
  static table = 'sync_queue';

  // Operation details
  @field('operation') operation!: SyncOperation;
  @field('model_name') modelName!: string; // 'Patient', 'Encounter', etc.
  @field('record_id') recordId!: string; // Local WatermelonDB ID

  // Data payload (JSON string)
  @field('data') data!: string;

  // Sync status
  @field('status') status!: SyncStatus;
  @field('retry_count') retryCount!: number;
  @field('error_message') errorMessage?: string;

  // Timestamps
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt?: Date;

  /**
   * Parse JSON data payload
   */
  get parsedData(): Record<string, any> {
    try {
      return JSON.parse(this.data);
    } catch (error) {
      console.error('Failed to parse sync queue data:', error);
      return {};
    }
  }

  /**
   * Check if sync should be retried
   */
  get shouldRetry(): boolean {
    return this.status === 'FAILED' && this.retryCount < 3;
  }

  /**
   * Check if sync is complete
   */
  get isComplete(): boolean {
    return this.status === 'SYNCED';
  }
}

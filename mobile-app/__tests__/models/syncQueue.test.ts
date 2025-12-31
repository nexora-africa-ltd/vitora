/**
 * SyncQueue Model Tests
 * 
 * Tests for SyncQueue model methods.
 */

import { SyncQueue } from '../../lib/db/models/SyncQueue';
import type { SyncOperation, SyncStatus } from '../../lib/db/models/SyncQueue';

describe('SyncQueue Model', () => {
  describe('SyncOperation type', () => {
    test('should accept CREATE value', () => {
      const op: SyncOperation = 'CREATE';
      expect(op).toBe('CREATE');
    });

    test('should accept UPDATE value', () => {
      const op: SyncOperation = 'UPDATE';
      expect(op).toBe('UPDATE');
    });

    test('should accept DELETE value', () => {
      const op: SyncOperation = 'DELETE';
      expect(op).toBe('DELETE');
    });
  });

  describe('SyncStatus type', () => {
    test('should accept PENDING value', () => {
      const status: SyncStatus = 'PENDING';
      expect(status).toBe('PENDING');
    });

    test('should accept SYNCING value', () => {
      const status: SyncStatus = 'SYNCING';
      expect(status).toBe('SYNCING');
    });

    test('should accept SYNCED value', () => {
      const status: SyncStatus = 'SYNCED';
      expect(status).toBe('SYNCED');
    });

    test('should accept FAILED value', () => {
      const status: SyncStatus = 'FAILED';
      expect(status).toBe('FAILED');
    });

    test('should accept CONFLICT value', () => {
      const status: SyncStatus = 'CONFLICT';
      expect(status).toBe('CONFLICT');
    });
  });

  describe('static table name', () => {
    test('should be sync_queue', () => {
      expect(SyncQueue.table).toBe('sync_queue');
    });
  });

  describe('parsedData getter', () => {
    test('should be defined', () => {
      const descriptor = Object.getOwnPropertyDescriptor(SyncQueue.prototype, 'parsedData');
      expect(descriptor?.get).toBeDefined();
    });
  });

  describe('shouldRetry getter', () => {
    test('should be defined', () => {
      const descriptor = Object.getOwnPropertyDescriptor(SyncQueue.prototype, 'shouldRetry');
      expect(descriptor?.get).toBeDefined();
    });
  });

  describe('isComplete getter', () => {
    test('should be defined', () => {
      const descriptor = Object.getOwnPropertyDescriptor(SyncQueue.prototype, 'isComplete');
      expect(descriptor?.get).toBeDefined();
    });
  });
});

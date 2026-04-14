import { getOfflineDatabase, setOfflineSyncMetadata } from '@/lib/db';

import { pullOfflineData } from './pull';
import { pushPendingSyncQueue } from './push';

export type SyncRunSummary = {
  conflictCount: number;
  encounterCount: number;
  error: string | null;
  failedCount: number;
  labOrderCount: number;
  lastSyncedAt: string | null;
  patientCount: number;
  pendingCount: number;
  prescriptionCount: number;
  pushedCount: number;
  status: 'conflict' | 'error' | 'synced';
};

export async function runOfflineSync(): Promise<SyncRunSummary> {
  try {
    const pushSummary = await pushPendingSyncQueue();
    const pullSummary = await pullOfflineData();
    const database = await getOfflineDatabase();
    const lastSyncedAt = new Date().toISOString();
    const conflictCount = database.queue.filter((entry) => entry.status === 'conflict').length;
    const failedCount = database.queue.filter((entry) => entry.status === 'failed').length;
    const pendingCount = database.queue.filter((entry) => entry.status !== 'conflict' && entry.status !== 'failed').length;

    await setOfflineSyncMetadata({
      last_successful_sync_at: lastSyncedAt,
      last_sync_error: null,
    });

    return {
      conflictCount,
      encounterCount: pullSummary.encounters,
      error: null,
      failedCount,
      labOrderCount: pullSummary.labOrders,
      lastSyncedAt,
      patientCount: pullSummary.patients,
      pendingCount,
      prescriptionCount: pullSummary.prescriptions,
      pushedCount: pushSummary.pushed,
      status: conflictCount > 0 ? 'conflict' : 'synced',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.';
    await setOfflineSyncMetadata({ last_sync_error: message });
    const database = await getOfflineDatabase();

    return {
      conflictCount: database.queue.filter((entry) => entry.status === 'conflict').length,
      encounterCount: database.encounters.length,
      error: message,
      failedCount: database.queue.filter((entry) => entry.status === 'failed').length,
      labOrderCount: database.labOrders.length,
      lastSyncedAt: database.meta.last_successful_sync_at,
      patientCount: database.patients.length,
      pendingCount: database.queue.filter((entry) => entry.status !== 'conflict' && entry.status !== 'failed').length,
      prescriptionCount: database.prescriptions.length,
      pushedCount: 0,
      status: 'error',
    };
  }
}

export async function getOfflineSyncSnapshot() {
  const database = await getOfflineDatabase();
  return {
    conflictCount: database.queue.filter((entry) => entry.status === 'conflict').length,
    error: database.meta.last_sync_error,
    failedCount: database.queue.filter((entry) => entry.status === 'failed').length,
    isSeeded: Boolean(database.meta.last_seeded_at),
    lastSyncedAt: database.meta.last_successful_sync_at,
    pendingCount: database.queue.filter((entry) => entry.status !== 'conflict' && entry.status !== 'failed').length,
  };
}

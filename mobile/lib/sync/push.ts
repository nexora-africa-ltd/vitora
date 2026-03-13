import { toApiError } from '@/lib/api/client';
import { ancVisitsApi } from '@/lib/api/mch';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { screeningApi } from '@/lib/api/screening';
import { getPendingSyncQueue, replaceQueuedANCVisit, replaceQueuedEncounter, replaceQueuedPatient, replaceQueuedScreening, setOfflineSyncMetadata, updateLocalANCVisitSyncState, updateLocalEncounterSyncState, updateLocalPatientSyncState, updateLocalScreeningSyncState, updateQueueEntryState } from '@/lib/db';
import type { EncounterCreateData } from '@/lib/types/encounter';
import type { ANCVisitCreateData } from '@/lib/types/mch';
import type { PatientCreateData } from '@/lib/types/patient';
import type { CommunityScreeningCreateData } from '@/lib/types/screening';

import { getSyncFailureMessage, isConflictError, isOfflineSyncError } from './conflicts';

const MAX_SYNC_ATTEMPTS = 5;

type PushSummary = {
  conflicts: number;
  failed: number;
  pushed: number;
};

export async function pushPendingSyncQueue(): Promise<PushSummary> {
  const queue = await getPendingSyncQueue();
  let pushed = 0;
  let conflicts = 0;
  let failed = 0;
  const pushedAt = new Date().toISOString();

  for (const queuedEntry of queue) {
    const latestEntry = (await getPendingSyncQueue()).find((entry) => entry.id === queuedEntry.id);
    if (!latestEntry) {
      continue;
    }

    // Skip permanently failed entries
    if (latestEntry.status === 'failed') {
      continue;
    }

    // Check if max retries exceeded
    if (latestEntry.attempts >= MAX_SYNC_ATTEMPTS) {
      await updateQueueEntryState(latestEntry.id, {
        last_error: `Permanently failed after ${MAX_SYNC_ATTEMPTS} attempts.`,
        status: 'failed',
      });

      if (latestEntry.entity === 'patient') {
        await updateLocalPatientSyncState(latestEntry.local_id, {
          sync_error: `Permanently failed after ${MAX_SYNC_ATTEMPTS} attempts.`,
          sync_state: 'sync_error',
        });
      } else if (latestEntry.entity === 'encounter') {
        await updateLocalEncounterSyncState(latestEntry.local_id, {
          sync_error: `Permanently failed after ${MAX_SYNC_ATTEMPTS} attempts.`,
          sync_state: 'sync_error',
        });
      } else if (latestEntry.entity === 'anc_visit') {
        await updateLocalANCVisitSyncState(latestEntry.local_id, {
          sync_error: `Permanently failed after ${MAX_SYNC_ATTEMPTS} attempts.`,
          sync_state: 'sync_error',
        });
      } else {
        await updateLocalScreeningSyncState(latestEntry.local_id, {
          local_only: true,
          sync_error: `Permanently failed after ${MAX_SYNC_ATTEMPTS} attempts.`,
          sync_status: 'upload_failed',
        });
      }

      failed += 1;
      continue;
    }

    await updateQueueEntryState(latestEntry.id, {
      attempts: latestEntry.attempts + 1,
      last_error: null,
      status: 'syncing',
    });

    try {
      if (latestEntry.entity === 'patient') {
        const patient = await patientsApi.create(latestEntry.payload as PatientCreateData);
        await replaceQueuedPatient(latestEntry.local_id, patient, pushedAt);
      } else if (latestEntry.entity === 'encounter') {
        const payload = latestEntry.payload as EncounterCreateData;
        if (payload.patient < 0) {
          await updateQueueEntryState(latestEntry.id, {
            last_error: 'Waiting for the linked offline patient to sync first.',
            status: 'pending',
          });
          continue;
        }

        const encounter = await encountersApi.create(payload);
        await replaceQueuedEncounter(latestEntry.local_id, encounter, pushedAt);
      } else if (latestEntry.entity === 'anc_visit') {
        const ancVisit = await ancVisitsApi.create(latestEntry.payload as ANCVisitCreateData);
        await replaceQueuedANCVisit(latestEntry.local_id, ancVisit, pushedAt);
      } else {
        const payload = latestEntry.payload as CommunityScreeningCreateData;
        if (typeof payload.patient === 'number' && payload.patient < 0) {
          await updateQueueEntryState(latestEntry.id, {
            last_error: 'Waiting for the linked offline patient to sync first.',
            status: 'pending',
          });
          continue;
        }

        const screening = await screeningApi.uploadScreening(payload);
        await replaceQueuedScreening(latestEntry.local_id, screening);
      }

      pushed += 1;
    } catch (error) {
      const apiError = toApiError(error);
      const message = getSyncFailureMessage(apiError);

      if (latestEntry.entity === 'patient') {
        await updateLocalPatientSyncState(latestEntry.local_id, {
          sync_error: message,
          sync_state: isConflictError(apiError) ? 'conflict' : 'sync_error',
        });
      } else if (latestEntry.entity === 'encounter') {
        await updateLocalEncounterSyncState(latestEntry.local_id, {
          sync_error: message,
          sync_state: isConflictError(apiError) ? 'conflict' : 'sync_error',
        });
      } else if (latestEntry.entity === 'anc_visit') {
        await updateLocalANCVisitSyncState(latestEntry.local_id, {
          sync_error: message,
          sync_state: isConflictError(apiError) ? 'conflict' : 'sync_error',
        });
      } else {
        await updateLocalScreeningSyncState(latestEntry.local_id, {
          local_only: true,
          sync_error: message,
          sync_status: 'upload_failed',
        });
      }

      await updateQueueEntryState(latestEntry.id, {
        last_error: message,
        status: isConflictError(apiError) ? 'conflict' : 'pending',
      });

      if (isConflictError(apiError)) {
        conflicts += 1;
        continue;
      }

      if (isOfflineSyncError(apiError)) {
        break;
      }
    }
  }

  await setOfflineSyncMetadata({
    last_push_at: pushedAt,
  });

  return { conflicts, failed, pushed };
}
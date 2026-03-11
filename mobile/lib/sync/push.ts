import { toApiError } from '@/lib/api/client';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { getPendingSyncQueue, replaceQueuedEncounter, replaceQueuedPatient, setOfflineSyncMetadata, updateLocalEncounterSyncState, updateLocalPatientSyncState, updateQueueEntryState } from '@/lib/db';
import type { EncounterCreateData } from '@/lib/types/encounter';
import type { PatientCreateData } from '@/lib/types/patient';

import { getSyncFailureMessage, isConflictError, isOfflineSyncError } from './conflicts';

type PushSummary = {
  conflicts: number;
  pushed: number;
};

export async function pushPendingSyncQueue(): Promise<PushSummary> {
  const queue = await getPendingSyncQueue();
  let pushed = 0;
  let conflicts = 0;
  const pushedAt = new Date().toISOString();

  for (const queuedEntry of queue) {
    const latestEntry = (await getPendingSyncQueue()).find((entry) => entry.id === queuedEntry.id);
    if (!latestEntry) {
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
      } else {
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
      } else {
        await updateLocalEncounterSyncState(latestEntry.local_id, {
          sync_error: message,
          sync_state: isConflictError(apiError) ? 'conflict' : 'sync_error',
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

  return { conflicts, pushed };
}
import type { Diagnosis } from '@/lib/types/encounter';

import type { LocalDiagnosisRecord } from '../schema';

export function toLocalDiagnosisRecord(diagnosis: Diagnosis, syncedAt?: string): LocalDiagnosisRecord {
  return {
    id: diagnosis.id,
    encounter: diagnosis.encounter,
    notes: diagnosis.notes,
    created_at: diagnosis.created_at,
    updated_at: diagnosis.updated_at,
    local_only: false,
    sync_error: null,
    sync_state: 'synced',
    last_synced_at: syncedAt ?? diagnosis.updated_at,
  };
}

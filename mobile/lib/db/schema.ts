import type { County, SubCounty, Ward } from '@/lib/types/location';
import type { Encounter } from '@/lib/types/encounter';
import type { Patient, PatientCreateData } from '@/lib/types/patient';
import type { EncounterCreateData } from '@/lib/types/encounter';

export const OFFLINE_DB_STORAGE_KEY = 'vitora.mobile.offline-db.v1';

/**
 * Current schema version. Increment when the OfflineDatabase shape changes.
 * Each bump must have a corresponding entry in SCHEMA_MIGRATIONS.
 */
export const CURRENT_SCHEMA_VERSION = 2;

export type LocalSyncState = 'synced' | 'pending_create' | 'sync_error' | 'conflict';
export type SyncQueueStatus = 'pending' | 'syncing' | 'conflict' | 'failed';
export type SyncQueueEntity = 'patient' | 'encounter';

export type LocalRecordMetadata = {
  local_only: boolean;
  sync_error: string | null;
  sync_state: LocalSyncState;
  last_synced_at?: string | null;
};

export type LocalPatientRecord = Patient & LocalRecordMetadata;

export type LocalEncounterRecord = Encounter & LocalRecordMetadata;

export type LocalDiagnosisRecord = {
  id: number;
  encounter: number;
  notes: string;
  created_at: string;
  updated_at: string;
} & LocalRecordMetadata;

export type SyncQueueEntry = {
  id: string;
  attempts: number;
  created_at: string;
  entity: SyncQueueEntity;
  last_error: string | null;
  local_id: number;
  operation: 'create';
  payload: PatientCreateData | EncounterCreateData;
  status: SyncQueueStatus;
};

export type OfflineDatabaseMeta = {
  id_remaps: {
    encounters: Record<string, number>;
    patients: Record<string, number>;
  };
  last_pull_at: string | null;
  last_push_at: string | null;
  last_seeded_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_error: string | null;
  schema_version: number;
};

export type OfflineDatabase = {
  counties: County[];
  diagnoses: LocalDiagnosisRecord[];
  encounters: LocalEncounterRecord[];
  meta: OfflineDatabaseMeta;
  patients: LocalPatientRecord[];
  queue: SyncQueueEntry[];
  subCounties: SubCounty[];
  wards: Ward[];
};

export function createEmptyOfflineDatabase(): OfflineDatabase {
  return {
    counties: [],
    diagnoses: [],
    encounters: [],
    meta: {
      id_remaps: {
        encounters: {},
        patients: {},
      },
      last_pull_at: null,
      last_push_at: null,
      last_seeded_at: null,
      last_successful_sync_at: null,
      last_sync_error: null,
      schema_version: CURRENT_SCHEMA_VERSION,
    },
    patients: [],
    queue: [],
    subCounties: [],
    wards: [],
  };
}

/**
 * Each migration receives the raw parsed object and mutates it in place.
 * Keyed by the target version (i.e., migration 2 upgrades from v1 → v2).
 */
export const SCHEMA_MIGRATIONS: Record<number, (db: Record<string, unknown>) => void> = {
  2: (db) => {
    // v1 → v2: add schema_version, add 'failed' queue status support
    const meta = (db.meta ?? {}) as Record<string, unknown>;
    meta.schema_version = 2;

    // Ensure queue entries with excessive attempts are marked as failed
    const queue = (db.queue ?? []) as Array<Record<string, unknown>>;
    for (const entry of queue) {
      if (typeof entry.attempts === 'number' && entry.attempts >= 5 && entry.status !== 'conflict') {
        entry.status = 'failed';
      }
    }
  },
};
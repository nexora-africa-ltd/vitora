import type { County, SubCounty, Ward } from '@/lib/types/location';
import type { Encounter } from '@/lib/types/encounter';
import type { Patient, PatientCreateData } from '@/lib/types/patient';
import type { EncounterCreateData } from '@/lib/types/encounter';

export const OFFLINE_DB_STORAGE_KEY = 'vitora.mobile.offline-db.v1';

export type LocalSyncState = 'synced' | 'pending_create' | 'sync_error' | 'conflict';
export type SyncQueueStatus = 'pending' | 'syncing' | 'conflict';
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
    },
    patients: [],
    queue: [],
    subCounties: [],
    wards: [],
  };
}
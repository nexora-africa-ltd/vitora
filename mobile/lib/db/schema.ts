import type { County, SubCounty, Ward } from '@/lib/types/location';
import type { Encounter, EncounterCreateData } from '@/lib/types/encounter';
import type { Admission, InpatientWard } from '@/lib/types/inpatient';
import type { LabOrder } from '@/lib/types/laboratory';
import type { ANCVisit, ANCVisitCreateData, ImmunizationRecord, MCHRegistration } from '@/lib/types/mch';
import type { Patient, PatientCreateData } from '@/lib/types/patient';
import type { Prescription } from '@/lib/types/pharmacy';
import type { CommunityScreening } from '@/lib/types/screening';
import type { CommunityScreeningCreateData } from '@/lib/types/screening';

export const OFFLINE_DB_STORAGE_KEY = 'vitora.mobile.offline-db.v1';

/**
 * Current schema version. Increment when the OfflineDatabase shape changes.
 * Each bump must have a corresponding entry in SCHEMA_MIGRATIONS.
 */
export const CURRENT_SCHEMA_VERSION = 5;

export type LocalSyncState = 'synced' | 'pending_create' | 'sync_error' | 'conflict';
export type SyncQueueStatus = 'pending' | 'syncing' | 'conflict' | 'failed';
export type SyncQueueEntity = 'patient' | 'encounter' | 'lab_order' | 'prescription' | 'anc_visit' | 'screening';

export type LocalRecordMetadata = {
  local_only: boolean;
  sync_error: string | null;
  sync_state: LocalSyncState;
  last_synced_at?: string | null;
};

export type LocalPatientRecord = Patient & LocalRecordMetadata;

export type LocalEncounterRecord = Encounter & LocalRecordMetadata;

export type LocalLabOrderRecord = LabOrder & LocalRecordMetadata;

export type LocalPrescriptionRecord = Prescription & LocalRecordMetadata;

export type LocalMCHRegistrationRecord = MCHRegistration;

export type LocalANCVisitRecord = ANCVisit & LocalRecordMetadata;

export type LocalImmunizationRecord = ImmunizationRecord & LocalRecordMetadata;

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
  payload: PatientCreateData | EncounterCreateData | ANCVisitCreateData | CommunityScreeningCreateData;
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
  admissions: Admission[];
  counties: County[];
  diagnoses: LocalDiagnosisRecord[];
  encounters: LocalEncounterRecord[];
  ancVisits: LocalANCVisitRecord[];
  inpatientWards: InpatientWard[];
  immunizationRecords: LocalImmunizationRecord[];
  labOrders: LocalLabOrderRecord[];
  mchRegistrations: LocalMCHRegistrationRecord[];
  meta: OfflineDatabaseMeta;
  patients: LocalPatientRecord[];
  prescriptions: LocalPrescriptionRecord[];
  queue: SyncQueueEntry[];
  screenings: CommunityScreening[];
  subCounties: SubCounty[];
  wards: Ward[];
};

export function createEmptyOfflineDatabase(): OfflineDatabase {
  return {
    admissions: [],
    ancVisits: [],
    counties: [],
    diagnoses: [],
    encounters: [],
    immunizationRecords: [],
    inpatientWards: [],
    labOrders: [],
    mchRegistrations: [],
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
    prescriptions: [],
    queue: [],
    screenings: [],
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
  3: (db) => {
    // v2 → v3: add labOrders and prescriptions arrays for offline clinical data
    const meta = (db.meta ?? {}) as Record<string, unknown>;
    meta.schema_version = 3;

    if (!Array.isArray(db.labOrders)) {
      db.labOrders = [];
    }

    if (!Array.isArray(db.prescriptions)) {
      db.prescriptions = [];
    }
  },
  4: (db) => {
    // v3 → v4: add inpatient wards and admissions arrays for offline inpatient data
    const meta = (db.meta ?? {}) as Record<string, unknown>;
    meta.schema_version = 4;

    if (!Array.isArray(db.inpatientWards)) {
      db.inpatientWards = [];
    }

    if (!Array.isArray(db.admissions)) {
      db.admissions = [];
    }
  },
  5: (db) => {
    const meta = (db.meta ?? {}) as Record<string, unknown>;
    meta.schema_version = 5;

    if (!Array.isArray(db.mchRegistrations)) {
      db.mchRegistrations = [];
    }

    if (!Array.isArray(db.ancVisits)) {
      db.ancVisits = [];
    }

    if (!Array.isArray(db.immunizationRecords)) {
      db.immunizationRecords = [];
    }

    if (!Array.isArray(db.screenings)) {
      db.screenings = [];
    }
  },
};

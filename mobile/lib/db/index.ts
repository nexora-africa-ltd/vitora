import { queryClient } from '@/lib/query/client';
import type { EncounterCreateData } from '@/lib/types/encounter';
import type { Admission, InpatientWard } from '@/lib/types/inpatient';
import type { LabOrder } from '@/lib/types/laboratory';
import type { County, SubCounty, Ward } from '@/lib/types/location';
import type { ANCVisitCreateData, MCHRegistrationListItem } from '@/lib/types/mch';
import type { PatientCreateData } from '@/lib/types/patient';
import type { Prescription } from '@/lib/types/pharmacy';
import type { CommunityScreening, CommunityScreeningCreateData } from '@/lib/types/screening';
import type { PatientSHAEligibility } from '@/lib/types/sha';

import { buildOfflineEncounterRecord, matchesEncounterSearch, sortEncounters, toLocalEncounterRecord } from './models/encounter';
import { sortLabOrders, toLocalLabOrderRecord } from './models/lab-order';
import { buildOfflineANCVisitRecord, sortANCVisits, sortImmunizationRecords, sortMCHRegistrations, toLocalANCVisitRecord, toLocalImmunizationRecord, toLocalMCHRegistrationRecord } from './models/mch';
import { buildOfflinePatientRecord, matchesPatientSearch, sortPatients, toLocalPatientRecord } from './models/patient';
import { sortPrescriptions, toLocalPrescriptionRecord } from './models/prescription';
import { buildOfflineScreeningRecord, sortScreenings, toLocalScreeningRecord } from './models/screening';
import { createEmptyOfflineDatabase, CURRENT_SCHEMA_VERSION, SCHEMA_MIGRATIONS, type LocalANCVisitRecord, type LocalEncounterRecord, type LocalImmunizationRecord, type LocalLabOrderRecord, type LocalMCHRegistrationRecord, type LocalPatientRecord, type LocalPrescriptionRecord, type OfflineDatabase, type SyncQueueEntry } from './schema';
import { readOfflineDatabasePayload, removeOfflineDatabasePayload, writeOfflineDatabasePayload } from './storage';

type PatientListOptions = {
  limit?: number;
  search?: string;
};

type EncounterListOptions = {
  limit?: number;
  patientId?: number;
  search?: string;
};

const LOCAL_QUERY_KEYS = [
  ['dashboard-summary'],
  ['local-anc-visits'],
  ['local-immunizations'],
  ['local-lab-order'],
  ['local-lab-orders'],
  ['local-mch-registration'],
  ['local-mch-registrations'],
  ['local-patient'],
  ['local-patients'],
  ['local-encounter'],
  ['local-encounters'],
  ['local-prescription'],
  ['local-prescriptions'],
  ['local-screenings'],
  ['offline-reference-data'],
  ['sync-status'],
] as const;

function createLocalId(): number {
  return -Math.floor(Date.now() + Math.random() * 1000);
}

function createQueueEntryId(): string {
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function invalidateOfflineQueries() {
  await Promise.all(
    LOCAL_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}

function normalizeDatabase(payload: string | null): OfflineDatabase {
  if (!payload) {
    return createEmptyOfflineDatabase();
  }

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const storedVersion = (parsed.meta as Record<string, unknown> | undefined)?.schema_version;
    const version = typeof storedVersion === 'number' ? storedVersion : 1;

    // Run migrations sequentially from stored version to current
    for (let v = version + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const migration = SCHEMA_MIGRATIONS[v];
      if (migration) {
        migration(parsed);
      }
    }

    const next = createEmptyOfflineDatabase();
    const typedParsed = parsed as Partial<OfflineDatabase>;
    return {
      ...next,
      ...typedParsed,
      admissions: typedParsed.admissions ?? next.admissions,
      ancVisits: typedParsed.ancVisits ?? next.ancVisits,
      counties: typedParsed.counties ?? next.counties,
      diagnoses: typedParsed.diagnoses ?? next.diagnoses,
      encounters: typedParsed.encounters ?? next.encounters,
      immunizationRecords: typedParsed.immunizationRecords ?? next.immunizationRecords,
      inpatientWards: typedParsed.inpatientWards ?? next.inpatientWards,
      labOrders: typedParsed.labOrders ?? next.labOrders,
      mchRegistrations: typedParsed.mchRegistrations ?? next.mchRegistrations,
      patients: typedParsed.patients ?? next.patients,
      prescriptions: typedParsed.prescriptions ?? next.prescriptions,
      queue: typedParsed.queue ?? next.queue,
      screenings: typedParsed.screenings ?? next.screenings,
      subCounties: typedParsed.subCounties ?? next.subCounties,
      wards: typedParsed.wards ?? next.wards,
      meta: {
        ...next.meta,
        ...typedParsed.meta,
        schema_version: CURRENT_SCHEMA_VERSION,
        id_remaps: {
          encounters: typedParsed.meta?.id_remaps?.encounters ?? next.meta.id_remaps.encounters,
          patients: typedParsed.meta?.id_remaps?.patients ?? next.meta.id_remaps.patients,
        },
      },
    };
  } catch {
    return createEmptyOfflineDatabase();
  }
}

export async function getOfflineDatabase(): Promise<OfflineDatabase> {
  const payload = await readOfflineDatabasePayload();
  return normalizeDatabase(payload);
}

async function persistOfflineDatabase(database: OfflineDatabase): Promise<OfflineDatabase> {
  await writeOfflineDatabasePayload(JSON.stringify(database));
  await invalidateOfflineQueries();
  return database;
}

export async function updateOfflineDatabase(mutator: (database: OfflineDatabase) => void): Promise<OfflineDatabase> {
  const database = await getOfflineDatabase();
  mutator(database);
  return persistOfflineDatabase(database);
}

export async function clearOfflineDatabase(): Promise<void> {
  await removeOfflineDatabasePayload();
  await invalidateOfflineQueries();
}

export async function listLocalPatients(options: PatientListOptions = {}): Promise<{ count: number; records: LocalPatientRecord[] }> {
  const database = await getOfflineDatabase();
  const filtered = database.patients.filter((patient) => matchesPatientSearch(patient, options.search ?? ''));
  const records = typeof options.limit === 'number' ? filtered.slice(0, options.limit) : filtered;
  return { count: filtered.length, records };
}

export async function getLocalPatient(id: number): Promise<LocalPatientRecord | null> {
  const database = await getOfflineDatabase();
  const direct = database.patients.find((patient) => patient.id === id);
  if (direct) {
    return direct;
  }

  const remappedId = database.meta.id_remaps.patients[String(id)];
  if (typeof remappedId === 'number') {
    return database.patients.find((patient) => patient.id === remappedId) ?? null;
  }

  return null;
}

export async function storePatientEligibility(patientId: number, eligibility: PatientSHAEligibility): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.patients = database.patients.map((patient) => {
      if (patient.id !== patientId) {
        return patient;
      }

      return {
        ...patient,
        sha_coverage_status: eligibility.coverage_status,
        sha_checked_at: eligibility.checked_at,
        sha_eligible_until: eligibility.eligible_until ?? null,
        sha_benefit_balance: eligibility.benefit_balance ?? null,
        sha_ineligibility_reason: eligibility.ineligibility_reason ?? null,
        sha_result: eligibility.result,
        sha_number: eligibility.sha_number ?? patient.sha_number ?? null,
      };
    });
  });
}

export async function listLocalEncounters(options: EncounterListOptions = {}): Promise<{ count: number; records: LocalEncounterRecord[] }> {
  const database = await getOfflineDatabase();
  const resolvedPatientId = typeof options.patientId === 'number'
    ? database.meta.id_remaps.patients[String(options.patientId)] ?? options.patientId
    : undefined;

  const filtered = database.encounters.filter((encounter) => {
    if (typeof resolvedPatientId === 'number' && encounter.patient !== resolvedPatientId) {
      return false;
    }

    if (!options.search) {
      return true;
    }

    return matchesEncounterSearch(encounter, options.search);
  });

  const records = typeof options.limit === 'number' ? filtered.slice(0, options.limit) : filtered;
  return { count: filtered.length, records };
}

export async function getLocalEncounter(id: number): Promise<LocalEncounterRecord | null> {
  const database = await getOfflineDatabase();
  const direct = database.encounters.find((encounter) => encounter.id === id);
  if (direct) {
    return direct;
  }

  const remappedId = database.meta.id_remaps.encounters[String(id)];
  if (typeof remappedId === 'number') {
    return database.encounters.find((encounter) => encounter.id === remappedId) ?? null;
  }

  return null;
}

export async function getOfflineCounties(): Promise<County[]> {
  const database = await getOfflineDatabase();
  return database.counties;
}

export async function getOfflineSubCounties(countyId: number): Promise<SubCounty[]> {
  const database = await getOfflineDatabase();
  return database.subCounties.filter((subCounty) => subCounty.county === countyId);
}

export async function getOfflineWards(subCountyId: number): Promise<Ward[]> {
  const database = await getOfflineDatabase();
  return database.wards.filter((ward) => ward.sub_county === subCountyId);
}

export async function upsertReferenceData(input: { counties?: County[]; subCounties?: SubCounty[]; wards?: Ward[] }): Promise<void> {
  await updateOfflineDatabase((database) => {
    if (input.counties) {
      const countyMap = new Map(database.counties.map((county) => [county.id, county]));
      for (const county of input.counties) {
        countyMap.set(county.id, county);
      }
      database.counties = Array.from(countyMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    }

    if (input.subCounties) {
      const subCountyMap = new Map(database.subCounties.map((subCounty) => [subCounty.id, subCounty]));
      for (const subCounty of input.subCounties) {
        subCountyMap.set(subCounty.id, subCounty);
      }
      database.subCounties = Array.from(subCountyMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    }

    if (input.wards) {
      const wardMap = new Map(database.wards.map((ward) => [ward.id, ward]));
      for (const ward of input.wards) {
        wardMap.set(ward.id, ward);
      }
      database.wards = Array.from(wardMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    }
  });
}

export async function upsertPatients(records: LocalPatientRecord[] | Parameters<typeof toLocalPatientRecord>[0][], syncedAt?: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const patientMap = new Map(database.patients.map((patient) => [patient.id, patient]));

    for (const record of records) {
      const nextRecord = 'sync_state' in record ? record : toLocalPatientRecord(record, syncedAt);
      patientMap.set(nextRecord.id, nextRecord);
    }

    database.patients = sortPatients(Array.from(patientMap.values()));
  });
}

export async function upsertEncounters(records: LocalEncounterRecord[] | Parameters<typeof toLocalEncounterRecord>[0][], syncedAt?: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const encounterMap = new Map(database.encounters.map((encounter) => [encounter.id, encounter]));

    for (const record of records) {
      const nextRecord = 'sync_state' in record ? record : toLocalEncounterRecord(record, syncedAt);
      encounterMap.set(nextRecord.id, nextRecord);
    }

    database.encounters = sortEncounters(Array.from(encounterMap.values()));
  });
}

export async function upsertMCHRegistrations(records: LocalMCHRegistrationRecord[] | MCHRegistrationListItem[]): Promise<void> {
  await updateOfflineDatabase((database) => {
    const registrationMap = new Map(database.mchRegistrations.map((registration) => [registration.id, registration]));

    for (const record of records) {
      const nextRecord = 'mother_name' in record ? toLocalMCHRegistrationRecord(record) : record;
      registrationMap.set(nextRecord.id, nextRecord);
    }

    database.mchRegistrations = sortMCHRegistrations(Array.from(registrationMap.values()));
  });
}

export async function upsertANCVisits(records: LocalANCVisitRecord[] | Array<Parameters<typeof toLocalANCVisitRecord>[0]>, syncedAt?: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const visitMap = new Map(database.ancVisits.map((visit) => [visit.id, visit]));

    for (const record of records) {
      const nextRecord = 'sync_state' in record ? record : toLocalANCVisitRecord(record, syncedAt);
      visitMap.set(nextRecord.id, nextRecord);
    }

    database.ancVisits = sortANCVisits(Array.from(visitMap.values()));
  });
}

export async function upsertImmunizationRecords(records: LocalImmunizationRecord[] | Array<Parameters<typeof toLocalImmunizationRecord>[0]>, syncedAt?: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const recordMap = new Map(database.immunizationRecords.map((record) => [record.id, record]));

    for (const record of records) {
      const nextRecord = 'sync_state' in record ? record : toLocalImmunizationRecord(record, syncedAt);
      recordMap.set(nextRecord.id, nextRecord);
    }

    database.immunizationRecords = sortImmunizationRecords(Array.from(recordMap.values()));
  });
}

export async function upsertLabOrders(records: LocalLabOrderRecord[] | Parameters<typeof toLocalLabOrderRecord>[0][], syncedAt?: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const orderMap = new Map(database.labOrders.map((order) => [order.id, order]));

    for (const record of records) {
      const nextRecord = 'sync_state' in record ? record : toLocalLabOrderRecord(record, syncedAt);
      orderMap.set(nextRecord.id, nextRecord);
    }

    database.labOrders = sortLabOrders(Array.from(orderMap.values()));
  });
}

export async function upsertPrescriptions(records: LocalPrescriptionRecord[] | Parameters<typeof toLocalPrescriptionRecord>[0][], syncedAt?: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const prescriptionMap = new Map(database.prescriptions.map((rx) => [rx.id, rx]));

    for (const record of records) {
      const nextRecord = 'sync_state' in record ? record : toLocalPrescriptionRecord(record, syncedAt);
      prescriptionMap.set(nextRecord.id, nextRecord);
    }

    database.prescriptions = sortPrescriptions(Array.from(prescriptionMap.values()));
  });
}

export async function listLocalLabOrders(options: { patientId?: number; limit?: number } = {}): Promise<{ count: number; records: LocalLabOrderRecord[] }> {
  const database = await getOfflineDatabase();
  let records = database.labOrders;

  if (options.patientId) {
    records = records.filter((order) => order.patient === options.patientId);
  }

  const count = records.length;
  if (options.limit) {
    records = records.slice(0, options.limit);
  }

  return { count, records };
}

export async function listLocalPrescriptions(options: { patientId?: number; limit?: number } = {}): Promise<{ count: number; records: LocalPrescriptionRecord[] }> {
  const database = await getOfflineDatabase();
  let records = database.prescriptions;

  if (options.patientId) {
    records = records.filter((rx) => rx.patient === options.patientId);
  }

  const count = records.length;
  if (options.limit) {
    records = records.slice(0, options.limit);
  }

  return { count, records };
}

export async function listLocalMCHRegistrations(options: { search?: string; highRiskOnly?: boolean } = {}): Promise<{ count: number; records: LocalMCHRegistrationRecord[] }> {
  const database = await getOfflineDatabase();
  const normalizedSearch = options.search?.trim().toLowerCase() ?? '';
  let records = database.mchRegistrations.filter((registration) => {
    if (options.highRiskOnly && !registration.is_high_risk) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [registration.mch_number, registration.mother_name, registration.mother_mrn]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });

  return { count: records.length, records };
}

export async function getLocalMCHRegistration(id: number): Promise<LocalMCHRegistrationRecord | null> {
  const database = await getOfflineDatabase();
  return database.mchRegistrations.find((registration) => registration.id === id) ?? null;
}

export async function listLocalANCVisits(options: { registrationId?: number } = {}): Promise<{ count: number; records: LocalANCVisitRecord[] }> {
  const database = await getOfflineDatabase();
  let records = database.ancVisits;
  if (options.registrationId) {
    records = records.filter((visit) => visit.registration === options.registrationId);
  }

  return { count: records.length, records };
}

export async function listLocalImmunizations(options: { patientId?: number } = {}): Promise<{ count: number; records: LocalImmunizationRecord[] }> {
  const database = await getOfflineDatabase();
  let records = database.immunizationRecords;
  if (options.patientId) {
    records = records.filter((record) => record.patient === options.patientId);
  }

  return { count: records.length, records };
}

export async function listLocalScreenings(options: { patient?: number } = {}): Promise<{ count: number; records: CommunityScreening[] }> {
  const database = await getOfflineDatabase();
  let records = database.screenings;
  if (typeof options.patient === 'number') {
    records = records.filter((record) => record.patient === options.patient);
  }

  return { count: records.length, records };
}

export async function upsertScreenings(records: CommunityScreening[]): Promise<void> {
  await updateOfflineDatabase((database) => {
    const screeningMap = new Map(database.screenings.map((record) => [record.id, record]));
    for (const record of records) {
      screeningMap.set(record.id, toLocalScreeningRecord(record));
    }
    database.screenings = sortScreenings(Array.from(screeningMap.values()));
  });
}

export async function queueOfflinePatientCreate(data: PatientCreateData): Promise<LocalPatientRecord> {
  const database = await getOfflineDatabase();
  const localId = createLocalId();
  const queuedPatient = buildOfflinePatientRecord(localId, data, {
    county: database.counties.find((county) => county.id === data.county),
    subCounty: database.subCounties.find((subCounty) => subCounty.id === data.sub_county),
    ward: typeof data.ward === 'number' ? database.wards.find((ward) => ward.id === data.ward) : null,
  });

  database.patients = sortPatients([queuedPatient, ...database.patients]);
  database.queue.push({
    id: createQueueEntryId(),
    attempts: 0,
    created_at: queuedPatient.created_at,
    entity: 'patient',
    last_error: null,
    local_id: localId,
    operation: 'create',
    payload: data,
    status: 'pending',
  });

  await persistOfflineDatabase(database);
  return queuedPatient;
}

export async function queueOfflineEncounterCreate(data: EncounterCreateData): Promise<LocalEncounterRecord> {
  const database = await getOfflineDatabase();
  const localId = createLocalId();
  const patient = database.patients.find((record) => record.id === data.patient) ?? null;
  const queuedEncounter = buildOfflineEncounterRecord(localId, data, patient);

  database.encounters = sortEncounters([queuedEncounter, ...database.encounters]);
  database.queue.push({
    id: createQueueEntryId(),
    attempts: 0,
    created_at: queuedEncounter.created_at,
    entity: 'encounter',
    last_error: null,
    local_id: localId,
    operation: 'create',
    payload: data,
    status: 'pending',
  });

  await persistOfflineDatabase(database);
  return queuedEncounter;
}

export async function queueOfflineANCVisitCreate(data: ANCVisitCreateData): Promise<LocalANCVisitRecord> {
  const database = await getOfflineDatabase();
  const localId = createLocalId();
  const registration = database.mchRegistrations.find((record) => record.id === data.registration) ?? null;
  const queuedVisit = buildOfflineANCVisitRecord(localId, data, registration);

  database.ancVisits = sortANCVisits([queuedVisit, ...database.ancVisits]);
  database.queue.push({
    id: createQueueEntryId(),
    attempts: 0,
    created_at: queuedVisit.created_at,
    entity: 'anc_visit',
    last_error: null,
    local_id: localId,
    operation: 'create',
    payload: data,
    status: 'pending',
  });

  await persistOfflineDatabase(database);
  return queuedVisit;
}

export async function queueOfflineScreeningCreate(data: CommunityScreeningCreateData): Promise<CommunityScreening> {
  const database = await getOfflineDatabase();
  const localId = createLocalId();
  const screening = buildOfflineScreeningRecord(localId, data);

  database.screenings = sortScreenings([screening, ...database.screenings]);
  database.queue.push({
    id: createQueueEntryId(),
    attempts: 0,
    created_at: screening.created_at,
    entity: 'screening',
    last_error: null,
    local_id: localId,
    operation: 'create',
    payload: data,
    status: 'pending',
  });

  await persistOfflineDatabase(database);
  return screening;
}

export async function createLocalScreening(data: CommunityScreeningCreateData): Promise<CommunityScreening> {
  return queueOfflineScreeningCreate(data);
}

export async function getPendingSyncQueue(): Promise<SyncQueueEntry[]> {
  const database = await getOfflineDatabase();
  return [...database.queue]
    .filter((entry) => entry.status !== 'failed')
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
}

export async function replaceQueuedPatient(localId: number, nextPatient: Parameters<typeof toLocalPatientRecord>[0], syncedAt: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const resolvedPatient = toLocalPatientRecord(nextPatient, syncedAt);
    database.meta.id_remaps.patients[String(localId)] = resolvedPatient.id;
    database.patients = sortPatients([
      resolvedPatient,
      ...database.patients.filter((patient) => patient.id !== localId && patient.id !== resolvedPatient.id),
    ]);
    database.encounters = sortEncounters(
      database.encounters.map((encounter) => {
        if (encounter.patient !== localId) {
          return encounter;
        }

        return {
          ...encounter,
          patient: resolvedPatient.id,
          patient_id: resolvedPatient.id,
          patient_name: resolvedPatient.full_name ?? encounter.patient_name,
          patient_mrn: resolvedPatient.mrn,
          patient_gender: resolvedPatient.gender,
          patient_date_of_birth: resolvedPatient.date_of_birth,
          patient_age: resolvedPatient.age,
          updated_at: syncedAt,
        };
      })
    );
    database.screenings = sortScreenings(
      database.screenings.map((screening) => {
        if (screening.patient !== localId) {
          return screening;
        }

        return {
          ...screening,
          patient: resolvedPatient.id,
          patient_name: resolvedPatient.full_name ?? screening.patient_name,
          patient_mrn: resolvedPatient.mrn,
          updated_at: syncedAt,
        };
      })
    );
    database.queue = database.queue
      .filter((entry) => !(entry.entity === 'patient' && entry.local_id === localId))
      .map((entry) => {
        if (entry.entity !== 'encounter' && entry.entity !== 'screening') {
          return entry;
        }

        if (entry.entity === 'encounter') {
          const payload = entry.payload as EncounterCreateData;
          if (payload.patient !== localId) {
            return entry;
          }

          return {
            ...entry,
            payload: {
              ...payload,
              patient: resolvedPatient.id,
            },
          };
        }

        const payload = entry.payload as CommunityScreeningCreateData;
        if (payload.patient !== localId) {
          return entry;
        }

        return {
          ...entry,
          payload: {
            ...payload,
            patient: resolvedPatient.id,
            patient_mrn: resolvedPatient.mrn,
            patient_name: resolvedPatient.full_name ?? payload.patient_name ?? null,
          },
        };
      });
  });
}

export async function replaceQueuedEncounter(localId: number, nextEncounter: Parameters<typeof toLocalEncounterRecord>[0], syncedAt: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const resolvedEncounter = toLocalEncounterRecord(nextEncounter, syncedAt);
    database.meta.id_remaps.encounters[String(localId)] = resolvedEncounter.id;
    database.encounters = sortEncounters([
      resolvedEncounter,
      ...database.encounters.filter((encounter) => encounter.id !== localId && encounter.id !== resolvedEncounter.id),
    ]);
    database.queue = database.queue.filter((entry) => !(entry.entity === 'encounter' && entry.local_id === localId));
  });
}

export async function replaceQueuedANCVisit(localId: number, nextVisit: Parameters<typeof toLocalANCVisitRecord>[0], syncedAt: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const resolvedVisit = toLocalANCVisitRecord(nextVisit, syncedAt);
    database.ancVisits = sortANCVisits([
      resolvedVisit,
      ...database.ancVisits.filter((visit) => visit.id !== localId && visit.id !== resolvedVisit.id),
    ]);
    database.queue = database.queue.filter((entry) => !(entry.entity === 'anc_visit' && entry.local_id === localId));
  });
}

export async function replaceQueuedScreening(localId: number, nextScreening: CommunityScreening): Promise<void> {
  await updateOfflineDatabase((database) => {
    const resolvedScreening = toLocalScreeningRecord(nextScreening);
    database.screenings = sortScreenings([
      resolvedScreening,
      ...database.screenings.filter((screening) => screening.id !== localId && screening.id !== resolvedScreening.id),
    ]);
    database.queue = database.queue.filter((entry) => !(entry.entity === 'screening' && entry.local_id === localId));
  });
}

export async function updateQueueEntryState(entryId: string, updates: Partial<Pick<SyncQueueEntry, 'attempts' | 'last_error' | 'status'>>): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.queue = database.queue.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }

      return {
        ...entry,
        ...updates,
      };
    });
  });
}

export async function updateLocalPatientSyncState(localId: number, input: Partial<Pick<LocalPatientRecord, 'sync_error' | 'sync_state'>>): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.patients = database.patients.map((patient) => {
      if (patient.id !== localId) {
        return patient;
      }

      return {
        ...patient,
        ...input,
      };
    });
  });
}

export async function updateLocalEncounterSyncState(localId: number, input: Partial<Pick<LocalEncounterRecord, 'sync_error' | 'sync_state'>>): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.encounters = database.encounters.map((encounter) => {
      if (encounter.id !== localId) {
        return encounter;
      }

      return {
        ...encounter,
        ...input,
      };
    });
  });
}

export async function updateLocalANCVisitSyncState(localId: number, input: Partial<Pick<LocalANCVisitRecord, 'sync_error' | 'sync_state'>>): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.ancVisits = database.ancVisits.map((visit) => {
      if (visit.id !== localId) {
        return visit;
      }

      return {
        ...visit,
        ...input,
      };
    });
  });
}

export async function updateLocalScreeningSyncState(
  localId: number,
  input: Partial<Pick<CommunityScreening, 'local_only' | 'sync_error' | 'sync_status'>>
): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.screenings = database.screenings.map((screening) => {
      if (screening.id !== localId) {
        return screening;
      }

      return {
        ...screening,
        ...input,
      };
    });
  });
}

export async function setOfflineSyncMetadata(input: Partial<OfflineDatabase['meta']>): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.meta = {
      ...database.meta,
      ...input,
      id_remaps: {
        encounters: input.id_remaps?.encounters ?? database.meta.id_remaps.encounters,
        patients: input.id_remaps?.patients ?? database.meta.id_remaps.patients,
      },
    };
  });
}

export async function getConflictAndFailedEntries(): Promise<SyncQueueEntry[]> {
  const database = await getOfflineDatabase();
  return database.queue.filter((entry) => entry.status === 'conflict' || entry.status === 'failed');
}

export async function discardQueueEntry(entryId: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    const entry = database.queue.find((e) => e.id === entryId);
    if (!entry) return;

    // Remove the local record that was never synced
    if (entry.entity === 'patient') {
      database.patients = database.patients.filter((p) => p.id !== entry.local_id);
    } else if (entry.entity === 'encounter') {
      database.encounters = database.encounters.filter((e) => e.id !== entry.local_id);
    } else if (entry.entity === 'anc_visit') {
      database.ancVisits = database.ancVisits.filter((visit) => visit.id !== entry.local_id);
    } else if (entry.entity === 'screening') {
      database.screenings = database.screenings.filter((screening) => screening.id !== entry.local_id);
    }

    database.queue = database.queue.filter((e) => e.id !== entryId);
  });
}

export async function retryQueueEntry(entryId: string): Promise<void> {
  await updateOfflineDatabase((database) => {
    database.queue = database.queue.map((entry) => {
      if (entry.id !== entryId) return entry;
      return { ...entry, attempts: 0, last_error: null, status: 'pending' as const };
    });

    // Also reset the local record sync state
    const entry = database.queue.find((e) => e.id === entryId);
    if (entry?.entity === 'patient') {
      database.patients = database.patients.map((p) =>
        p.id === entry.local_id ? { ...p, sync_error: null, sync_state: 'pending_create' as const } : p
      );
    } else if (entry?.entity === 'encounter') {
      database.encounters = database.encounters.map((e) =>
        e.id === entry.local_id ? { ...e, sync_error: null, sync_state: 'pending_create' as const } : e
      );
    } else if (entry?.entity === 'anc_visit') {
      database.ancVisits = database.ancVisits.map((visit) =>
        visit.id === entry.local_id ? { ...visit, sync_error: null, sync_state: 'pending_create' as const } : visit
      );
    } else if (entry?.entity === 'screening') {
      database.screenings = database.screenings.map((screening) =>
        screening.id === entry.local_id ? { ...screening, local_only: true, sync_error: null, sync_status: 'pending_upload' as const } : screening
      );
    }
  });
}

// ── Inpatient offline cache ──

export async function upsertInpatientWards(records: InpatientWard[]): Promise<void> {
  await updateOfflineDatabase((database) => {
    const wardMap = new Map(database.inpatientWards.map((w) => [w.id, w]));
    for (const record of records) {
      wardMap.set(record.id, record);
    }
    database.inpatientWards = Array.from(wardMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function upsertAdmissions(records: Admission[]): Promise<void> {
  await updateOfflineDatabase((database) => {
    const admissionMap = new Map(database.admissions.map((a) => [a.id, a]));
    for (const record of records) {
      admissionMap.set(record.id, record);
    }
    database.admissions = Array.from(admissionMap.values()).sort(
      (a, b) => (b.admission_date ?? '').localeCompare(a.admission_date ?? '')
    );
  });
}

export async function listLocalInpatientWards(): Promise<InpatientWard[]> {
  const database = await getOfflineDatabase();
  return database.inpatientWards;
}

export async function listLocalAdmissions(options: { status?: string; limit?: number } = {}): Promise<{ count: number; records: Admission[] }> {
  const database = await getOfflineDatabase();
  let records = database.admissions;

  if (options.status) {
    records = records.filter((a) => a.admission_status === options.status);
  }

  const count = records.length;
  if (options.limit) {
    records = records.slice(0, options.limit);
  }

  return { count, records };
}
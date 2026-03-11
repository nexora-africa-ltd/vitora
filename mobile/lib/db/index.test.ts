import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearOfflineDatabase, discardQueueEntry, getConflictAndFailedEntries, getLocalEncounter, getLocalPatient, getOfflineDatabase, listLocalEncounters, listLocalLabOrders, listLocalPatients, listLocalPrescriptions, queueOfflineEncounterCreate, queueOfflinePatientCreate, replaceQueuedPatient, retryQueueEntry, updateQueueEntryState, upsertEncounters, upsertLabOrders, upsertPatients, upsertPrescriptions, upsertReferenceData } from '@/lib/db';
import { CURRENT_SCHEMA_VERSION, OFFLINE_DB_STORAGE_KEY } from '@/lib/db/schema';

describe('offline database', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearOfflineDatabase();
  });

  it('stores and searches local patients', async () => {
    await upsertPatients([
      {
        id: 21,
        mrn: 'MRN-20260311-0001',
        first_name: 'Jane',
        last_name: 'Doe',
        date_of_birth: '1990-01-01',
        gender: 'F',
        county: 1,
        sub_county: 2,
        is_sensitive: false,
        consent_given: false,
        referral_source: 'self',
        created_at: '2026-03-11T09:00:00Z',
        updated_at: '2026-03-11T09:00:00Z',
      },
    ] as never);

    const result = await listLocalPatients({ search: 'jane' });

    expect(result.count).toBe(1);
    expect(result.records[0]?.id).toBe(21);
  });

  it('queues offline patient and encounter creates and remaps dependent encounter patient ids after sync', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    const queuedPatient = await queueOfflinePatientCreate({
      first_name: 'Alice',
      last_name: 'Otieno',
      date_of_birth: '1988-05-01',
      gender: 'F',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    const queuedEncounter = await queueOfflineEncounterCreate({
      patient: queuedPatient.id,
      encounter_type: 'OPD',
      encounter_date: '2026-03-11',
      chief_complaint: 'Headache',
    });

    await replaceQueuedPatient(queuedPatient.id, {
      ...queuedPatient,
      id: 44,
      mrn: 'MRN-20260311-0044',
    }, '2026-03-11T10:00:00Z');

    const patient = await getLocalPatient(queuedPatient.id);
    const encounter = await getLocalEncounter(queuedEncounter.id);

    expect(patient?.id).toBe(44);
    expect(encounter?.patient).toBe(44);
  });

  it('lists local encounters for a patient and keeps synced server records', async () => {
    await upsertPatients([
      {
        id: 99,
        mrn: 'MRN-20260311-0099',
        first_name: 'John',
        last_name: 'Mwangi',
        date_of_birth: '1975-10-20',
        gender: 'M',
        county: 1,
        sub_county: 2,
        is_sensitive: false,
        consent_given: false,
        referral_source: 'self',
        created_at: '2026-03-11T08:00:00Z',
        updated_at: '2026-03-11T08:00:00Z',
      },
    ] as never);

    await upsertEncounters([
      {
        id: 201,
        patient: 99,
        encounter_type: 'OPD',
        encounter_date: '2026-03-11',
        chief_complaint: 'Fever',
        status: 'CREATED',
        created_at: '2026-03-11T08:30:00Z',
      },
    ] as never);

    const result = await listLocalEncounters({ patientId: 99 });

    expect(result.count).toBe(1);
    expect(result.records[0]?.id).toBe(201);
  });

  it('returns empty results when no data is stored', async () => {
    const patients = await listLocalPatients();
    const encounters = await listLocalEncounters();

    expect(patients.count).toBe(0);
    expect(patients.records).toHaveLength(0);
    expect(encounters.count).toBe(0);
    expect(encounters.records).toHaveLength(0);
  });

  it('normalizes corrupt JSON to an empty database', async () => {
    await AsyncStorage.setItem(OFFLINE_DB_STORAGE_KEY, 'not-json-at-all');

    const database = await getOfflineDatabase();

    expect(database.patients).toHaveLength(0);
    expect(database.encounters).toHaveLength(0);
    expect(database.meta.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('runs schema migrations on old data', async () => {
    // Simulate v1 data (no schema_version field)
    const v1Data = {
      counties: [],
      diagnoses: [],
      encounters: [],
      meta: {
        id_remaps: { encounters: {}, patients: {} },
        last_pull_at: null,
        last_push_at: null,
        last_seeded_at: null,
        last_successful_sync_at: null,
        last_sync_error: null,
      },
      patients: [],
      queue: [
        {
          id: 'queue-old-1',
          attempts: 8,
          created_at: '2026-01-01T00:00:00Z',
          entity: 'patient',
          last_error: 'Some error',
          local_id: -100,
          operation: 'create',
          payload: {},
          status: 'pending',
        },
      ],
      subCounties: [],
      wards: [],
    };
    await AsyncStorage.setItem(OFFLINE_DB_STORAGE_KEY, JSON.stringify(v1Data));

    const database = await getOfflineDatabase();

    // Migration v2 should set schema_version and mark excessively-attempted entries as failed
    expect(database.meta.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(database.queue[0]?.status).toBe('failed');
  });

  it('upserts reference data including sub-counties and wards', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }, { id: 11, county: 1, name: 'Langata' }],
      wards: [{ id: 100, sub_county: 10, name: 'Kitisuru' }],
    });

    const database = await getOfflineDatabase();

    expect(database.counties).toHaveLength(1);
    expect(database.subCounties).toHaveLength(2);
    expect(database.wards).toHaveLength(1);
  });

  it('returns conflict and failed queue entries', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    const patient = await queueOfflinePatientCreate({
      first_name: 'Test',
      last_name: 'User',
      date_of_birth: '1990-01-01',
      gender: 'M',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    // Mark entry as conflict
    const database = await getOfflineDatabase();
    const entryId = database.queue[0]!.id;
    await updateQueueEntryState(entryId, { status: 'conflict', last_error: 'Conflict detected' });

    const issues = await getConflictAndFailedEntries();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.status).toBe('conflict');
  });

  it('discards a queue entry and removes the associated local record', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    const patient = await queueOfflinePatientCreate({
      first_name: 'ToDiscard',
      last_name: 'Patient',
      date_of_birth: '1990-01-01',
      gender: 'F',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    let database = await getOfflineDatabase();
    const entryId = database.queue[0]!.id;

    await discardQueueEntry(entryId);

    database = await getOfflineDatabase();
    expect(database.queue).toHaveLength(0);
    expect(database.patients.find((p) => p.id === patient.id)).toBeUndefined();
  });

  it('retries a failed queue entry by resetting attempts and status', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    await queueOfflinePatientCreate({
      first_name: 'Retry',
      last_name: 'Patient',
      date_of_birth: '1990-01-01',
      gender: 'M',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    let database = await getOfflineDatabase();
    const entryId = database.queue[0]!.id;

    // Mark as failed with high attempt count
    await updateQueueEntryState(entryId, { status: 'failed', attempts: 5, last_error: 'Permanently failed' });

    await retryQueueEntry(entryId);

    database = await getOfflineDatabase();
    const entry = database.queue.find((e) => e.id === entryId);
    expect(entry?.status).toBe('pending');
    expect(entry?.attempts).toBe(0);
    expect(entry?.last_error).toBeNull();
  });

  it('upserts and lists local lab orders', async () => {
    await upsertLabOrders([
      {
        id: 701,
        order_number: 'LAB-20260311-0001',
        patient: 21,
        patient_name: 'Jane Doe',
        patient_mrn: 'MRN-20260311-0001',
        order_type: 'IN_HOUSE',
        priority: 'ROUTINE',
        status: 'ORDERED',
        specimen_collected: false,
        total_cost: 500,
        items: [],
        ordered_at: '2026-03-11T10:00:00Z',
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
      {
        id: 702,
        order_number: 'LAB-20260311-0002',
        patient: 22,
        patient_name: 'John Doe',
        patient_mrn: 'MRN-20260311-0002',
        order_type: 'IN_HOUSE',
        priority: 'URGENT',
        status: 'COLLECTED',
        specimen_collected: true,
        total_cost: 1000,
        items: [],
        ordered_at: '2026-03-11T11:00:00Z',
        created_at: '2026-03-11T11:00:00Z',
        updated_at: '2026-03-11T11:00:00Z',
      },
    ] as never);

    const all = await listLocalLabOrders();
    expect(all.count).toBe(2);

    const filtered = await listLocalLabOrders({ patientId: 21 });
    expect(filtered.count).toBe(1);
    expect(filtered.records[0]?.order_number).toBe('LAB-20260311-0001');
  });

  it('upserts and lists local prescriptions', async () => {
    await upsertPrescriptions([
      {
        id: 801,
        prescription_number: 'RX-20260311-0001',
        patient: 21,
        patient_name: 'Jane Doe',
        patient_mrn: 'MRN-20260311-0001',
        status: 'PENDING',
        is_valid: true,
        is_valid_prescription: true,
        is_fully_dispensed: false,
        is_fully_dispensed_status: false,
        items: [],
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
    ] as never);

    const all = await listLocalPrescriptions();
    expect(all.count).toBe(1);
    expect(all.records[0]?.prescription_number).toBe('RX-20260311-0001');
  });

  it('filters local prescriptions by patient id', async () => {
    await upsertPrescriptions([
      {
        id: 801,
        prescription_number: 'RX-20260311-0001',
        patient: 21,
        status: 'PENDING',
        is_valid: true,
        is_valid_prescription: true,
        is_fully_dispensed: false,
        is_fully_dispensed_status: false,
        items: [],
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
      {
        id: 802,
        prescription_number: 'RX-20260311-0002',
        patient: 22,
        status: 'DISPENSED',
        is_valid: true,
        is_valid_prescription: true,
        is_fully_dispensed: true,
        is_fully_dispensed_status: true,
        items: [],
        created_at: '2026-03-11T11:00:00Z',
        updated_at: '2026-03-11T11:00:00Z',
      },
    ] as never);

    const patient21 = await listLocalPrescriptions({ patientId: 21 });
    expect(patient21.count).toBe(1);
    expect(patient21.records[0]?.id).toBe(801);

    const patient22 = await listLocalPrescriptions({ patientId: 22 });
    expect(patient22.count).toBe(1);
    expect(patient22.records[0]?.id).toBe(802);
  });

  it('runs schema v3 migration adding labOrders and prescriptions', async () => {
    // Simulate a v2 database without labOrders/prescriptions
    const v2Database = {
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      diagnoses: [],
      encounters: [],
      patients: [],
      queue: [],
      subCounties: [],
      wards: [],
      meta: {
        id_remaps: { encounters: {}, patients: {} },
        last_pull_at: null,
        last_push_at: null,
        last_seeded_at: null,
        last_successful_sync_at: null,
        last_sync_error: null,
        schema_version: 2,
      },
    };

    await AsyncStorage.setItem(OFFLINE_DB_STORAGE_KEY, JSON.stringify(v2Database));
    const database = await getOfflineDatabase();

    expect(database.meta.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(Array.isArray(database.labOrders)).toBe(true);
    expect(database.labOrders).toHaveLength(0);
    expect(Array.isArray(database.prescriptions)).toBe(true);
    expect(database.prescriptions).toHaveLength(0);
  });

  it('updates existing lab orders on upsert instead of duplicating', async () => {
    await upsertLabOrders([
      {
        id: 701,
        order_number: 'LAB-20260311-0001',
        patient: 21,
        order_type: 'IN_HOUSE',
        priority: 'ROUTINE',
        status: 'ORDERED',
        specimen_collected: false,
        total_cost: 500,
        items: [],
        ordered_at: '2026-03-11T10:00:00Z',
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
    ] as never);

    // Upsert same id with updated status
    await upsertLabOrders([
      {
        id: 701,
        order_number: 'LAB-20260311-0001',
        patient: 21,
        order_type: 'IN_HOUSE',
        priority: 'ROUTINE',
        status: 'COMPLETED',
        specimen_collected: true,
        total_cost: 500,
        items: [],
        ordered_at: '2026-03-11T10:00:00Z',
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T12:00:00Z',
      },
    ] as never);

    const result = await listLocalLabOrders();
    expect(result.count).toBe(1);
    expect(result.records[0]?.status).toBe('COMPLETED');
  });

  it('limits lab order list results when limit is specified', async () => {
    await upsertLabOrders([
      {
        id: 701,
        order_number: 'LAB-0001',
        patient: 21,
        order_type: 'IN_HOUSE',
        priority: 'ROUTINE',
        status: 'ORDERED',
        specimen_collected: false,
        total_cost: 100,
        items: [],
        ordered_at: '2026-03-11T10:00:00Z',
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
      {
        id: 702,
        order_number: 'LAB-0002',
        patient: 21,
        order_type: 'IN_HOUSE',
        priority: 'URGENT',
        status: 'ORDERED',
        specimen_collected: false,
        total_cost: 200,
        items: [],
        ordered_at: '2026-03-11T11:00:00Z',
        created_at: '2026-03-11T11:00:00Z',
        updated_at: '2026-03-11T11:00:00Z',
      },
      {
        id: 703,
        order_number: 'LAB-0003',
        patient: 21,
        order_type: 'IN_HOUSE',
        priority: 'STAT',
        status: 'ORDERED',
        specimen_collected: false,
        total_cost: 300,
        items: [],
        ordered_at: '2026-03-11T12:00:00Z',
        created_at: '2026-03-11T12:00:00Z',
        updated_at: '2026-03-11T12:00:00Z',
      },
    ] as never);

    const limited = await listLocalLabOrders({ limit: 2 });
    expect(limited.count).toBe(3);
    expect(limited.records).toHaveLength(2);
  });

  it('updates existing prescriptions on upsert instead of duplicating', async () => {
    await upsertPrescriptions([
      {
        id: 801,
        prescription_number: 'RX-20260311-0001',
        patient: 21,
        status: 'PENDING',
        is_valid: true,
        is_valid_prescription: true,
        is_fully_dispensed: false,
        is_fully_dispensed_status: false,
        items: [],
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
    ] as never);

    // Upsert same id with updated status
    await upsertPrescriptions([
      {
        id: 801,
        prescription_number: 'RX-20260311-0001',
        patient: 21,
        status: 'DISPENSED',
        is_valid: true,
        is_valid_prescription: true,
        is_fully_dispensed: true,
        is_fully_dispensed_status: true,
        items: [],
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T12:00:00Z',
      },
    ] as never);

    const result = await listLocalPrescriptions();
    expect(result.count).toBe(1);
    expect(result.records[0]?.status).toBe('DISPENSED');
    expect(result.records[0]?.is_fully_dispensed).toBe(true);
  });
});
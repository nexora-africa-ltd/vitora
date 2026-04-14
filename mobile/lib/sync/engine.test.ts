import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError } from 'axios';

import { clearOfflineDatabase, getOfflineDatabase, getPendingSyncQueue, queueOfflineEncounterCreate, queueOfflinePatientCreate, queueOfflineScreeningCreate, updateQueueEntryState, upsertReferenceData } from '@/lib/db';
import { encountersApi } from '@/lib/api/encounters';
import { laboratoryApi } from '@/lib/api/laboratory';
import { locationsApi } from '@/lib/api/locations';
import { screeningApi } from '@/lib/api/screening';
import { patientsApi } from '@/lib/api/patients';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { runOfflineSync } from '@/lib/sync/engine';
import { pushPendingSyncQueue } from '@/lib/sync/push';

function makeAxiosError(status: number, message: string): AxiosError {
  const error = new AxiosError(message);
  error.response = {
    status,
    statusText: message,
    data: { detail: message },
    headers: {},
    config: {} as never,
  };
  return error;
}

jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    create: jest.fn(),
    list: jest.fn(),
  },
}));

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    create: jest.fn(),
    list: jest.fn(),
  },
}));

jest.mock('@/lib/api/locations', () => ({
  locationsApi: {
    getCounties: jest.fn(),
    getAllSubCounties: jest.fn(),
    getAllWards: jest.fn(),
  },
}));

jest.mock('@/lib/api/laboratory', () => ({
  laboratoryApi: {
    listOrders: jest.fn(),
  },
}));

jest.mock('@/lib/api/pharmacy', () => ({
  pharmacyApi: {
    listPrescriptions: jest.fn(),
  },
}));

jest.mock('@/lib/api/screening', () => ({
  screeningApi: {
    listScreenings: jest.fn(),
    uploadScreening: jest.fn(),
  },
}));

const mockedPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockedEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockedLocationsApi = locationsApi as jest.Mocked<typeof locationsApi>;
const mockedLaboratoryApi = laboratoryApi as jest.Mocked<typeof laboratoryApi>;
const mockedPharmacyApi = pharmacyApi as jest.Mocked<typeof pharmacyApi>;
const mockedScreeningApi = screeningApi as jest.Mocked<typeof screeningApi>;

function setupPullMocks() {
  mockedLocationsApi.getCounties.mockResolvedValue([{ id: 1, code: 1, name: 'Nairobi' }]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockedLocationsApi as any).getAllSubCounties.mockResolvedValue([{ id: 10, county: 1, name: 'Westlands' }]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockedLocationsApi as any).getAllWards.mockResolvedValue([{ id: 100, sub_county: 10, name: 'Kitisuru' }]);
  mockedPatientsApi.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  mockedEncountersApi.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  mockedLaboratoryApi.listOrders.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  mockedPharmacyApi.listPrescriptions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  mockedScreeningApi.listScreenings.mockResolvedValue({ count: 0, results: [] });
}

describe('runOfflineSync', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await clearOfflineDatabase();
  });

  it('pushes queued records then refreshes local snapshots from the server', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    const localPatient = await queueOfflinePatientCreate({
      first_name: 'Grace',
      last_name: 'Achieng',
      date_of_birth: '1991-02-03',
      gender: 'F',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    await queueOfflineEncounterCreate({
      patient: localPatient.id,
      encounter_type: 'OPD',
      encounter_date: '2026-03-11',
      chief_complaint: 'Chest pain',
    });

    mockedPatientsApi.create.mockResolvedValue({
      ...localPatient,
      id: 501,
      mrn: 'MRN-20260311-0501',
    } as never);

    mockedEncountersApi.create.mockResolvedValue({
      id: 601,
      patient: 501,
      patient_name: 'Grace Achieng',
      patient_mrn: 'MRN-20260311-0501',
      encounter_type: 'OPD',
      encounter_date: '2026-03-11',
      chief_complaint: 'Chest pain',
      status: 'CREATED',
      created_at: '2026-03-11T10:00:00Z',
      updated_at: '2026-03-11T10:00:00Z',
    } as never);

    mockedLocationsApi.getCounties.mockResolvedValue([{ id: 1, code: 1, name: 'Nairobi' }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedLocationsApi as any).getAllSubCounties.mockResolvedValue([{ id: 10, county: 1, name: 'Westlands' }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedLocationsApi as any).getAllWards.mockResolvedValue([]);
    mockedPatientsApi.list.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 501,
          mrn: 'MRN-20260311-0501',
          first_name: 'Grace',
          last_name: 'Achieng',
          date_of_birth: '1991-02-03',
          gender: 'F',
          county: 1,
          sub_county: 10,
          is_sensitive: false,
          consent_given: false,
          referral_source: 'self',
          created_at: '2026-03-11T10:00:00Z',
          updated_at: '2026-03-11T10:00:00Z',
        },
      ],
    });
    mockedEncountersApi.list.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 601,
          patient: 501,
          patient_name: 'Grace Achieng',
          patient_mrn: 'MRN-20260311-0501',
          encounter_type: 'OPD',
          encounter_date: '2026-03-11',
          chief_complaint: 'Chest pain',
          status: 'CREATED',
          created_at: '2026-03-11T10:00:00Z',
          updated_at: '2026-03-11T10:00:00Z',
        },
      ],
    });
    mockedLaboratoryApi.listOrders.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedPharmacyApi.listPrescriptions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });

    const summary = await runOfflineSync();
    const database = await getOfflineDatabase();

    expect(summary.status).toBe('synced');
    expect(summary.pushedCount).toBe(2);
    expect(database.queue).toHaveLength(0);
    expect(database.patients.some((patient) => patient.id === 501)).toBe(true);
    expect(database.encounters.some((encounter) => encounter.id === 601)).toBe(true);
  });

  it('reports conflict status when API returns 409', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    await queueOfflinePatientCreate({
      first_name: 'Conflict',
      last_name: 'Patient',
      date_of_birth: '1990-01-01',
      gender: 'M',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    mockedPatientsApi.create.mockRejectedValue(makeAxiosError(409, 'Duplicate record'));
    setupPullMocks();

    const summary = await runOfflineSync();

    expect(summary.status).toBe('conflict');
    expect(summary.conflictCount).toBe(1);
  });

  it('caps retries at MAX_SYNC_ATTEMPTS and marks entries as permanently failed', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    await queueOfflinePatientCreate({
      first_name: 'FailRetry',
      last_name: 'Patient',
      date_of_birth: '1990-01-01',
      gender: 'F',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    // Manually set attempts to 5 (MAX_SYNC_ATTEMPTS)
    const db = await getOfflineDatabase();
    const entryId = db.queue[0]!.id;
    await updateQueueEntryState(entryId, { attempts: 5 });

    setupPullMocks();

    const summary = await pushPendingSyncQueue();

    expect(summary.failed).toBe(1);
    expect(summary.pushed).toBe(0);

    const updatedDb = await getOfflineDatabase();
    const failedEntry = updatedDb.queue.find((e) => e.id === entryId);
    expect(failedEntry?.status).toBe('failed');
  });

  it('returns error status when pull fails', async () => {
    mockedLocationsApi.getCounties.mockRejectedValue(new Error('Network error'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedLocationsApi as any).getAllSubCounties.mockRejectedValue(new Error('Network error'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedLocationsApi as any).getAllWards.mockRejectedValue(new Error('Network error'));
    mockedPatientsApi.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedEncountersApi.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedLaboratoryApi.listOrders.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedPharmacyApi.listPrescriptions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });

    const summary = await runOfflineSync();

    expect(summary.status).toBe('error');
    expect(summary.error).toContain('Network error');
  });

  it('uses delta sync with modified_after on subsequent pulls', async () => {
    setupPullMocks();

    // First sync — no modified_after
    await runOfflineSync();

    // Second sync — should pass modified_after
    await runOfflineSync();

    const lastListCall = mockedPatientsApi.list.mock.calls[mockedPatientsApi.list.mock.calls.length - 1]?.[0];
    expect(lastListCall?.modified_after).toBeTruthy();
  });

  it('pulls sub-counties and wards during sync', async () => {
    setupPullMocks();

    await runOfflineSync();

    expect((mockedLocationsApi as any).getAllSubCounties).toHaveBeenCalled();
    expect((mockedLocationsApi as any).getAllWards).toHaveBeenCalled();
  });

  it('uploads queued screenings and refreshes them from the backend cache', async () => {
    await queueOfflineScreeningCreate({
      patient: null,
      patient_name: 'Field Client',
      patient_mrn: null,
      screening_type: 'TB_CONTACT',
      chu_name: 'Kayole CHU 4',
      territory: 'Village A',
      cough_duration_days: 7,
      household_contact_name: 'Household Alpha',
      tb_referral_made: true,
    });

    setupPullMocks();

    mockedScreeningApi.uploadScreening.mockResolvedValue({
      id: 901,
      patient: null,
      patient_name: 'Field Client',
      patient_mrn: null,
      screening_type: 'TB_CONTACT',
      screening_date: '2026-03-13',
      chu_name: 'Kayole CHU 4',
      territory: 'Village A',
      result_summary: '7 day cough · contact Household Alpha',
      notes: '',
      muac_mm: null,
      edema_present: null,
      fever_present: null,
      cough_duration_days: 7,
      household_contact_name: 'Household Alpha',
      malaria_rdt_result: null,
      malaria_treatment_referred: null,
      tb_referral_made: true,
      location: null,
      photo: null,
      captured_by: 1,
      created_at: '2026-03-13T08:00:00Z',
      updated_at: '2026-03-13T08:00:00Z',
      local_only: false,
      sync_status: 'uploaded',
      sync_error: null,
    });
    mockedScreeningApi.listScreenings.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 901,
          patient: null,
          patient_name: 'Field Client',
          patient_mrn: null,
          screening_type: 'TB_CONTACT',
          screening_date: '2026-03-13',
          chu_name: 'Kayole CHU 4',
          territory: 'Village A',
          result_summary: '7 day cough · contact Household Alpha',
          notes: '',
          muac_mm: null,
          edema_present: null,
          fever_present: null,
          cough_duration_days: 7,
          household_contact_name: 'Household Alpha',
          malaria_rdt_result: null,
          malaria_treatment_referred: null,
          tb_referral_made: true,
          location: null,
          photo: null,
          captured_by: 1,
          created_at: '2026-03-13T08:00:00Z',
          updated_at: '2026-03-13T08:00:00Z',
          local_only: false,
          sync_status: 'uploaded',
          sync_error: null,
        },
      ],
    });

    const summary = await runOfflineSync();
    const database = await getOfflineDatabase();

    expect(summary.pushedCount).toBe(1);
    expect(mockedScreeningApi.uploadScreening).toHaveBeenCalled();
    expect(database.screenings.some((record) => record.id === 901)).toBe(true);
  });

  it('excludes failed queue entries from pending sync queue', async () => {
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });

    await queueOfflinePatientCreate({
      first_name: 'Failed',
      last_name: 'Entry',
      date_of_birth: '1990-01-01',
      gender: 'M',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    const db = await getOfflineDatabase();
    await updateQueueEntryState(db.queue[0]!.id, { status: 'failed', last_error: 'Permanent failure' });

    const pending = await getPendingSyncQueue();
    expect(pending).toHaveLength(0);
  });

  it('pulls lab orders and prescriptions during sync', async () => {
    setupPullMocks();

    mockedLaboratoryApi.listOrders.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 701,
          order_number: 'LAB-20260311-0001',
          patient: 501,
          patient_name: 'Grace Achieng',
          patient_mrn: 'MRN-20260311-0501',
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
      ] as never,
    });

    mockedPharmacyApi.listPrescriptions.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 801,
          prescription_number: 'RX-20260311-0001',
          patient: 501,
          patient_name: 'Grace Achieng',
          patient_mrn: 'MRN-20260311-0501',
          status: 'PENDING',
          is_valid: true,
          is_valid_prescription: true,
          is_fully_dispensed: false,
          is_fully_dispensed_status: false,
          items: [],
          created_at: '2026-03-11T11:00:00Z',
          updated_at: '2026-03-11T11:00:00Z',
        },
      ] as never,
    });

    const summary = await runOfflineSync();
    const database = await getOfflineDatabase();

    expect(summary.labOrderCount).toBe(1);
    expect(summary.prescriptionCount).toBe(1);
    expect(database.labOrders).toHaveLength(1);
    expect(database.labOrders[0]?.id).toBe(701);
    expect(database.prescriptions).toHaveLength(1);
    expect(database.prescriptions[0]?.id).toBe(801);
  });
});

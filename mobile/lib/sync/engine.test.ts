import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearOfflineDatabase, getOfflineDatabase, queueOfflineEncounterCreate, queueOfflinePatientCreate, upsertReferenceData } from '@/lib/db';
import { encountersApi } from '@/lib/api/encounters';
import { locationsApi } from '@/lib/api/locations';
import { patientsApi } from '@/lib/api/patients';
import { runOfflineSync } from '@/lib/sync/engine';

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
  },
}));

const mockedPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockedEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockedLocationsApi = locationsApi as jest.Mocked<typeof locationsApi>;

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

    const summary = await runOfflineSync();
    const database = await getOfflineDatabase();

    expect(summary.status).toBe('synced');
    expect(summary.pushedCount).toBe(2);
    expect(database.queue).toHaveLength(0);
    expect(database.patients.some((patient) => patient.id === 501)).toBe(true);
    expect(database.encounters.some((encounter) => encounter.id === 601)).toBe(true);
  });
});
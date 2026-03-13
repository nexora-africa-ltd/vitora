import { encountersApi } from '@/lib/api/encounters';
import { inpatientApi } from '@/lib/api/inpatient';
import { laboratoryApi } from '@/lib/api/laboratory';
import { locationsApi } from '@/lib/api/locations';
import { ancVisitsApi, immunizationsApi, mchRegistrationsApi } from '@/lib/api/mch';
import { patientsApi } from '@/lib/api/patients';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { screeningApi } from '@/lib/api/screening';
import { getOfflineDatabase, setOfflineSyncMetadata, upsertAdmissions, upsertANCVisits, upsertEncounters, upsertImmunizationRecords, upsertInpatientWards, upsertLabOrders, upsertMCHRegistrations, upsertPatients, upsertPrescriptions, upsertReferenceData, upsertScreenings } from '@/lib/db';

type PullSummary = {
  admissions: number;
  ancVisits: number;
  encounters: number;
  immunizations: number;
  labOrders: number;
  mchRegistrations: number;
  patients: number;
  prescriptions: number;
  screenings: number;
};

async function fetchAllMCHRegistrations() {
  const records = [] as Awaited<ReturnType<typeof mchRegistrationsApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await mchRegistrationsApi.list({ page, page_size: 100, ordering: '-registration_date' });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllANCVisits() {
  const records = [] as Awaited<ReturnType<typeof ancVisitsApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await ancVisitsApi.list({ page, page_size: 100 });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllImmunizations() {
  const records = [] as Awaited<ReturnType<typeof immunizationsApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await immunizationsApi.list({ page, page_size: 100, ordering: 'scheduled_date' });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllPatients(modifiedAfter?: string | null) {
  const records = [] as Awaited<ReturnType<typeof patientsApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await patientsApi.list({
      page,
      page_size: 100,
      ordering: '-created_at',
      ...(modifiedAfter ? { modified_after: modifiedAfter } : {}),
    });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllEncounters(modifiedAfter?: string | null) {
  const records = [] as Awaited<ReturnType<typeof encountersApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await encountersApi.list({
      page,
      page_size: 100,
      ordering: '-encounter_date',
      ...(modifiedAfter ? { modified_after: modifiedAfter } : {}),
    });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllLabOrders() {
  const records = [] as Awaited<ReturnType<typeof laboratoryApi.listOrders>>['results'];
  let page = 1;

  while (true) {
    const response = await laboratoryApi.listOrders({ page, page_size: 100 });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllPrescriptions() {
  const records = [] as Awaited<ReturnType<typeof pharmacyApi.listPrescriptions>>['results'];
  let page = 1;

  while (true) {
    const response = await pharmacyApi.listPrescriptions({ page, page_size: 100 });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllScreenings(modifiedAfter?: string | null) {
  const records = [] as Awaited<ReturnType<typeof screeningApi.listScreenings>>['results'];
  let page = 1;

  while (true) {
    const response = await screeningApi.listScreenings({
      page,
      page_size: 100,
      ...(modifiedAfter ? { modified_after: modifiedAfter } : {}),
    });
    records.push(...response.results);

    if (response.results.length < 100) {
      return records;
    }

    page += 1;
  }
}

export async function pullOfflineData(): Promise<PullSummary> {
  const database = await getOfflineDatabase();
  const lastPullAt = database.meta.last_pull_at;
  const syncedAt = new Date().toISOString();

  const [counties, subCounties, wards, patients, encounters, labOrders, prescriptions, inpatientWards, admissions, mchRegistrations, ancVisits, immunizations, screenings] = await Promise.all([
    locationsApi.getCounties(),
    locationsApi.getAllSubCounties(),
    locationsApi.getAllWards(),
    fetchAllPatients(lastPullAt),
    fetchAllEncounters(lastPullAt),
    fetchAllLabOrders(),
    fetchAllPrescriptions(),
    inpatientApi.listWards({ is_active: true, page_size: 100 }).then((r) => r.results).catch(() => []),
    inpatientApi.listAdmissions({ admission_status: 'ACTIVE', page_size: 200 }).then((r) => r.results).catch(() => []),
    fetchAllMCHRegistrations().catch(() => []),
    fetchAllANCVisits().catch(() => []),
    fetchAllImmunizations().catch(() => []),
    fetchAllScreenings(lastPullAt).catch(() => []),
  ]);

  await upsertReferenceData({ counties, subCounties, wards });
  await upsertPatients(patients, syncedAt);
  await upsertEncounters(encounters, syncedAt);
  await upsertLabOrders(labOrders, syncedAt);
  await upsertMCHRegistrations(mchRegistrations);
  await upsertANCVisits(ancVisits, syncedAt);
  await upsertImmunizationRecords(immunizations, syncedAt);
  await upsertPrescriptions(prescriptions, syncedAt);
  await upsertScreenings(screenings);
  await upsertInpatientWards(inpatientWards);
  await upsertAdmissions(admissions);

  await setOfflineSyncMetadata({
    last_pull_at: syncedAt,
    last_seeded_at: database.meta.last_seeded_at ?? syncedAt,
  });

  return {
    admissions: admissions.length,
    ancVisits: ancVisits.length,
    encounters: encounters.length,
    immunizations: immunizations.length,
    labOrders: labOrders.length,
    mchRegistrations: mchRegistrations.length,
    patients: patients.length,
    prescriptions: prescriptions.length,
    screenings: screenings.length,
  };
}
import { encountersApi } from '@/lib/api/encounters';
import { inpatientApi } from '@/lib/api/inpatient';
import { laboratoryApi } from '@/lib/api/laboratory';
import { locationsApi } from '@/lib/api/locations';
import { patientsApi } from '@/lib/api/patients';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { getOfflineDatabase, setOfflineSyncMetadata, upsertAdmissions, upsertEncounters, upsertInpatientWards, upsertLabOrders, upsertPatients, upsertPrescriptions, upsertReferenceData } from '@/lib/db';

type PullSummary = {
  admissions: number;
  encounters: number;
  labOrders: number;
  patients: number;
  prescriptions: number;
};

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

export async function pullOfflineData(): Promise<PullSummary> {
  const database = await getOfflineDatabase();
  const lastPullAt = database.meta.last_pull_at;
  const syncedAt = new Date().toISOString();

  const [counties, subCounties, wards, patients, encounters, labOrders, prescriptions, inpatientWards, admissions] = await Promise.all([
    locationsApi.getCounties(),
    locationsApi.getAllSubCounties(),
    locationsApi.getAllWards(),
    fetchAllPatients(lastPullAt),
    fetchAllEncounters(lastPullAt),
    fetchAllLabOrders(),
    fetchAllPrescriptions(),
    inpatientApi.listWards({ is_active: true, page_size: 100 }).then((r) => r.results).catch(() => []),
    inpatientApi.listAdmissions({ admission_status: 'ACTIVE', page_size: 200 }).then((r) => r.results).catch(() => []),
  ]);

  await upsertReferenceData({ counties, subCounties, wards });
  await upsertPatients(patients, syncedAt);
  await upsertEncounters(encounters, syncedAt);
  await upsertLabOrders(labOrders, syncedAt);
  await upsertPrescriptions(prescriptions, syncedAt);
  await upsertInpatientWards(inpatientWards);
  await upsertAdmissions(admissions);

  await setOfflineSyncMetadata({
    last_pull_at: syncedAt,
    last_seeded_at: database.meta.last_seeded_at ?? syncedAt,
  });

  return {
    admissions: admissions.length,
    encounters: encounters.length,
    labOrders: labOrders.length,
    patients: patients.length,
    prescriptions: prescriptions.length,
  };
}
import { encountersApi } from '@/lib/api/encounters';
import { locationsApi } from '@/lib/api/locations';
import { patientsApi } from '@/lib/api/patients';
import { getOfflineDatabase, setOfflineSyncMetadata, upsertEncounters, upsertPatients, upsertReferenceData } from '@/lib/db';

type PullSummary = {
  encounters: number;
  patients: number;
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

export async function pullOfflineData(): Promise<PullSummary> {
  const database = await getOfflineDatabase();
  const lastPullAt = database.meta.last_pull_at;
  const syncedAt = new Date().toISOString();

  const [counties, subCounties, wards, patients, encounters] = await Promise.all([
    locationsApi.getCounties(),
    locationsApi.getAllSubCounties(),
    locationsApi.getAllWards(),
    fetchAllPatients(lastPullAt),
    fetchAllEncounters(lastPullAt),
  ]);

  await Promise.all([
    upsertReferenceData({ counties, subCounties, wards }),
    upsertPatients(patients, syncedAt),
    upsertEncounters(encounters, syncedAt),
  ]);

  await setOfflineSyncMetadata({
    last_pull_at: syncedAt,
    last_seeded_at: database.meta.last_seeded_at ?? syncedAt,
  });

  return {
    encounters: encounters.length,
    patients: patients.length,
  };
}
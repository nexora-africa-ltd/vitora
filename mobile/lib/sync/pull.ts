import { encountersApi } from '@/lib/api/encounters';
import { locationsApi } from '@/lib/api/locations';
import { patientsApi } from '@/lib/api/patients';
import { setOfflineSyncMetadata, upsertEncounters, upsertPatients, upsertReferenceData } from '@/lib/db';

type PullSummary = {
  encounters: number;
  patients: number;
};

async function fetchAllPatients() {
  const records = [] as Awaited<ReturnType<typeof patientsApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await patientsApi.list({ page, page_size: 100, ordering: '-created_at' });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

async function fetchAllEncounters() {
  const records = [] as Awaited<ReturnType<typeof encountersApi.list>>['results'];
  let page = 1;

  while (true) {
    const response = await encountersApi.list({ page, page_size: 100, ordering: '-encounter_date' });
    records.push(...response.results);

    if (!response.next) {
      return records;
    }

    page += 1;
  }
}

export async function pullOfflineData(): Promise<PullSummary> {
  const syncedAt = new Date().toISOString();
  const [counties, patients, encounters] = await Promise.all([
    locationsApi.getCounties(),
    fetchAllPatients(),
    fetchAllEncounters(),
  ]);

  await Promise.all([
    upsertReferenceData({ counties }),
    upsertPatients(patients, syncedAt),
    upsertEncounters(encounters, syncedAt),
  ]);

  await setOfflineSyncMetadata({
    last_pull_at: syncedAt,
    last_seeded_at: syncedAt,
  });

  return {
    encounters: encounters.length,
    patients: patients.length,
  };
}
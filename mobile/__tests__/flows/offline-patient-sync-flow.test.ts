import AsyncStorage from '@react-native-async-storage/async-storage';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';
import { clearOfflineDatabase, getLocalPatient, getPendingSyncQueue, queueOfflinePatientCreate, upsertReferenceData } from '@/lib/db';
import { pushPendingSyncQueue } from '@/lib/sync/push';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('offline patient sync flow', () => {
  beforeEach(async () => {
    server.resetHandlers();
    await AsyncStorage.clear();
    await clearOfflineDatabase();
    await upsertReferenceData({
      counties: [{ id: 1, code: 1, name: 'Nairobi' }],
      subCounties: [{ id: 10, county: 1, name: 'Westlands' }],
    });
  });

  it('queues an offline patient, pushes it to the backend, and remaps the local record', async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/patients/`, async ({ request }) => {
        const payload = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          id: 44,
          mrn: 'MRN-20260313-0044',
          first_name: payload.first_name,
          last_name: payload.last_name,
          date_of_birth: payload.date_of_birth,
          gender: payload.gender,
          county: payload.county,
          sub_county: payload.sub_county,
          is_sensitive: false,
          consent_given: false,
          referral_source: payload.referral_source,
          created_at: '2026-03-13T09:00:00Z',
          updated_at: '2026-03-13T09:00:00Z',
        });
      })
    );

    const queuedPatient = await queueOfflinePatientCreate({
      first_name: 'Akinyi',
      last_name: 'Otieno',
      date_of_birth: '1992-02-14',
      gender: 'F',
      county: 1,
      sub_county: 10,
      referral_source: 'self',
    });

    expect((await getPendingSyncQueue())).toHaveLength(1);

    const summary = await pushPendingSyncQueue();
    const syncedPatient = await getLocalPatient(queuedPatient.id);

    expect(summary.pushed).toBe(1);
    expect(syncedPatient?.id).toBe(44);
    expect(syncedPatient?.mrn).toBe('MRN-20260313-0044');
    expect(await getPendingSyncQueue()).toHaveLength(0);
  });
});
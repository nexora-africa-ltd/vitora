import { screeningApi } from './screening';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('screeningApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('loads paginated screening results from the backend', async () => {
    let patientParam = '';
    server.use(
      http.get(`${API_BASE_URL}/api/mch/community-screenings/`, ({ request }) => {
        patientParam = new URL(request.url).searchParams.get('patient') ?? '';
        return HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 81,
            patient: 14,
            patient_name: 'Jane Doe',
            patient_mrn: 'MRN-20260310-0001',
            screening_type: 'MALNUTRITION',
            screening_date: '2026-03-13',
            chu_name: 'Kayole CHU 4',
            territory: 'Village A',
            result_summary: 'MUAC 110 mm · edema present',
            notes: 'Urgent referral',
            muac_mm: 110,
            edema_present: true,
            fever_present: null,
            cough_duration_days: null,
            household_contact_name: '',
            malaria_rdt_result: null,
            malaria_treatment_referred: null,
            tb_referral_made: null,
            location: {
              latitude: -1.2921,
              longitude: 36.8219,
              accuracy: 8,
              captured_at: '2026-03-13T08:00:00Z',
            },
            photo: null,
            captured_by: 3,
            created_at: '2026-03-13T08:00:00Z',
            updated_at: '2026-03-13T08:00:00Z',
          },
        ],
      });
      })
    );

    const response = await screeningApi.listScreenings({ patient: 14, modified_after: '2026-03-12T00:00:00Z' });

    expect(patientParam).toBe('14');
    expect(response.results[0]?.result_summary).toBe('MUAC 110 mm · edema present');
    expect(response.results[0]?.sync_status).toBe('uploaded');
  });

  it('creates screenings with multipart payloads when a photo is attached', async () => {
    let contentType = '';
    server.use(
      http.post(`${API_BASE_URL}/api/mch/community-screenings/`, async ({ request }) => {
        contentType = request.headers.get('content-type') ?? '';
        return HttpResponse.json({
        id: 82,
        patient: 14,
        patient_name: 'Jane Doe',
        patient_mrn: 'MRN-20260310-0001',
        screening_type: 'MALARIA_RDT',
        screening_date: '2026-03-13',
        chu_name: 'Kayole CHU 4',
        territory: 'Village A',
        result_summary: 'RDT positive',
        notes: '',
        muac_mm: null,
        edema_present: null,
        fever_present: true,
        cough_duration_days: null,
        household_contact_name: '',
        malaria_rdt_result: 'positive',
        malaria_treatment_referred: true,
        tb_referral_made: null,
        location: null,
        photo: {
          uri: 'https://example.com/media/community_screenings/2026/03/photo.jpg',
          width: null,
          height: null,
          captured_at: '2026-03-13T08:00:00Z',
        },
        captured_by: 3,
        created_at: '2026-03-13T08:00:00Z',
        updated_at: '2026-03-13T08:00:00Z',
      });
      })
    );

    await screeningApi.uploadScreening({
      patient: 14,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260310-0001',
      screening_type: 'MALARIA_RDT',
      chu_name: 'Kayole CHU 4',
      territory: 'Village A',
      fever_present: true,
      malaria_rdt_result: 'positive',
      malaria_treatment_referred: true,
      photo: {
        uri: 'file:///tmp/photo.jpg',
        width: 600,
        height: 400,
        captured_at: '2026-03-13T08:00:00Z',
      },
    });

    expect(contentType).toContain('multipart/form-data');
  });
});
import { checkinApi } from './checkin';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('checkinApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('unwraps patient search results from the backend payload', async () => {
    let searchQuery = '';
    server.use(
      http.get(`${API_BASE_URL}/api/checkin/search/`, ({ request }) => {
        const url = new URL(request.url);
        searchQuery = url.searchParams.get('q') ?? '';
        return HttpResponse.json({
        count: 1,
        results: [
          {
            id: 14,
            mrn: 'MRN-20260311-0001',
            first_name: 'Jane',
            middle_name: null,
            last_name: 'Doe',
            full_name: 'Jane Doe',
            date_of_birth: '1990-01-01',
            age: 36,
            gender: 'F',
            phone_number: '0700000000',
            identification_type: 'NATIONAL_ID',
            identification_number: '12345678',
            county: 1,
            sub_county: 2,
            last_visit_date: '2026-03-01',
          },
        ],
      });
      })
    );

    const results = await checkinApi.searchPatients('Jane Doe');

    expect(searchQuery).toBe('Jane Doe');
    expect(results).toHaveLength(1);
    expect(results[0]?.full_name).toBe('Jane Doe');
  });

  it('posts direct clinic routing payloads for check-in', async () => {
    let postedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_BASE_URL}/api/checkin/patients/14/checkin/`, async ({ request }) => {
        postedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
        checkin_id: 21,
        patient_name: 'Jane Doe',
        patient_mrn: 'MRN-20260311-0001',
        destination: 'Diabetes Clinic',
        destination_clinic_id: 4,
        destination_clinic_name: 'Diabetes Clinic',
        visit_type: 'RETURN',
        visit_reason: 'CHRONIC_CARE',
        skip_triage: true,
        status: 'WAITING',
        queue_position: 3,
        estimated_wait_minutes: 30,
        checked_in_at: '2026-03-11T09:00:00Z',
        encounter_id: 55,
        linked_encounter_id: 12,
        clinic_visit_id: 99,
        warning: null,
      });
      })
    );

    const response = await checkinApi.create(14, {
      destination: '4',
      visit_type: 'RETURN',
      visit_reason: 'CHRONIC_CARE',
      skip_triage: true,
      chief_complaint: 'Medication review',
      notes: 'Known diabetic patient',
      linked_encounter_id: 12,
      identity_method: 'MRN',
    });

    expect(postedBody).toMatchObject({
      destination: '4',
      visit_type: 'RETURN',
      visit_reason: 'CHRONIC_CARE',
      skip_triage: true,
      chief_complaint: 'Medication review',
      notes: 'Known diabetic patient',
      linked_encounter_id: 12,
      identity_method: 'MRN',
    });
    expect(response.destination_clinic_name).toBe('Diabetes Clinic');
    expect(response.skip_triage).toBe(true);
  });
});
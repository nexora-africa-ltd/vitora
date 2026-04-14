import { triageApi } from './triage';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('triageApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('creates a triage assessment with KETA payload fields', async () => {
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_BASE_URL}/api/triage/assessments/`, async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
        id: 7,
        encounter: 55,
        chief_complaint: 'Shortness of breath',
        chief_complaint_category: 'DIFFICULTY_BREATHING',
        pain_score: 7,
        mental_status: 'A',
        gcs_eye: null,
        gcs_verbal: null,
        gcs_motor: null,
        gcs_total: null,
        gcs_severity: null,
        mobility: 'WHEELCHAIR',
        arrival_mode: 'WALK_IN',
        referring_facility_name: '',
        allergies_noted: 'Penicillin',
        spo2: 89,
        heart_rate: 120,
        systolic_bp: 150,
        diastolic_bp: 95,
        temperature: 38.5,
        respiratory_rate: 28,
        weight: 70,
        height: 171,
        triage_category: 'ORANGE',
        auto_calculated_category: 'ORANGE',
        category_override_reason: '',
        assigned_area: 'ER_ACUTE',
        assigned_clinic: null,
        assigned_clinic_name: null,
        routing_destination: 'ER - Acute Care',
        assigned_clinician: null,
        assigned_clinician_name: null,
        arrival_time: '2026-03-11T09:00:00Z',
        triage_start_time: '2026-03-11T09:02:00Z',
        triage_end_time: null,
        seen_by_clinician_time: null,
        alerts: [
          {
            id: 'a-1',
            severity: 'CRITICAL',
            vital_type: 'SPO2',
            message: 'SpO2 below threshold',
            value: 89,
            threshold: 92,
          },
        ],
        vitals: {
          spo2: '89',
          heart_rate: 120,
          blood_pressure: '150/95',
          temperature: '38.5',
          respiratory_rate: 28,
        },
        wait_time_minutes: 0,
        is_wait_time_exceeded: false,
        triaged_by: 2,
        triaged_by_name: 'Nurse One',
        created_at: '2026-03-11T09:02:00Z',
        updated_at: '2026-03-11T09:02:00Z',
      });
      })
    );

    const payload = {
      encounter: 55,
      chief_complaint: 'Shortness of breath',
      chief_complaint_category: 'DIFFICULTY_BREATHING',
      pain_score: 7,
      mental_status: 'A' as const,
      mobility: 'WHEELCHAIR',
      arrival_mode: 'WALK_IN',
      allergies_noted: 'Penicillin',
      spo2: 89,
      heart_rate: 120,
      systolic_bp: 150,
      diastolic_bp: 95,
      temperature: 38.5,
      respiratory_rate: 28,
      weight: 70,
      height: 171,
      triage_category: 'ORANGE' as const,
      assigned_area: 'ER_ACUTE' as const,
      arrival_time: '2026-03-11T09:00:00Z',
    };

    const result = await triageApi.create(payload);

    expect(requestBody).toMatchObject(payload);
    expect(result.triage_category).toBe('ORANGE');
    expect(result.alerts[0]?.message).toBe('SpO2 below threshold');
  });
});

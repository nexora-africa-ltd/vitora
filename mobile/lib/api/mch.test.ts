import { ancVisitsApi, immunizationsApi, mchRegistrationsApi } from './mch';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('mchApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('loads paginated MCH registrations', async () => {
    let capturedMother = '';
    server.use(
      http.get(`${API_BASE_URL}/api/mch/registrations/`, ({ request }) => {
        capturedMother = new URL(request.url).searchParams.get('mother') ?? '';
        return HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 9,
            mch_number: 'MCH-20260313-0009',
            mother: 14,
            mother_name: 'Jane Doe',
            mother_mrn: 'MRN-20260310-0001',
            registration_date: '2026-03-13',
            status: 'ACTIVE',
            is_high_risk: true,
            linda_jamii_beneficiary: true,
            edd: '2026-08-12',
            gestation_display: '18 weeks',
            trimester: 2,
            gravida: 2,
            parity: 1,
            current_gestation_weeks: 18,
            anc_visit_count: 3,
            created_at: '2026-03-13T08:00:00Z',
          },
        ],
      });
      })
    );

    const response = await mchRegistrationsApi.list({ mother: 14 });

    expect(capturedMother).toBe('14');
    expect(response.results[0]?.mch_number).toBe('MCH-20260313-0009');
  });

  it('creates an ANC visit and coerces numeric fields', async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/mch/anc-visits/`, () =>
        HttpResponse.json({
        id: 12,
        registration: 9,
        registration_mch_number: 'MCH-20260313-0009',
        encounter: null,
        clinic_visit: null,
        visit_number: 4,
        visit_date: '2026-03-13',
        gestation_weeks: 18,
        weight: '62.4',
        blood_pressure: '118/72',
        fundal_height: '18',
        fetal_heart_rate: 142,
        presentation: 'CEPHALIC',
        lie: 'LONGITUDINAL',
        fetal_movements: true,
        urine_protein: 'NEGATIVE',
        urine_glucose: 'TRACE',
        hb_level: '11.2',
        blood_sugar: '5.4',
        hiv_test_done: true,
        syphilis_test_done: true,
        iron_folate_given: true,
        calcium_given: false,
        deworming_given: false,
        tetanus_toxoid_dose: 2,
        next_visit_date: null,
        notes: 'Mobile visit',
        conducted_by: null,
        conducted_by_name: null,
        alerts: [],
        is_fetal_heart_rate_normal: true,
        created_at: '2026-03-13T08:00:00Z',
        updated_at: '2026-03-13T08:00:00Z',
      })
      )
    );

    const response = await ancVisitsApi.create({
      registration: 9,
      blood_pressure: '118/72',
      weight: 62.4,
      fundal_height: 18,
    });

    expect(response.weight).toBe(62.4);
    expect(response.fundal_height).toBe(18);
  });

  it('generates immunization schedule arrays', async () => {
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_BASE_URL}/api/mch/immunizations/generate-schedule/`, async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json([
          {
            id: 30,
            patient: 14,
            vaccine: 6,
            vaccine_code: 'TT1',
            vaccine_name: 'Tetanus Toxoid Dose 1',
            scheduled_date: '2026-03-20',
            administered_date: null,
            status: 'SCHEDULED',
            dose_number: 1,
            is_overdue: false,
            created_at: '2026-03-13T08:00:00Z',
          },
        ]);
      })
    );

    const response = await immunizationsApi.generateSchedule(14);

    expect(requestBody).toEqual({ patient: 14 });
    expect(response[0]?.vaccine_code).toBe('TT1');
  });
});
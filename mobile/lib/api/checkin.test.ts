import { checkinApi } from './checkin';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('checkinApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('unwraps patient search results from the backend payload', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
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
      },
    });

    const results = await checkinApi.searchPatients('Jane Doe');

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/checkin/search/', {
      params: { q: 'Jane Doe', limit: 10 },
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.full_name).toBe('Jane Doe');
  });

  it('posts direct clinic routing payloads for check-in', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: {
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
      },
    });

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

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/checkin/patients/14/checkin/', {
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
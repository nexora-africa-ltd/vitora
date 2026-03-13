import { screeningApi } from './screening';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('screeningApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads paginated screening results from the backend', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
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
      },
    });

    const response = await screeningApi.listScreenings({ patient: 14, modified_after: '2026-03-12T00:00:00Z' });

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/mch/community-screenings/', {
      params: { modified_after: '2026-03-12T00:00:00Z', patient: 14 },
    });
    expect(response.results[0]?.result_summary).toBe('MUAC 110 mm · edema present');
    expect(response.results[0]?.sync_status).toBe('uploaded');
  });

  it('creates screenings with multipart payloads when a photo is attached', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: {
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
      },
    });

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

    const firstArg = mockedApiClient.post.mock.calls[0]?.[1];
    expect(mockedApiClient.post.mock.calls[0]?.[0]).toBe('/api/mch/community-screenings/');
    expect(firstArg).toBeInstanceOf(FormData);
  });
});
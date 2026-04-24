import { triageApi } from '@/lib/api/triage';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Triage API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('routeToClinic', () => {
    it('accepts successful clinic visit responses using the subset consumed by the dialog', async () => {
      mockApiClient.post.mockResolvedValue({
        data: {
          id: 42,
          session: 9,
          patient: {
            id: 5,
            mrn: 'MRN-20260309-0001',
            first_name: 'Jane',
            last_name: 'Wanjiku',
            full_name: 'Jane Wanjiku',
            date_of_birth: '1990-01-01',
            age: 36,
            gender: 'F',
            phone_number: '',
          },
          patient_name: 'Jane Wanjiku',
          patient_mrn: 'MRN-20260309-0001',
          clinic_name: 'Eye Clinic',
          queue_number: 4,
          status: 'REGISTERED',
          status_display: 'Registered',
          priority: 'STANDARD',
          priority_display: 'Standard',
          visit_type: 'NEW',
          visit_type_display: 'New Visit',
          source: 'TRIAGE',
          source_display: 'Triage',
          registered_at: '2026-03-09T10:00:00Z',
          called_at: null,
          consultation_started_at: null,
          completed_at: null,
          encounter: 18,
          triage_assessment: 12,
          referred_from: null,
          referred_to_clinic: null,
          referral_reason: '',
          assigned_clinician: null,
          registered_by: null,
          registered_by_name: '',
        },
      });

      const result = await triageApi.routeToClinic(12, {
        clinic_id: 7,
        notes: 'Route to eye clinic',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/triage/assessments/12/route-to-clinic/',
        { clinic_id: 7, notes: 'Route to eye clinic' }
      );
      expect(result).toEqual({
        id: 42,
        patient_name: 'Jane Wanjiku',
        patient_mrn: 'MRN-20260309-0001',
        clinic_name: 'Eye Clinic',
        queue_number: 4,
      });
    });
  });
});

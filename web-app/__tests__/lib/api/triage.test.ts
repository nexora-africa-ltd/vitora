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

  describe('emergency deferred backlog', () => {
    it('parses emergency deferred backlog responses', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          count: 1,
          pending_count: 1,
          overdue_count: 0,
          due_within_30m_count: 1,
          server_time: '2026-09-18T10:00:00Z',
          results: [
            {
              id: 88,
              encounter_id: 201,
              patient_id: 5,
              patient_name: 'Jane Wanjiku',
              patient_mrn: 'MRN-20260309-0001',
              triage_category: 'RED',
              assigned_area: 'ER_RESUS',
              triaged_by: 12,
              triaged_by_name: 'Nurse A',
              deferred_completion_status: 'PENDING',
              deferred_completion_due_at: '2026-09-18T10:15:00Z',
              deferred_completion_completed_at: null,
              remaining_minutes: 15,
              is_overdue: false,
              updated_at: '2026-09-18T10:00:00Z',
            },
          ],
        },
      });

      const result = await triageApi.getEmergencyDeferredBacklog({ overdue_only: false });

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/triage/assessments/emergency-deferred-backlog/',
        { params: { overdue_only: false } }
      );
      expect(result.count).toBe(1);
      expect(result.results[0]?.id).toBe(88);
    });
  });
});

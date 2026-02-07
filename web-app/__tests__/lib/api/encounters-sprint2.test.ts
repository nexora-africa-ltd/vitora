/**
 * Tests for Sprint 2 Encounter API Methods
 *
 * Tests the transition and related encounter API calls.
 * Sprint 2 - Phase 2A + 2B
 */
import { encountersApi } from '@/lib/api/encounters';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('encountersApi - Sprint 2 Methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transition', () => {
    it('sends POST with target status and reason', async () => {
      const mockResponse = {
        data: {
          id: 1,
          status: 'CHECKED_IN',
          previous_status: 'CREATED',
          transitioned_at: '2026-02-07T10:00:00Z',
          transitioned_by: 'testuser',
        },
      };
      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await encountersApi.transition(1, {
        to_status: 'CHECKED_IN',
        reason: 'Patient arrived',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/encounters/1/transition/',
        { to_status: 'CHECKED_IN', reason: 'Patient arrived' }
      );
      expect(result.status).toBe('CHECKED_IN');
      expect(result.previous_status).toBe('CREATED');
    });

    it('sends POST without reason when not provided', async () => {
      const mockResponse = {
        data: {
          id: 1,
          status: 'IN_PROGRESS',
          previous_status: 'TRIAGED',
          transitioned_at: '2026-02-07T10:00:00Z',
          transitioned_by: 'testuser',
        },
      };
      mockApiClient.post.mockResolvedValue(mockResponse);

      await encountersApi.transition(1, { to_status: 'IN_PROGRESS' });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/encounters/1/transition/',
        { to_status: 'IN_PROGRESS' }
      );
    });

    it('handles transition error', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Invalid transition'));

      await expect(
        encountersApi.transition(1, { to_status: 'CLOSED' })
      ).rejects.toThrow('Invalid transition');
    });
  });

  describe('getRelated', () => {
    it('fetches related encounters for a given encounter', async () => {
      const mockRelated = [
        {
          id: 2,
          patient: 1,
          patient_mrn: 'MRN-001',
          patient_name: 'Jane Smith',
          encounter_type: 'FOLLOW_UP',
          encounter_date: '2026-02-05',
          chief_complaint: 'Follow up',
          status: 'CLOSED',
          visit_reason: 'FOLLOW_UP',
          created_at: '2026-02-05T10:00:00Z',
        },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockRelated });

      const result = await encountersApi.getRelated(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/related/');
      expect(result).toHaveLength(1);
      expect(result[0].encounter_type).toBe('FOLLOW_UP');
    });

    it('returns empty array when no related encounters', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      const result = await encountersApi.getRelated(1);

      expect(result).toHaveLength(0);
    });
  });
});

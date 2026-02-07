/**
 * TDD Tests for Encounters API Client
 * Tests CRUD operations for encounter management
 */
import { encountersApi } from '@/lib/api/encounters';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Encounters API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should fetch encounters list', async () => {
      const mockResponse = {
        data: {
          count: 2,
          next: null,
          previous: null,
          results: [
            { id: 1, encounter_type: 'OPD', chief_complaint: 'Headache' },
            { id: 2, encounter_type: 'EMERGENCY', chief_complaint: 'Chest pain' },
          ],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await encountersApi.list();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/', { params: undefined });
      expect(result.results).toHaveLength(2);
    });

    it('should pass filter params', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await encountersApi.list({ patient: 123, status: 'CLOSED' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/', {
        params: { patient: 123, status: 'CLOSED' },
      });
    });
  });

  describe('get', () => {
    it('should fetch a single encounter by ID', async () => {
      const mockEncounter = {
        id: 1,
        encounter_type: 'OPD',
        chief_complaint: 'Headache',
        patient: 1,
      };
      mockApiClient.get.mockResolvedValue({ data: mockEncounter });

      const result = await encountersApi.get(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/');
      expect(result).toEqual(mockEncounter);
    });
  });

  describe('create', () => {
    it('should create a new encounter', async () => {
      const encounterData = {
        patient: 1,
        encounter_type: 'OPD' as const,
        chief_complaint: 'Fever',
      };
      const mockResponse = { id: 1, ...encounterData };
      mockApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await encountersApi.create(encounterData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/encounters/', encounterData);
      expect(result.id).toBe(1);
    });
  });

  describe('update', () => {
    it('should update an existing encounter', async () => {
      const updateData = { chief_complaint: 'Updated complaint' };
      const mockResponse = { id: 1, ...updateData };
      mockApiClient.patch.mockResolvedValue({ data: mockResponse });

      const result = await encountersApi.update(1, updateData);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/encounters/1/', updateData);
      expect(result.chief_complaint).toBe('Updated complaint');
    });
  });

  describe('getDiagnoses', () => {
    it('should fetch diagnoses for an encounter', async () => {
      const mockDiagnoses = [
        { id: 1, icd10_code: 'J06.9', icd10_description: 'Upper respiratory infection' },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockDiagnoses });

      const result = await encountersApi.getDiagnoses(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/diagnoses/');
      expect(result).toEqual(mockDiagnoses);
    });
  });

  describe('getTreatmentPlan', () => {
    it('should fetch treatment plan for an encounter', async () => {
      const mockPlan = { id: 1, plan_text: 'Rest and fluids', follow_up_date: '2025-01-15' };
      mockApiClient.get.mockResolvedValue({ data: mockPlan });

      const result = await encountersApi.getTreatmentPlan(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/treatment-plan/');
      expect(result).toEqual(mockPlan);
    });

    it('should return null when treatment plan not found', async () => {
      mockApiClient.get.mockRejectedValue({ response: { status: 404 } });

      const result = await encountersApi.getTreatmentPlan(1);

      expect(result).toBeNull();
    });

    it('should throw error for other failures', async () => {
      mockApiClient.get.mockRejectedValue({ response: { status: 500 } });

      await expect(encountersApi.getTreatmentPlan(1)).rejects.toEqual({ response: { status: 500 } });
    });
  });
});

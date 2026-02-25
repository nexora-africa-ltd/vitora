/**
 * TDD Tests for Encounters API Client
 * Tests CRUD operations for encounter management
 */
import { encountersApi } from '@/lib/api/encounters';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Mock data that matches the Zod schema
const mockEncounter = {
  id: 1,
  patient: 1,
  patient_id: 1,
  patient_name: 'John Doe',
  patient_mrn: 'MRN-001',
  patient_gender: 'M' as const,
  patient_date_of_birth: '1990-01-01',
  patient_age: 36,
  encounter_type: 'OPD' as const,
  encounter_type_display: 'Outpatient',
  encounter_date: '2026-01-01',
  arrival_time: '2026-01-01T08:00:00Z',
  chief_complaint: 'Headache',
  status: 'CLOSED' as const,
  linked_encounter: null,
  visit_reason: 'NEW_COMPLAINT' as const,
  temperature: null,
  pulse: null,
  blood_pressure: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  bmi: null,
  bmi_classification: null,
  systolic_bp: null,
  diastolic_bp: null,
  has_critical_vitals: false,
  alerts: null,
  vitals_summary: null,
  vitals_source: null,
  vitals_recorded_by: null,
  vitals_recorded_at: null,
  clinical_template: null,
  clinical_template_data: null,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  notes: '',
  history_of_present_illness: null,
  physical_examination: null,
  assessment: null,
  finalized_by: null,
  finalized_by_username: null,
  finalized_at: null,
  cancellation_reason: null,
  disposition: null,
  disposition_notes: null,
  triage_status: 'NOT_APPLICABLE' as const,
  triage_requirement: null,
  triage_category: null,
  triage_completed_at: null,
  triage_bypass_reason: null,
  triage_bypassed_by: null,
  triage_bypassed_by_username: null,
  triage_bypassed_at: null,
  consultation_status: null,
  called_at: null,
  consultation_started_at: null,
  can_enter_consultation: false,
  wait_time_minutes: null,
  clinic_visit_id: null,
  created_by: 1,
  created_by_username: 'testuser',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockDiagnosis = {
  id: 1,
  encounter: 1,
  icd10_code: 456,  // This is a number FK in the schema
  icd10_code_display: 'J06.9',
  icd10_display: 'J06.9 - Upper respiratory infection',
  icd10_description: 'Upper respiratory infection',
  icd11_code: null,
  icd11_display: null,
  diagnosis_type: 'PRIMARY' as const,
  free_text_diagnosis: null,
  notes: '',
  is_confirmed: true,
  certainty: 'confirmed' as const,
  diagnosed_by: 1,
  diagnosed_by_name: 'Dr. Test',
  diagnosed_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockTreatmentPlan = {
  id: 1,
  encounter: 1,
  template: null,
  template_name: null,
  clinical_notes: '',
  medications_json: [],
  procedures_json: [],
  follow_up_instructions: 'Return if symptoms worsen',
  follow_up_date: '2025-01-15',
  diet_recommendations: '',
  activity_restrictions: '',
  referral_needed: false,
  referral_specialty: '',
  referral_notes: '',
  status: 'ACTIVE' as const,
  has_follow_up: true,
  has_referral: false,
  medications: [],
  created_by: 1,
  created_by_name: 'Dr. Test',
  approved_by: null,
  approved_by_name: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

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
            mockEncounter,
            { ...mockEncounter, id: 2, encounter_type: 'EMERGENCY' as const, chief_complaint: 'Chest pain' },
          ],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await encountersApi.list();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/', { params: undefined });
      expect(result.results).toHaveLength(2);
    });

    it('should pass filter params', async () => {
      const mockResponse = { data: { count: 0, next: null, previous: null, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await encountersApi.list({ patient: 123, status: 'CLOSED' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/', {
        params: { patient: 123, status: 'CLOSED' },
      });
    });
  });

  describe('get', () => {
    it('should fetch a single encounter by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockEncounter });

      const result = await encountersApi.get(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/');
      expect(result.id).toBe(1);
      expect(result.chief_complaint).toBe('Headache');
    });
  });

  describe('create', () => {
    it('should create a new encounter', async () => {
      const encounterData = {
        patient: 1,
        encounter_type: 'OPD' as const,
        chief_complaint: 'Fever',
      };
      const mockCreatedEncounter = { ...mockEncounter, chief_complaint: 'Fever' };
      mockApiClient.post.mockResolvedValue({ data: mockCreatedEncounter });

      const result = await encountersApi.create(encounterData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/encounters/', encounterData);
      expect(result.id).toBe(1);
    });
  });

  describe('update', () => {
    it('should update an existing encounter', async () => {
      const updateData = { chief_complaint: 'Updated complaint' };
      const mockUpdatedEncounter = { ...mockEncounter, chief_complaint: 'Updated complaint' };
      mockApiClient.patch.mockResolvedValue({ data: mockUpdatedEncounter });

      const result = await encountersApi.update(1, updateData);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/encounters/1/', updateData);
      expect(result.chief_complaint).toBe('Updated complaint');
    });
  });

  describe('getDiagnoses', () => {
    it('should fetch diagnoses for an encounter', async () => {
      // API returns paginated result but getDiagnoses extracts .results
      mockApiClient.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [mockDiagnosis] } });

      const result = await encountersApi.getDiagnoses(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/diagnoses/');
      // getDiagnoses returns the array directly (extracted from .results)
      expect(result).toHaveLength(1);
      expect(result[0].icd10_code_display).toBe('J06.9');
    });
  });

  describe('getTreatmentPlan', () => {
    it('should fetch treatment plan for an encounter', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockTreatmentPlan });

      const result = await encountersApi.getTreatmentPlan(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/1/treatment-plan/');
      expect(result?.follow_up_instructions).toBe('Return if symptoms worsen');
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

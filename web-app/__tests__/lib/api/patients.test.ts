/**
 * TDD Tests for Patients API Client
 * Tests CRUD operations for patient management
 */
import { patientsApi } from '@/lib/api/patients';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Mock data that matches the Zod schema
const mockPatientListItem = {
  id: 1,
  mrn: 'MRN-001',
  cr_number: null,
  sha_number: null,
  title: 'Mr',
  first_name: 'John',
  middle_name: null,
  last_name: 'Doe',
  full_name: 'John Doe',
  date_of_birth: '1990-01-01',
  age: 36,
  gender: 'M' as const,
  phone_number: '0712345678',
  county_name: 'Nairobi',
  sub_county_name: 'Westlands',
  is_sensitive: false,
  created_at: '2026-01-01T00:00:00Z',
};

const mockPatient = {
  ...mockPatientListItem,
  place_of_birth: null,
  citizenship: null,
  is_person_with_disability: false,
  identification_type: null,
  identification_number: null,
  national_id: null,
  email: null,
  address: null,
  county: 1,
  sub_county: 1,
  ward: null,
  payment_mode: 'cash' as const,
  referral_source: 'self' as const,
  consent_given: false,
  consent_date: null,
  registered_by: null,
  registered_by_name: null,
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Patients API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPatients', () => {
    it('should fetch patients list with default params', async () => {
      const mockResponse = {
        data: {
          count: 10,
          next: null,
          previous: null,
          results: [mockPatientListItem],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await patientsApi.getPatients();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/?');
      expect(result.results).toHaveLength(1);
    });

    it('should include search params when provided', async () => {
      const mockResponse = { data: { count: 0, next: null, previous: null, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await patientsApi.getPatients({ search: 'john', page: 2, page_size: 20 });

      const url = mockApiClient.get.mock.calls[0]?.[0];
      expect(url).toContain('search=john');
      expect(url).toContain('page=2');
      expect(url).toContain('page_size=20');
    });

    it('should include gender filter when provided', async () => {
      const mockResponse = { data: { count: 0, next: null, previous: null, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await patientsApi.getPatients({ gender: 'M' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('gender=M');
    });
  });

  describe('getPatient', () => {
    it('should fetch a single patient by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockPatient });

      const result = await patientsApi.getPatient(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/1/');
      expect(result.mrn).toBe('MRN-001');
      expect(result.first_name).toBe('John');
    });
  });

  describe('createPatient', () => {
    it('should create a new patient', async () => {
      const patientData = {
        first_name: 'Jane',
        last_name: 'Smith',
        date_of_birth: '1990-05-15',
        gender: 'F' as const,
        county: 1,
        sub_county: 1,
      };
      const mockCreatedPatient = {
        ...mockPatient,
        id: 2,
        mrn: 'MRN-002',
        first_name: 'Jane',
        last_name: 'Smith',
        full_name: 'Jane Smith',
        gender: 'F' as const,
        date_of_birth: '1990-05-15',
      };
      mockApiClient.post.mockResolvedValue({ data: mockCreatedPatient });

      const result = await patientsApi.createPatient(patientData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/patients/', patientData, { headers: {} });
      expect(result.mrn).toBe('MRN-002');
    });
  });

  describe('updatePatient', () => {
    it('should update an existing patient', async () => {
      const updateData = { first_name: 'Janet' };
      const mockUpdatedPatient = {
        ...mockPatient,
        first_name: 'Janet',
        full_name: 'Janet Doe',
      };
      mockApiClient.patch.mockResolvedValue({ data: mockUpdatedPatient });

      const result = await patientsApi.updatePatient(1, updateData);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/patients/1/', updateData);
      expect(result.first_name).toBe('Janet');
    });
  });

  describe('deletePatient', () => {
    it('should delete a patient', async () => {
      mockApiClient.delete.mockResolvedValue({});

      await patientsApi.deletePatient(1);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/patients/1/');
    });
  });

  describe('getEmergencyContacts', () => {
    it('should fetch emergency contacts for a patient', async () => {
      const mockContacts = [
        {
          id: 1,
          full_name: 'Jane Doe',
          relationship: 'Spouse',
          phone_number: '0712345678',
          alternative_phone: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockContacts });

      const result = await patientsApi.getEmergencyContacts(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/1/emergency-contacts/');
      expect(result).toEqual(mockContacts);
    });
  });

  describe('getEncounters', () => {
    it('should fetch encounters for a patient', async () => {
      const mockEncounters = [
        {
          id: 1,
          encounter_type: 'OPD',
          status: 'CLOSED' as const,
          encounter_date: '2026-01-01',
          chief_complaint: 'Headache',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];
      mockApiClient.get.mockResolvedValue({ data: { results: mockEncounters } });

      const result = await patientsApi.getEncounters(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/?patient=1');
      expect(result).toEqual(mockEncounters);
    });
  });
});

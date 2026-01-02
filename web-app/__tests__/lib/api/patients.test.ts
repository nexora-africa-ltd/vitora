/**
 * TDD Tests for Patients API Client
 * Tests CRUD operations for patient management
 */
import { patientsApi } from '@/lib/api/patients';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

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
          results: [{ id: 1, mrn: 'MRN-001', first_name: 'John' }],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await patientsApi.getPatients();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/?');
      expect(result.results).toHaveLength(1);
    });

    it('should include search params when provided', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await patientsApi.getPatients({ search: 'john', page: 2, page_size: 20 });

      const url = mockApiClient.get.mock.calls[0]?.[0];
      expect(url).toContain('search=john');
      expect(url).toContain('page=2');
      expect(url).toContain('page_size=20');
    });

    it('should include gender filter when provided', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await patientsApi.getPatients({ gender: 'M' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('gender=M');
    });
  });

  describe('getPatient', () => {
    it('should fetch a single patient by ID', async () => {
      const mockPatient = { id: 1, mrn: 'MRN-001', first_name: 'John', last_name: 'Doe' };
      mockApiClient.get.mockResolvedValue({ data: mockPatient });

      const result = await patientsApi.getPatient(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/1/');
      expect(result).toEqual(mockPatient);
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
      const mockResponse = { id: 2, mrn: 'MRN-002', ...patientData };
      mockApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await patientsApi.createPatient(patientData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/patients/', patientData);
      expect(result.mrn).toBe('MRN-002');
    });
  });

  describe('updatePatient', () => {
    it('should update an existing patient', async () => {
      const updateData = { first_name: 'Janet' };
      const mockResponse = { id: 1, mrn: 'MRN-001', first_name: 'Janet' };
      mockApiClient.patch.mockResolvedValue({ data: mockResponse });

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
        { id: 1, name: 'Jane Doe', phone: '0712345678', relationship: 'Spouse' },
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
        { id: 1, encounter_type: 'OPD', chief_complaint: 'Headache' },
      ];
      mockApiClient.get.mockResolvedValue({ data: { results: mockEncounters } });

      const result = await patientsApi.getEncounters(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/encounters/?patient=1');
      expect(result).toEqual(mockEncounters);
    });
  });
});

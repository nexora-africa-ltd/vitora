/**
 * Patient API Tests
 *
 * Tests for patient CRUD API methods.
 * Following TDD RED-GREEN-REFACTOR approach.
 */

import { patientsApi, Patient, PatientListResponse, CreatePatientData } from '../../lib/api/patients';
import { getApiClient } from '../../lib/api/client';

// Mock the API client
jest.mock('../../lib/api/client', () => ({
  getApiClient: jest.fn(),
}));

const mockGetApiClient = getApiClient as jest.MockedFunction<typeof getApiClient>;

describe('Patients API Tests', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };
    mockGetApiClient.mockReturnValue(mockClient);
  });

  describe('list', () => {
    test('should fetch paginated patient list', async () => {
      const mockResponse = {
        data: {
          count: 100,
          next: 'http://api/patients/?page=2',
          previous: null,
          results: [
            { id: 1, mrn: 'MRN-20251230-0001', first_name: 'John', last_name: 'Doe' },
            { id: 2, mrn: 'MRN-20251230-0002', first_name: 'Jane', last_name: 'Doe' },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await patientsApi.list();

      expect(mockClient.get).toHaveBeenCalledWith('/api/patients/', { params: undefined });
      expect(result.count).toBe(100);
      expect(result.results).toHaveLength(2);
    });

    test('should support pagination parameters', async () => {
      mockClient.get.mockResolvedValue({ data: { count: 0, results: [] } });

      await patientsApi.list({ page: 2, page_size: 20 });

      expect(mockClient.get).toHaveBeenCalledWith('/api/patients/', {
        params: { page: 2, page_size: 20 },
      });
    });

    test('should support search filter', async () => {
      mockClient.get.mockResolvedValue({ data: { count: 0, results: [] } });

      await patientsApi.list({ search: 'John' });

      expect(mockClient.get).toHaveBeenCalledWith('/api/patients/', {
        params: { search: 'John' },
      });
    });
  });

  describe('get', () => {
    test('should fetch single patient by ID', async () => {
      const mockPatient = {
        id: 1,
        mrn: 'MRN-20251230-0001',
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1990-01-15',
        gender: 'M',
        county: 1,
        sub_county: 1,
      };
      mockClient.get.mockResolvedValue({ data: mockPatient });

      const result = await patientsApi.get(1);

      expect(mockClient.get).toHaveBeenCalledWith('/api/patients/1/');
      expect(result.mrn).toBe('MRN-20251230-0001');
      expect(result.first_name).toBe('John');
    });

    test('should throw error for non-existent patient', async () => {
      mockClient.get.mockRejectedValue({
        response: { status: 404, data: { detail: 'Not found.' } },
      });

      await expect(patientsApi.get(999)).rejects.toBeDefined();
    });
  });

  describe('create', () => {
    test('should create new patient', async () => {
      const newPatient: CreatePatientData = {
        first_name: 'Alice',
        last_name: 'Smith',
        date_of_birth: '1985-06-20',
        gender: 'F',
        county: 1,
        sub_county: 5,
      };

      const mockResponse = {
        id: 3,
        mrn: 'MRN-20251230-0003',
        ...newPatient,
      };
      mockClient.post.mockResolvedValue({ data: mockResponse });

      const result = await patientsApi.create(newPatient);

      expect(mockClient.post).toHaveBeenCalledWith('/api/patients/', newPatient);
      expect(result.id).toBe(3);
      expect(result.mrn).toBe('MRN-20251230-0003');
    });

    test('should handle validation errors', async () => {
      mockClient.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            date_of_birth: ['Date cannot be in the future.'],
          },
        },
      });

      await expect(
        patientsApi.create({
          first_name: 'Test',
          last_name: 'User',
          date_of_birth: '2030-01-01',
          gender: 'M',
          county: 1,
          sub_county: 1,
        })
      ).rejects.toBeDefined();
    });
  });

  describe('update', () => {
    test('should update patient with partial data', async () => {
      const updates = { phone_number: '+254700000000' };
      mockClient.patch.mockResolvedValue({
        data: {
          id: 1,
          mrn: 'MRN-20251230-0001',
          first_name: 'John',
          phone_number: '+254700000000',
        },
      });

      const result = await patientsApi.update(1, updates);

      expect(mockClient.patch).toHaveBeenCalledWith('/api/patients/1/', updates);
      expect(result.phone_number).toBe('+254700000000');
    });
  });

  describe('delete', () => {
    test('should delete patient', async () => {
      mockClient.delete.mockResolvedValue({ data: {} });

      await patientsApi.delete(1);

      expect(mockClient.delete).toHaveBeenCalledWith('/api/patients/1/');
    });
  });

  describe('getByMrn', () => {
    test('should search patient by MRN', async () => {
      mockClient.get.mockResolvedValue({
        data: {
          count: 1,
          results: [{ id: 1, mrn: 'MRN-20251230-0001', first_name: 'John' }],
        },
      });

      const result = await patientsApi.getByMrn('MRN-20251230-0001');

      expect(mockClient.get).toHaveBeenCalledWith('/api/patients/', {
        params: { mrn: 'MRN-20251230-0001' },
      });
      expect(result).toBeDefined();
      expect(result?.mrn).toBe('MRN-20251230-0001');
    });

    test('should return null when MRN not found', async () => {
      mockClient.get.mockResolvedValue({ data: { count: 0, results: [] } });

      const result = await patientsApi.getByMrn('MRN-NONEXISTENT');

      expect(result).toBeNull();
    });
  });
});

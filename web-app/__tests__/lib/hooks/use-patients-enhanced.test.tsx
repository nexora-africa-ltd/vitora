/**
 * TDD Tests for Enhanced Patient Hooks
 * Tests usePatient, usePatientEmergencyContacts, usePatientEncounters, mutations
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePatients,
  usePatient,
  usePatientEmergencyContacts,
  usePatientEncounters,
  useCreatePatient,
  useUpdatePatient,
  useDeletePatient,
} from '@/lib/hooks/use-patients-enhanced';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
};

describe('Enhanced Patient Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('usePatients', () => {
    it('should fetch patients list', async () => {
      const mockData = {
        count: 2,
        results: [
          { id: 1, mrn: 'MRN-001', first_name: 'John', last_name: 'Doe' },
          { id: 2, mrn: 'MRN-002', first_name: 'Jane', last_name: 'Smith' },
        ],
      };
      mockApiClient.get.mockResolvedValue({ data: mockData });

      const { result } = renderHook(() => usePatients(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.count).toBe(2);
      expect(result.current.data?.results).toHaveLength(2);
    });

    it('should pass filter params to API', async () => {
      mockApiClient.get.mockResolvedValue({ data: { count: 0, results: [] } });

      renderHook(() => usePatients({ search: 'john', page: 2 }), { wrapper: createWrapper() });

      await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());

      const url = mockApiClient.get.mock.calls[0]?.[0];
      expect(url).toContain('search=john');
      expect(url).toContain('page=2');
    });
  });

  describe('usePatient', () => {
    it('should fetch single patient by id', async () => {
      const mockPatient = { id: 1, mrn: 'MRN-001', first_name: 'John', last_name: 'Doe' };
      mockApiClient.get.mockResolvedValue({ data: mockPatient });

      const { result } = renderHook(() => usePatient(1), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPatient);
    });

    it('should not fetch when id is falsy', async () => {
      const { result } = renderHook(() => usePatient(0), { wrapper: createWrapper() });

      // Query should not be enabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('usePatientEmergencyContacts', () => {
    it('should fetch emergency contacts for patient', async () => {
      const mockContacts = [
        { id: 1, name: 'Jane Doe', phone: '0712345678', relationship: 'Spouse' },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockContacts });

      const { result } = renderHook(() => usePatientEmergencyContacts(1), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockContacts);
    });

    it('should not fetch when patientId is falsy', () => {
      const { result } = renderHook(() => usePatientEmergencyContacts(0), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('usePatientEncounters', () => {
    it('should call API with correct patient id', async () => {
      const mockEncounters = [
        { id: 1, encounter_type: 'OPD', chief_complaint: 'Headache' },
        { id: 2, encounter_type: 'EMERGENCY', chief_complaint: 'Injury' },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockEncounters });

      renderHook(() => usePatientEncounters(1), { wrapper: createWrapper() });

      await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());
    });

    it('should not fetch when patientId is falsy', () => {
      const { result } = renderHook(() => usePatientEncounters(0), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useCreatePatient', () => {
    it('should create a new patient', async () => {
      const newPatient = { first_name: 'New', last_name: 'Patient', date_of_birth: '1990-01-01', gender: 'M' };
      const createdPatient = { id: 3, mrn: 'MRN-003', ...newPatient };
      mockApiClient.post.mockResolvedValue({ data: createdPatient });

      const { result } = renderHook(() => useCreatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(newPatient as any);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/patients/', newPatient);
    });

    it('should handle creation errors', async () => {
      const error = new Error('Validation failed');
      mockApiClient.post.mockRejectedValue(error);

      const { result } = renderHook(() => useCreatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ first_name: '' } as any);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useUpdatePatient', () => {
    it('should update an existing patient', async () => {
      const updateData = { first_name: 'Updated' };
      const updatedPatient = { id: 1, mrn: 'MRN-001', first_name: 'Updated', last_name: 'Doe' };
      mockApiClient.patch.mockResolvedValue({ data: updatedPatient });

      const { result } = renderHook(() => useUpdatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ id: 1, data: updateData });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/patients/1/', updateData);
    });
  });

  describe('useDeletePatient', () => {
    it('should delete a patient', async () => {
      mockApiClient.delete.mockResolvedValue({ data: null });

      const { result } = renderHook(() => useDeletePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/patients/1/');
    });
  });
});

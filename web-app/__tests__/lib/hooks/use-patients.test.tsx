/**
 * TDD Tests for Patient Hooks
 *
 * Tests for consolidated patient hooks:
 * - usePatients, usePatient (read)
 * - usePatientEmergencyContacts, usePatientEncounters (related)
 * - useCreatePatient, useUpdatePatient, useDeletePatient (mutations)
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
} from '@/lib/hooks/use-patients';
import { patientsApi } from '@/lib/api/patients';

jest.mock('@/lib/api/patients');

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;

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

describe('Patient Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // usePatients
  // ===========================================================================
  describe('usePatients', () => {
    it('should fetch patients list', async () => {
      const mockPatients = {
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 1, mrn: 'MRN-001', first_name: 'John' },
          { id: 2, mrn: 'MRN-002', first_name: 'Jane' },
        ],
      };
      mockPatientsApi.getPatients.mockResolvedValue(mockPatients as any);

      const { result } = renderHook(() => usePatients(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.results).toHaveLength(2);
    });

    it('should pass filter params to API', async () => {
      mockPatientsApi.getPatients.mockResolvedValue({ count: 0, results: [] } as any);

      renderHook(() => usePatients({ search: 'john', page: 2 }), { wrapper: createWrapper() });

      await waitFor(() => expect(mockPatientsApi.getPatients).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'john', page: 2 })
      ));
    });

    it('should handle API errors', async () => {
      const error = new Error('Network error');
      mockPatientsApi.getPatients.mockRejectedValue(error);

      const { result } = renderHook(() => usePatients(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ===========================================================================
  // usePatient
  // ===========================================================================
  describe('usePatient', () => {
    it('should fetch single patient by id', async () => {
      const mockPatient = { id: 1, mrn: 'MRN-001', first_name: 'John', last_name: 'Doe' };
      mockPatientsApi.getPatient.mockResolvedValue(mockPatient as any);

      const { result } = renderHook(() => usePatient(1), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPatient);
    });

    it('should accept string id and convert to number', async () => {
      const mockPatient = { id: 1, mrn: 'MRN-001', first_name: 'John' };
      mockPatientsApi.getPatient.mockResolvedValue(mockPatient as any);

      const { result } = renderHook(() => usePatient('1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockPatientsApi.getPatient).toHaveBeenCalledWith(1);
    });

    it('should not fetch when id is falsy', async () => {
      const { result } = renderHook(() => usePatient(0), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ===========================================================================
  // usePatientEmergencyContacts
  // ===========================================================================
  describe('usePatientEmergencyContacts', () => {
    it('should fetch emergency contacts for patient', async () => {
      const mockContacts = [
        { id: 1, name: 'Jane Doe', phone: '0712345678', relationship: 'Spouse' },
      ];
      mockPatientsApi.getEmergencyContacts.mockResolvedValue(mockContacts as any);

      const { result } = renderHook(() => usePatientEmergencyContacts(1), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockContacts);
    });

    it('should not fetch when patientId is falsy', () => {
      const { result } = renderHook(() => usePatientEmergencyContacts(0), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ===========================================================================
  // usePatientEncounters
  // ===========================================================================
  describe('usePatientEncounters', () => {
    it('should fetch encounters for patient', async () => {
      const mockEncounters = [
        { id: 1, encounter_type: 'OPD', chief_complaint: 'Headache' },
        { id: 2, encounter_type: 'EMERGENCY', chief_complaint: 'Injury' },
      ];
      mockPatientsApi.getEncounters.mockResolvedValue(mockEncounters as any);

      const { result } = renderHook(() => usePatientEncounters(1), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(2);
    });

    it('should not fetch when patientId is falsy', () => {
      const { result } = renderHook(() => usePatientEncounters(0), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ===========================================================================
  // useCreatePatient
  // ===========================================================================
  describe('useCreatePatient', () => {
    it('should create a new patient', async () => {
      const newPatient = { first_name: 'New', last_name: 'Patient', date_of_birth: '1990-01-01', gender: 'M' };
      const createdPatient = { id: 3, mrn: 'MRN-003', ...newPatient };
      mockPatientsApi.createPatient.mockResolvedValue(createdPatient as any);

      const { result } = renderHook(() => useCreatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ data: newPatient as any });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatientsApi.createPatient).toHaveBeenCalledWith(newPatient, undefined);
    });

    it('should pass idempotency key when provided', async () => {
      const newPatient = { first_name: 'New', last_name: 'Patient' };
      mockPatientsApi.createPatient.mockResolvedValue({ id: 1, ...newPatient } as any);

      const { result } = renderHook(() => useCreatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ data: newPatient as any, idempotencyKey: 'test-key-123' });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatientsApi.createPatient).toHaveBeenCalledWith(newPatient, 'test-key-123');
    });

    it('should handle creation errors', async () => {
      const error = new Error('Validation failed');
      mockPatientsApi.createPatient.mockRejectedValue(error);

      const { result } = renderHook(() => useCreatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ data: { first_name: '' } as any });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ===========================================================================
  // useUpdatePatient
  // ===========================================================================
  describe('useUpdatePatient', () => {
    it('should update an existing patient', async () => {
      const updateData = { first_name: 'Updated' };
      const updatedPatient = { id: 1, mrn: 'MRN-001', first_name: 'Updated', last_name: 'Doe' };
      mockPatientsApi.updatePatient.mockResolvedValue(updatedPatient as any);

      const { result } = renderHook(() => useUpdatePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ id: 1, data: updateData });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatientsApi.updatePatient).toHaveBeenCalledWith(1, updateData);
    });
  });

  // ===========================================================================
  // useDeletePatient
  // ===========================================================================
  describe('useDeletePatient', () => {
    it('should delete a patient', async () => {
      mockPatientsApi.deletePatient.mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeletePatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatientsApi.deletePatient).toHaveBeenCalledWith(1);
    });
  });
});

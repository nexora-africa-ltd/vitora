/**
 * Patient Hooks Tests
 *
 * Tests for useCreatePatient and useUpdatePatient hooks.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreatePatient } from '../../hooks/useCreatePatient';
import { useUpdatePatient } from '../../hooks/useUpdatePatient';
import { patientsApi } from '../../lib/api/patients';

// Mock the patients API
jest.mock('../../lib/api/patients', () => ({
  patientsApi: {
    create: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;

// Create a wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Patient Mutation Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useCreatePatient', () => {
    const mockPatient = {
      id: 1,
      mrn: 'MRN-20251230-0001',
      first_name: 'John',
      last_name: 'Doe',
      date_of_birth: '1990-01-15',
      gender: 'M' as const,
      county: 1,
      sub_county: 1,
      created_at: '2025-12-30T10:00:00Z',
    };

    const createData = {
      first_name: 'John',
      last_name: 'Doe',
      date_of_birth: '1990-01-15',
      gender: 'M' as const,
      county: 1,
      sub_county: 1,
    };

    test('should create patient successfully', async () => {
      mockPatientsApi.create.mockResolvedValue(mockPatient);
      
      const { result } = renderHook(() => useCreatePatient(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(createData);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPatientsApi.create).toHaveBeenCalledWith(createData);
      expect(result.current.data).toEqual(mockPatient);
    });

    test('should call onSuccess callback when provided', async () => {
      mockPatientsApi.create.mockResolvedValue(mockPatient);
      const mockOnSuccess = jest.fn();

      const { result } = renderHook(
        () => useCreatePatient({ onSuccess: mockOnSuccess }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.mutate(createData);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockOnSuccess).toHaveBeenCalledWith(mockPatient);
    });

    test('should call onError callback when API fails', async () => {
      const error = new Error('API Error');
      mockPatientsApi.create.mockRejectedValue(error);
      const mockOnError = jest.fn();

      const { result } = renderHook(
        () => useCreatePatient({ onError: mockOnError }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.mutate(createData);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockOnError).toHaveBeenCalledWith(error);
    });

    test('should start with isPending false', async () => {
      const { result } = renderHook(() => useCreatePatient(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);
    });
  });

  describe('useUpdatePatient', () => {
    const mockPatient = {
      id: 1,
      mrn: 'MRN-20251230-0001',
      first_name: 'Jane',
      last_name: 'Doe',
      date_of_birth: '1990-01-15',
      gender: 'F' as const,
      county: 1,
      sub_county: 1,
      created_at: '2025-12-30T10:00:00Z',
    };

    const updateInput = {
      id: 1,
      data: { first_name: 'Jane' },
    };

    test('should update patient successfully', async () => {
      mockPatientsApi.update.mockResolvedValue(mockPatient);

      const { result } = renderHook(() => useUpdatePatient(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(updateInput);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPatientsApi.update).toHaveBeenCalledWith(1, { first_name: 'Jane' });
      expect(result.current.data).toEqual(mockPatient);
    });

    test('should call onSuccess callback when provided', async () => {
      mockPatientsApi.update.mockResolvedValue(mockPatient);
      const mockOnSuccess = jest.fn();

      const { result } = renderHook(
        () => useUpdatePatient({ onSuccess: mockOnSuccess }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.mutate(updateInput);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockOnSuccess).toHaveBeenCalledWith(mockPatient);
    });

    test('should call onError callback when API fails', async () => {
      const error = new Error('Update failed');
      mockPatientsApi.update.mockRejectedValue(error);
      const mockOnError = jest.fn();

      const { result } = renderHook(
        () => useUpdatePatient({ onError: mockOnError }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.mutate(updateInput);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockOnError).toHaveBeenCalledWith(error);
    });

    test('should start with isPending false', async () => {
      const { result } = renderHook(() => useUpdatePatient(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);
    });

    test('should handle partial update data', async () => {
      mockPatientsApi.update.mockResolvedValue(mockPatient);

      const { result } = renderHook(() => useUpdatePatient(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({
          id: 1,
          data: { phone_number: '+254712345678' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPatientsApi.update).toHaveBeenCalledWith(1, {
        phone_number: '+254712345678',
      });
    });
  });
});

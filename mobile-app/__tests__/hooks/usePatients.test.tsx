/**
 * Additional Hooks Tests
 * 
 * Tests for usePatient and usePatients hooks to improve branch coverage.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePatients, patientKeys } from '../../hooks/usePatients';
import { usePatient } from '../../hooks/usePatient';
import { patientsApi } from '../../lib/api/patients';

// Mock the patients API
jest.mock('../../lib/api/patients', () => ({
  patientsApi: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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

const mockPatientsList = {
  count: 2,
  next: null,
  previous: null,
  results: [
    mockPatient,
    { ...mockPatient, id: 2, mrn: 'MRN-20251230-0002', first_name: 'Jane' },
  ],
};

describe('usePatients Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch patients list', async () => {
    mockPatientsApi.list.mockResolvedValue(mockPatientsList);

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPatientsApi.list).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockPatientsList);
  });

  test('should handle search parameter', async () => {
    mockPatientsApi.list.mockResolvedValue(mockPatientsList);

    const { result } = renderHook(() => usePatients({ search: 'John' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPatientsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'John' })
    );
  });

  test('should handle pagination parameters', async () => {
    mockPatientsApi.list.mockResolvedValue(mockPatientsList);

    const { result } = renderHook(() => usePatients({ page: 2, page_size: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPatientsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, page_size: 20 })
    );
  });

  test('should handle API error', async () => {
    const error = new Error('Network error');
    mockPatientsApi.list.mockRejectedValue(error);

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  test('should start with loading state', () => {
    mockPatientsApi.list.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });
});

describe('usePatient Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch single patient', async () => {
    mockPatientsApi.get.mockResolvedValue(mockPatient);

    const { result } = renderHook(() => usePatient(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPatientsApi.get).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual(mockPatient);
  });

  test('should not fetch when disabled', async () => {
    const { result } = renderHook(() => usePatient(1, false), {
      wrapper: createWrapper(),
    });

    // Should remain in initial state without fetching
    expect(mockPatientsApi.get).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  test('should not fetch when id is zero', async () => {
    const { result } = renderHook(() => usePatient(0), {
      wrapper: createWrapper(),
    });

    // Should not fetch for invalid id
    expect(mockPatientsApi.get).not.toHaveBeenCalled();
  });

  test('should handle patient not found', async () => {
    const error = new Error('Patient not found');
    mockPatientsApi.get.mockRejectedValue(error);

    const { result } = renderHook(() => usePatient(999), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('patientKeys', () => {
  test('should generate all key', () => {
    expect(patientKeys.all).toEqual(['patients']);
  });

  test('should generate lists key', () => {
    expect(patientKeys.lists()).toEqual(['patients', 'list']);
  });

  test('should generate list key with filters', () => {
    const filters = { search: 'John', page: 1 };
    expect(patientKeys.list(filters)).toEqual(['patients', 'list', filters]);
  });

  test('should generate details key', () => {
    expect(patientKeys.details()).toEqual(['patients', 'detail']);
  });

  test('should generate detail key with id', () => {
    expect(patientKeys.detail(1)).toEqual(['patients', 'detail', 1]);
  });
});

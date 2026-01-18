/**
 * TDD Tests for PatientContext and usePatient hook
 *
 * RED PHASE: These tests should FAIL initially because the implementation doesn't exist.
 *
 * Patient Context Requirements:
 * 1. Single authoritative patient context provider
 * 2. Patient identity fetched ONCE and shared across all children
 * 3. Patient data is read-only by default
 * 4. Provides patient identity (MRN, name, DOB, gender)
 * 5. Tracks SHA/KYC verification status
 * 6. Prevents multiple patients from being active simultaneously
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PatientProvider, usePatientContext } from '@/lib/context/patient-context';

// Mock the patients API
jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
    getEmergencyContacts: jest.fn(),
  },
}));

import { patientsApi } from '@/lib/api/patients';
import {
  mockPatient,
  mockPatientMinimal,
} from '../../fixtures/patient-shell-fixtures';

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;

// Helper to create QueryClient wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// Test component that consumes PatientContext
function TestPatientConsumer() {
  const context = usePatientContext();

  return (
    <div>
      <span data-testid="loading">{context.isLoading.toString()}</span>
      <span data-testid="patient-id">{context.patient?.id || 'null'}</span>
      <span data-testid="patient-mrn">{context.patient?.mrn || 'null'}</span>
      <span data-testid="patient-name">
        {context.patient ? `${context.patient.first_name} ${context.patient.last_name}` : 'null'}
      </span>
      <span data-testid="patient-dob">{context.patient?.date_of_birth || 'null'}</span>
      <span data-testid="patient-gender">{context.patient?.gender || 'null'}</span>
      <span data-testid="is-verified">{context.isVerified?.toString() || 'null'}</span>
      <span data-testid="has-sha">{context.hasSHA?.toString() || 'null'}</span>
      <span data-testid="error">{context.error?.message || 'null'}</span>
    </div>
  );
}

// =============================================================================
// Test Suite
// =============================================================================

describe('PatientContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Provider Initialization
  // ===========================================================================
  describe('Provider Initialization', () => {
    it('should throw error when usePatientContext is used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestPatientConsumer />);
      }).toThrow('usePatientContext must be used within a PatientProvider');

      consoleSpy.mockRestore();
    });

    it('should initialize with loading state when patientId is provided', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      // Initially should be loading
      expect(screen.getByTestId('loading')).toHaveTextContent('true');
    });

    it('should not fetch when patientId is null', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={null}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      expect(mockPatientsApi.getPatient).not.toHaveBeenCalled();
      expect(screen.getByTestId('patient-id')).toHaveTextContent('null');
    });
  });

  // ===========================================================================
  // 2. Patient Data Fetching
  // ===========================================================================
  describe('Patient Data Fetching', () => {
    it('should fetch patient data when patientId is provided', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(mockPatientsApi.getPatient).toHaveBeenCalledWith(1);
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });

    it('should provide patient identity data to consumers', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('patient-mrn')).toHaveTextContent('MRN-20260115-0001');
      });

      expect(screen.getByTestId('patient-name')).toHaveTextContent('Jane Doe');
      expect(screen.getByTestId('patient-dob')).toHaveTextContent('1985-05-20');
      expect(screen.getByTestId('patient-gender')).toHaveTextContent('F');
    });

    it('should handle fetch errors gracefully', async () => {
      mockPatientsApi.getPatient.mockRejectedValueOnce(new Error('Patient not found'));

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={999}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Patient not found');
      });
    });
  });

  // ===========================================================================
  // 3. SHA/KYC Verification Status
  // ===========================================================================
  describe('Verification Status', () => {
    it('should indicate SHA verification when sha_number is present', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('has-sha')).toHaveTextContent('true');
      });
    });

    it('should indicate CR verification when cr_number is present', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-verified')).toHaveTextContent('true');
      });
    });

    it('should indicate not verified when cr_number is missing', async () => {
      const unverifiedPatient = { ...mockPatient, cr_number: undefined, sha_number: undefined };
      mockPatientsApi.getPatient.mockResolvedValueOnce(unverifiedPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-verified')).toHaveTextContent('false');
        expect(screen.getByTestId('has-sha')).toHaveTextContent('false');
      });
    });
  });

  // ===========================================================================
  // 4. Single Fetch Guarantee (Context Sharing)
  // ===========================================================================
  describe('Single Fetch Guarantee', () => {
    it('should only fetch patient data once regardless of number of consumers', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      function MultipleConsumers() {
        return (
          <>
            <TestPatientConsumer />
            <TestPatientConsumer />
            <TestPatientConsumer />
          </>
        );
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <MultipleConsumers />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        const mrnElements = screen.getAllByTestId('patient-mrn');
        expect(mrnElements[0]).toHaveTextContent('MRN-20260115-0001');
      });

      // Critical: Should only fetch ONCE
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });

    it('should share patient data across deeply nested consumers', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      function DeepChild() {
        const { patient } = usePatientContext();
        return <span data-testid="deep-mrn">{patient?.mrn}</span>;
      }

      function MiddleComponent() {
        return (
          <div>
            <DeepChild />
          </div>
        );
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <div>
              <MiddleComponent />
            </div>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('deep-mrn')).toHaveTextContent('MRN-20260115-0001');
      });

      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 5. Patient Context Immutability (Read-Only by Default)
  // ===========================================================================
  describe('Read-Only Patient Data', () => {
    it('should not expose mutation methods on patient object', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      let capturedContext: ReturnType<typeof usePatientContext> | null = null;

      function ContextCapture() {
        capturedContext = usePatientContext();
        return null;
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <ContextCapture />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(capturedContext?.patient).toBeDefined();
      });

      // Context should NOT have direct mutation methods
      expect(capturedContext).not.toHaveProperty('updatePatient');
      expect(capturedContext).not.toHaveProperty('setPatient');
    });

    it('should provide patient data as readonly', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      function ContextCapture() {
        const { patient } = usePatientContext();
        return <span data-testid="captured-mrn">{patient?.mrn || 'loading'}</span>;
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <ContextCapture />
          </PatientProvider>
        </Wrapper>
      );

      // Wait for patient data to load
      await waitFor(() => {
        expect(screen.getByTestId('captured-mrn')).toHaveTextContent('MRN-20260115-0001');
      });

      // Patient data should be available and correct
      expect(screen.getByTestId('captured-mrn')).toHaveTextContent('MRN-20260115-0001');
    });
  });

  // ===========================================================================
  // 6. Patient Change Detection
  // ===========================================================================
  describe('Patient Change Detection', () => {
    it('should refetch when patientId changes', async () => {
      const patient2 = { ...mockPatient, id: 2, mrn: 'MRN-20260115-0002', first_name: 'John' };
      mockPatientsApi.getPatient
        .mockResolvedValueOnce(mockPatient)
        .mockResolvedValueOnce(patient2);

      const Wrapper = createWrapper();
      const { rerender } = render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('patient-mrn')).toHaveTextContent('MRN-20260115-0001');
      });

      // Change patient
      rerender(
        <Wrapper>
          <PatientProvider patientId={2}>
            <TestPatientConsumer />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('patient-mrn')).toHaveTextContent('MRN-20260115-0002');
      });

      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(2);
    });
  });
});

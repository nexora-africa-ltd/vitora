/**
 * TDD Tests for Patient Shell Route Layout
 *
 * RED PHASE: These tests should FAIL initially because the implementation doesn't exist.
 *
 * Patient Shell Layout Requirements:
 * 1. Wrap all /patients/[id]/* routes with PatientProvider
 * 2. Display PatientShellHeader on all patient routes
 * 3. Persist patient context across child route navigation
 * 4. Extract patientId from route params and pass to provider
 * 5. Handle invalid patientId gracefully
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useParams, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  })),
  usePathname: jest.fn(() => '/patients/1'),
}));

// Mock APIs
jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
    getEmergencyContacts: jest.fn(),
  },
}));

import { patientsApi } from '@/lib/api/patients';
import PatientLayout from '@/app/(dashboard)/patients/[id]/layout';
import { mockPatient } from '../../fixtures/patient-shell-fixtures';

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;

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

// =============================================================================
// Test Suite
// =============================================================================

describe('Patient Shell Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ id: '1' });
  });

  // ===========================================================================
  // 1. Layout Structure
  // ===========================================================================
  describe('Layout Structure', () => {
    it('should render PatientShellHeader', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <div data-testid="child-content">Child Content</div>
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show patient header with MRN
        expect(screen.getByText('MRN-20260115-0001')).toBeInTheDocument();
      });
    });

    it('should render children content', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <div data-testid="child-content">Child Content</div>
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('child-content')).toBeInTheDocument();
      });
    });

    it('should extract patientId from route params', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);
      mockUseParams.mockReturnValue({ id: '42' });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <div>Content</div>
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(mockPatientsApi.getPatient).toHaveBeenCalledWith(42);
      });
    });
  });

  // ===========================================================================
  // 2. Provider Wrapping
  // ===========================================================================
  describe('Provider Wrapping', () => {
    it('should wrap children with PatientProvider', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      // Child component that uses patient context
      function ChildUsingContext() {
        // This import would fail if not wrapped in PatientProvider
        const { usePatientContext } = require('@/lib/context/patient-context');
        const { patient } = usePatientContext();
        return <div data-testid="context-mrn">{patient?.mrn}</div>;
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <ChildUsingContext />
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('context-mrn')).toHaveTextContent('MRN-20260115-0001');
      });
    });

    it('should provide same patient data to header and children', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      function ChildComponent() {
        const { usePatientContext } = require('@/lib/context/patient-context');
        const { patient } = usePatientContext();
        return <div data-testid="child-name">{patient?.first_name}</div>;
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <ChildComponent />
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        // Both header and child should show Jane
        expect(screen.getByText('Jane Doe')).toBeInTheDocument(); // Header
        expect(screen.getByTestId('child-name')).toHaveTextContent('Jane'); // Child
      });

      // Critical: Should only fetch ONCE
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 3. Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should handle invalid patientId gracefully', async () => {
      mockUseParams.mockReturnValue({ id: 'invalid' });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <div>Content</div>
          </PatientLayout>
        </Wrapper>
      );

      // Should show error alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText(/Invalid patient ID/i)).toBeInTheDocument();
    });

    it('should handle missing patientId in params', async () => {
      mockUseParams.mockReturnValue({});

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <div>Content</div>
          </PatientLayout>
        </Wrapper>
      );

      // Should show error alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText(/Invalid patient ID/i)).toBeInTheDocument();
    });

    it('should handle patient not found error', async () => {
      mockPatientsApi.getPatient.mockRejectedValueOnce(new Error('Patient not found'));

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientLayout>
            <div>Content</div>
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText('Patient not found')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 4. Context Persistence
  // ===========================================================================
  describe('Context Persistence', () => {
    it('should maintain patient context across child rerenders', async () => {
      mockPatientsApi.getPatient.mockResolvedValue(mockPatient);

      let renderCount = 0;
      function ChildWithCounter() {
        renderCount++;
        const { usePatientContext } = require('@/lib/context/patient-context');
        const { patient } = usePatientContext();
        return <div data-testid="render-count">{renderCount}</div>;
      }

      const Wrapper = createWrapper();
      const { rerender } = render(
        <Wrapper>
          <PatientLayout>
            <ChildWithCounter />
          </PatientLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('MRN-20260115-0001')).toBeInTheDocument();
      });

      // Force rerender
      rerender(
        <Wrapper>
          <PatientLayout>
            <ChildWithCounter />
          </PatientLayout>
        </Wrapper>
      );

      // Should still have patient data and only fetch once
      expect(screen.getByText('MRN-20260115-0001')).toBeInTheDocument();
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });
  });
});

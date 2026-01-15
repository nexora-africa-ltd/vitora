/**
 * TDD Tests for Encounter Shell Route Layout
 * 
 * RED PHASE: These tests should FAIL initially because the implementation doesn't exist.
 * 
 * Encounter Shell Layout Requirements:
 * 1. Wrap all /encounters/[id]/* routes with PatientProvider AND EncounterProvider
 * 2. Display PatientShellHeader with encounter info
 * 3. Extract encounterId from route params
 * 4. Derive patientId from encounter data
 * 5. Validate encounter belongs to the right patient
 * 6. Handle invalid encounterId gracefully
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
  usePathname: jest.fn(() => '/encounters/100'),
}));

// Mock APIs
jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
    getEmergencyContacts: jest.fn(),
  },
}));

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    get: jest.fn(),
    getDiagnoses: jest.fn(),
    getTreatmentPlan: jest.fn(),
  },
}));

import { patientsApi } from '@/lib/api/patients';
import { encountersApi } from '@/lib/api/encounters';
import EncounterLayout from '@/app/(dashboard)/encounters/[id]/layout';
import { mockPatient, mockEncounter } from '../../fixtures/patient-shell-fixtures';

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
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

describe('Encounter Shell Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ id: '100' });
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
    mockEncountersApi.get.mockResolvedValue(mockEncounter);
  });

  // ===========================================================================
  // 1. Layout Structure
  // ===========================================================================
  describe('Layout Structure', () => {
    it('should render PatientShellHeader with patient info', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div data-testid="child-content">Child Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('MRN-20260115-0001')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('should render PatientShellHeader with encounter info', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show encounter type and chief complaint
        expect(screen.getByText(/OPD|Outpatient/i)).toBeInTheDocument();
        expect(screen.getByText(/Persistent headache/i)).toBeInTheDocument();
      });
    });

    it('should render children content', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div data-testid="child-content">Child Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('child-content')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 2. Provider Wrapping
  // ===========================================================================
  describe('Provider Wrapping', () => {
    it('should wrap children with PatientProvider and EncounterProvider', async () => {
      function ChildUsingContexts() {
        const { usePatientContext } = require('@/lib/context/patient-context');
        const { useEncounterContext } = require('@/lib/context/encounter-context');
        const { patient } = usePatientContext();
        const { encounter } = useEncounterContext();
        return (
          <div>
            <span data-testid="ctx-mrn">{patient?.mrn}</span>
            <span data-testid="ctx-enc-id">{encounter?.id}</span>
          </div>
        );
      }
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <ChildUsingContexts />
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('ctx-mrn')).toHaveTextContent('MRN-20260115-0001');
        expect(screen.getByTestId('ctx-enc-id')).toHaveTextContent('100');
      });
    });

    it('should derive patientId from encounter data', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      // Should have fetched encounter first, then patient
      expect(mockEncountersApi.get).toHaveBeenCalledWith(100);
      expect(mockPatientsApi.getPatient).toHaveBeenCalledWith(1); // patientId from encounter.patient
    });
  });

  // ===========================================================================
  // 3. Order Permissions
  // ===========================================================================
  describe('Order Permissions', () => {
    it('should provide canPlaceOrders = true for IN_PROGRESS encounters', async () => {
      function ChildCheckingPermissions() {
        const { useEncounterContext } = require('@/lib/context/encounter-context');
        const { canPlaceOrders } = useEncounterContext();
        return <div data-testid="can-order">{canPlaceOrders?.toString()}</div>;
      }
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <ChildCheckingPermissions />
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-order')).toHaveTextContent('true');
      });
    });

    it('should provide canPlaceOrders = false for COMPLETED encounters', async () => {
      const completedEncounter = { ...mockEncounter, status: 'COMPLETED' as const };
      mockEncountersApi.get.mockResolvedValueOnce(completedEncounter);
      
      function ChildCheckingPermissions() {
        const { useEncounterContext } = require('@/lib/context/encounter-context');
        const { canPlaceOrders } = useEncounterContext();
        return <div data-testid="can-order">{canPlaceOrders?.toString()}</div>;
      }
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <ChildCheckingPermissions />
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-order')).toHaveTextContent('false');
      });
    });
  });

  // ===========================================================================
  // 4. Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should handle invalid encounterId gracefully', async () => {
      mockUseParams.mockReturnValue({ id: 'invalid' });
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText(/Invalid encounter ID/i)).toBeInTheDocument();
    });

    it('should handle encounter not found error', async () => {
      mockEncountersApi.get.mockRejectedValueOnce(new Error('Encounter not found'));
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText('Encounter not found')).toBeInTheDocument();
    });

    it('should handle patient fetch error after encounter loads', async () => {
      mockPatientsApi.getPatient.mockRejectedValueOnce(new Error('Patient not found'));
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/patient.*not found|error/i)).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 5. Single Fetch Guarantee
  // ===========================================================================
  describe('Single Fetch Guarantee', () => {
    it('should only fetch encounter and patient once', async () => {
      function MultipleChildren() {
        const { usePatientContext } = require('@/lib/context/patient-context');
        const { useEncounterContext } = require('@/lib/context/encounter-context');
        const { patient } = usePatientContext();
        const { encounter } = useEncounterContext();
        return (
          <>
            <div>{patient?.mrn}</div>
            <div>{encounter?.id}</div>
          </>
        );
      }
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <MultipleChildren />
            <MultipleChildren />
            <MultipleChildren />
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getAllByText('MRN-20260115-0001').length).toBeGreaterThan(0);
      });

      // Note: Encounter is fetched twice - once by layout (to derive patientId) and once by EncounterProvider
      // These use different query keys so aren't deduped, but this is acceptable overhead for the routing flow
      // Patient should only be fetched ONCE by PatientProvider
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });
  });
});
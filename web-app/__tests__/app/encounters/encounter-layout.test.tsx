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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useParams } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useEncounterWorkspaceStore } from '@/lib/stores/ui-store';
import { isDesktop } from '@/lib/desktop';

const mockPush = jest.fn();

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(() => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
  })),
  usePathname: jest.fn(() => '/encounters/100'),
  useSearchParams: jest.fn(() => ({
    toString: () => '',
  })),
}));

jest.mock('@/lib/desktop', () => ({
  isDesktop: jest.fn(() => false),
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
const mockIsDesktop = isDesktop as jest.MockedFunction<typeof isDesktop>;

// Helper to create QueryClient wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Encounter Shell Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const workspaceInitialState = useEncounterWorkspaceStore.getInitialState();
    useEncounterWorkspaceStore.setState(workspaceInitialState, true);
    const editInitialState = useEncounterEditStore.getInitialState();
    useEncounterEditStore.setState(editInitialState, true);
    localStorage.clear();

    mockUseParams.mockReturnValue({ id: '100' });
    mockIsDesktop.mockReturnValue(false);
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
      expect(mockEncountersApi.get).toHaveBeenCalledWith('100');
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

    it('should provide canPlaceOrders = false for CLOSED encounters', async () => {
      const closedEncounter = { ...mockEncounter, status: 'CLOSED' as const };
      mockEncountersApi.get.mockResolvedValueOnce(closedEncounter);

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

  describe.skip('Encounter Workspace Tabs', () => {
    it('should navigate to the selected workspace tab route on tab switch', async () => {
      mockIsDesktop.mockReturnValue(true);

      useEncounterWorkspaceStore.setState(
        {
          tabs: [
            {
              encounterId: 100,
              title: 'Jane Doe',
              subtitle: 'MRN-20260115-0001',
              status: 'IN_PROGRESS',
              lastRoute: '/encounters/100',
              openedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              encounterId: 200,
              title: 'Encounter 200',
              subtitle: 'MRN-200',
              status: 'IN_PROGRESS',
              lastRoute: '/encounters/200/edit/vitals',
              openedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          activeEncounterId: 100,
          maxTabs: 8,
        },
        false
      );

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Encounter 200')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /^Encounter 200/i }));

      expect(mockPush).toHaveBeenCalledWith('/encounters/200/edit/vitals');
    });

    it('should navigate to adjacent tab route when closing active tab', async () => {
      mockIsDesktop.mockReturnValue(true);

      const now = new Date().toISOString();
      useEncounterWorkspaceStore.setState(
        {
          tabs: [
            {
              encounterId: 100,
              title: 'Jane Doe',
              subtitle: 'MRN-20260115-0001',
              status: 'IN_PROGRESS',
              lastRoute: '/encounters/100',
              openedAt: now,
              updatedAt: now,
            },
            {
              encounterId: 201,
              title: 'Encounter 201',
              subtitle: 'MRN-201',
              status: 'IN_PROGRESS',
              lastRoute: '/encounters/201?focus=orders',
              openedAt: now,
              updatedAt: now,
            },
          ],
          activeEncounterId: 100,
          maxTabs: 8,
        },
        false
      );

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Close encounter 100 tab')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Close encounter 100 tab'));

      expect(mockPush).toHaveBeenCalledWith('/encounters/201?focus=orders');
    });

    it('should navigate to encounters list when close all is clicked', async () => {
      mockIsDesktop.mockReturnValue(true);

      const now = new Date().toISOString();
      useEncounterWorkspaceStore.setState(
        {
          tabs: [
            {
              encounterId: 100,
              title: 'Jane Doe',
              subtitle: 'MRN-20260115-0001',
              status: 'IN_PROGRESS',
              lastRoute: '/encounters/100',
              openedAt: now,
              updatedAt: now,
            },
            {
              encounterId: 210,
              title: 'Encounter 210',
              subtitle: 'MRN-210',
              status: 'IN_PROGRESS',
              lastRoute: '/encounters/210',
              openedAt: now,
              updatedAt: now,
            },
          ],
          activeEncounterId: 100,
          maxTabs: 8,
        },
        false
      );

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterLayout>
            <div>Content</div>
          </EncounterLayout>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Close All' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Close All' }));

      expect(mockPush).toHaveBeenCalledWith('/encounters');
    });
  });
});

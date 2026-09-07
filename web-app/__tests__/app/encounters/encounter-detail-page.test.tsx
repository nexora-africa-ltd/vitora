/**
 * Encounter Detail Page Tests - RED Phase (Batch 3)
 *
 * Tests for migrating encounter detail page to consume EncounterContext
 * instead of fetching independently.
 *
 * Acceptance Criteria:
 * - Page uses useEncounterContext() instead of independent fetch
 * - Patient data comes from context (via EncounterContext)
 * - No duplicate API calls
 * - Order permissions checked via context
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: '1' })),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
  })),
  usePathname: jest.fn(() => '/encounters/1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock the API modules
jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    get: jest.fn(),
    list: jest.fn(),
  },
}));

jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
  },
}));

// Mock auth context
const mockUser = {
  id: 1,
  username: 'doctor1',
  role: 'DOCTOR',
  permissions: ['view_patient', 'create_encounter', 'edit_encounter'],
};

jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({ user: mockUser, isAuthenticated: true })),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: jest.fn(() => ({
    isAdmin: false,
    canAccessModule: () => true,
    canPerformAction: () => true,
  })),
}));

jest.mock('@/lib/context/facility-context', () => ({
  useFacility: jest.fn(() => ({ hasModule: () => true })),
}));

const mockEmptyQuery = () => ({ data: undefined, isLoading: false, error: null });

jest.mock('@/lib/hooks/use-encounters', () => ({
  useEncounterDiagnoses: mockEmptyQuery,
  useEncounterTreatmentPlan: mockEmptyQuery,
  useEncounterClinicalSnapshot: mockEmptyQuery,
  useEditChiefComplaint: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/hooks/use-laboratory', () => ({ useEncounterLabOrders: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-imaging', () => ({ useEncounterImagingOrders: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-pharmacy', () => ({ useEncounterPrescriptions: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-procedures', () => ({ useEncounterProcedureOrders: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-referrals', () => ({ useEncounterReferrals: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-encounter-allied-health', () => ({
  useEncounterPhysioOrders: mockEmptyQuery,
  useEncounterNutritionConsultations: mockEmptyQuery,
  useEncounterCounsellingReferrals: mockEmptyQuery,
  useEncounterOTOrders: mockEmptyQuery,
  useEncounterSWReferrals: mockEmptyQuery,
}));
jest.mock('@/lib/hooks/use-proactive-insights', () => ({
  useProactiveInsights: () => ({
    insights: [],
    isLoading: false,
    dismissInsight: jest.fn(),
    dismissAll: jest.fn(),
    refresh: jest.fn(),
    error: null,
    noInsightsFound: false,
    loadedFromCache: false,
  }),
}));
jest.mock('@/lib/hooks/use-ai', () => ({ useStoredCarePlans: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-patients', () => ({ usePatientVitalsHistory: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-allergies', () => ({ usePatientAllergies: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-chronic-conditions', () => ({ usePatientChronicConditions: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-current-medications', () => ({ usePatientCurrentMedications: mockEmptyQuery }));
jest.mock('@/lib/hooks/use-vital-flag-suggestions', () => ({
  usePatientVitalFlagSuggestions: mockEmptyQuery,
}));
jest.mock('@/lib/hooks/use-comment-count', () => ({ useCommentCount: () => 0 }));
jest.mock('@/lib/hooks', () => ({
  useLabEncounterSocket: jest.fn(),
}));

jest.mock('@/components/encounters/cds-alerts-panel', () => ({ CDSAlertsPanel: () => null }));
jest.mock('@/components/encounters/enhanced-cds-panel', () => ({ EnhancedCDSPanel: () => null }));
jest.mock('@/components/encounters/care-plan-panel', () => ({ CarePlanPanel: () => null }));
jest.mock('@/components/encounters/clinical-snapshot-banner', () => ({
  ClinicalSnapshotBanner: () => null,
}));
jest.mock('@/components/shared/proactive-insight-card', () => ({
  ProactiveInsightsPanel: () => null,
}));
jest.mock('@/components/encounters/investigation-suggestions-panel', () => ({
  InvestigationSuggestionsPanel: () => null,
}));
jest.mock('@/components/encounters/egfr-panel', () => ({ EGFRPanel: () => null }));

import { useParams } from 'next/navigation';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { useAuth } from '@/lib/auth/context';
import { mockPatient, mockEncounter } from '../../fixtures/patient-shell-fixtures';

jest.setTimeout(15000);

const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

let EncounterDetailPage: React.ComponentType;
let EncounterProvider: React.ComponentType<{ encounterId: number; children: React.ReactNode }>;

// Wrap in PatientProvider for EncounterProvider to work
function TestWrapper({ children, patientId }: { children: React.ReactNode; patientId: number }) {
  const { PatientProvider } = require('@/lib/context/patient-context');
  return <PatientProvider patientId={patientId}>{children}</PatientProvider>;
}

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

describe('Encounter Detail Page - Context Integration', () => {
  beforeAll(async () => {
    const [pageModule, contextModule] = await Promise.all([
      import('@/app/(dashboard)/encounters/[id]/page'),
      import('@/lib/context/encounter-context'),
    ]);
    EncounterDetailPage = pageModule.default;
    EncounterProvider = contextModule.EncounterProvider;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEncountersApi.get.mockResolvedValue(mockEncounter);
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
    mockUseAuth.mockReturnValue({ user: mockUser, isAuthenticated: true } as ReturnType<
      typeof useAuth
    >);
  });

  // ===========================================================================
  // 1. Context Consumption
  // ===========================================================================
  describe('Context Consumption', () => {
    it('should consume encounter data from EncounterContext', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      // Wait for data to load
      await waitFor(() => {
        // Should display encounter type or chief complaint
        const encounterInfo =
          screen.queryByText(/OPD/i) || screen.queryByText(mockEncounter.chief_complaint);
        expect(encounterInfo).toBeTruthy();
      });

      // API should only be called once (by context provider)
      expect(mockEncountersApi.get).toHaveBeenCalledTimes(1);
    });

    it('should access patient data via encounter context', async () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Patient info should be accessible (name shown somewhere)
        // Use queryAllByText since there may be multiple matches
        const patientMatches = screen.queryAllByText(/Jane/);
        const mrnMatches = screen.queryAllByText(new RegExp(mockPatient.mrn));
        expect(patientMatches.length + mrnMatches.length).toBeGreaterThan(0);
      });
    });

    it('should NOT call useEncounter hook directly in page component', async () => {
      const Wrapper = createWrapper();

      const { rerender } = render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.queryByText(/OPD/i) || screen.queryByText(/Headache/)).toBeTruthy();
      });

      // Re-render should NOT trigger another fetch
      rerender(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      // Still only one API call
      expect(mockEncountersApi.get).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 2. Order Permissions from Context
  // ===========================================================================
  describe('Order Permissions', () => {
    it('should show order buttons when encounter is active', async () => {
      mockEncountersApi.get.mockResolvedValue({
        ...mockEncounter,
        status: 'IN_PROGRESS',
      });

      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show continue encounter button for active encounters
        const continueButton =
          screen.queryByRole('link', { name: /continue/i }) ||
          screen.queryByText(/continue encounter/i);
        expect(continueButton).toBeTruthy();
      });
    });

    it('should disable order buttons when encounter is closed', async () => {
      mockEncountersApi.get.mockResolvedValue({
        ...mockEncounter,
        status: 'CLOSED',
      });

      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Order buttons should be disabled or not present
        const labOrderButton = screen.queryByRole('button', { name: /lab order/i });
        if (labOrderButton) {
          expect(labOrderButton).toBeDisabled();
        }
      });
    });
  });

  // ===========================================================================
  // 3. Loading and Error States
  // ===========================================================================
  describe('Loading and Error States', () => {
    it('should show loading state from context', async () => {
      // Make the API take a long time
      mockEncountersApi.get.mockImplementation(() => new Promise(() => {}));

      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      // Should show loading indicator
      const loadingIndicator =
        screen.queryByRole('status') ||
        document.querySelector('[class*="skeleton"]') ||
        document.querySelector('[class*="animate-pulse"]');
      expect(loadingIndicator).toBeTruthy();
    });

    it('should show error state from context', async () => {
      mockEncountersApi.get.mockRejectedValue(new Error('Encounter not found'));

      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        const errorElement =
          screen.queryByRole('alert') ||
          screen.queryByText(/error/i) ||
          screen.queryByText(/not found/i);
        expect(errorElement).toBeTruthy();
      });
    });
  });
});

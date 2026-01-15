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
}));

// Mock the API modules
jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    get: jest.fn(),
    getEncounter: jest.fn(),
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

import { useParams } from 'next/navigation';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { useAuth } from '@/lib/auth/context';
import { mockPatient, mockEncounter } from '../../fixtures/patient-shell-fixtures';

const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

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

describe('Encounter Detail Page - Context Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncountersApi.get.mockResolvedValue(mockEncounter);
    mockEncountersApi.getEncounter.mockResolvedValue(mockEncounter);
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
    mockUseAuth.mockReturnValue({ user: mockUser, isAuthenticated: true } as any);
  });

  // ===========================================================================
  // 1. Context Consumption
  // ===========================================================================
  describe('Context Consumption', () => {
    it('should consume encounter data from EncounterContext', async () => {
      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      // Wait for data to load
      await waitFor(() => {
        // Should display encounter type or chief complaint
        const encounterInfo = screen.queryByText(/OPD/i) || 
                             screen.queryByText(mockEncounter.chief_complaint);
        expect(encounterInfo).toBeTruthy();
      });

      // API should only be called once (by context provider)
      expect(mockEncountersApi.get).toHaveBeenCalledTimes(1);
    });

    it('should access patient data via encounter context', async () => {
      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Patient info should be accessible (name shown somewhere)
        const patientInfo = screen.queryByText(/Jane/) || 
                          screen.queryByText(mockPatient.mrn);
        expect(patientInfo).toBeTruthy();
      });
    });

    it('should NOT call useEncounter hook directly in page component', async () => {
      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      
      const Wrapper = createWrapper();
      
      const { rerender } = render(
        <Wrapper>
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
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
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
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
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show lab order or prescription buttons
        const orderButton = screen.queryByRole('button', { name: /lab|order|prescription/i }) ||
                          screen.queryByRole('link', { name: /lab|order|prescription/i });
        expect(orderButton).toBeTruthy();
      });
    });

    it('should disable order buttons when encounter is completed', async () => {
      mockEncountersApi.get.mockResolvedValue({
        ...mockEncounter,
        status: 'COMPLETED',
      });

      const EncounterDetailPage = (await import('@/app/(dashboard)/encounters/[id]/page')).default;
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
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
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      // Should show loading indicator
      const loadingIndicator = screen.queryByRole('status') ||
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
          <EncounterProvider encounterId={1} patientId={mockPatient.id}>
            <EncounterDetailPage />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        const errorElement = screen.queryByRole('alert') || 
               screen.queryByText(/error/i) ||
               screen.queryByText(/not found/i);
        expect(errorElement).toBeTruthy();
      });
    });
  });
});

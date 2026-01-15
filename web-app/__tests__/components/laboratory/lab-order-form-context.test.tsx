/**
 * Lab Order Form Context Integration Tests - GREEN Phase (Batch 3)
 * 
 * Tests for lab-order-form consuming PatientContext and EncounterContext.
 * 
 * Acceptance Criteria:
 * - Form uses useOptionalPatientContext() for patient info
 * - Form uses useOptionalEncounterContext() for encounter info
 * - Form shows warning when no active encounter
 * - Order creation includes encounter_id from context
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
  usePathname: jest.fn(() => '/laboratory/orders/new'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock the API modules
jest.mock('@/lib/api/laboratory', () => ({
  laboratoryApi: {
    createOrder: jest.fn(),
    listTests: jest.fn(),
  },
}));

jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
  },
}));

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    get: jest.fn(),
  },
}));

// Mock auth context
const mockUser = {
  id: 1,
  username: 'doctor1',
  first_name: 'Test',
  last_name: 'Doctor',
  role: 'DOCTOR',
  permissions: ['view_patient', 'create_lab_order'],
};

jest.mock('@/lib/auth', () => ({
  useAuth: jest.fn(() => ({ user: mockUser, isAuthenticated: true })),
}));

jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({ user: mockUser, isAuthenticated: true })),
}));

import { patientsApi } from '@/lib/api/patients';
import { encountersApi } from '@/lib/api/encounters';
import { mockPatient, mockEncounter } from '../../fixtures/patient-shell-fixtures';

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;

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

describe('Lab Order Form - Context Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
    mockEncountersApi.get.mockResolvedValue(mockEncounter);
  });

  // ===========================================================================
  // 1. Context Consumption
  // ===========================================================================
  describe('Context Consumption', () => {
    it('should consume patient data from PatientContext', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      const { LabOrderForm } = await import('@/components/laboratory/lab-order-form');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <EncounterProvider encounterId={mockEncounter.id}>
              <LabOrderForm />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Patient name should be displayed somewhere in the form
        const patientDisplay = screen.queryByText(/Jane/) || 
                              screen.queryByText(mockPatient.mrn);
        expect(patientDisplay).toBeTruthy();
      });

      // Patient API should only be called once (by context)
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });

    it('should consume encounter data from EncounterContext', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      const { LabOrderForm } = await import('@/components/laboratory/lab-order-form');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <EncounterProvider encounterId={mockEncounter.id}>
              <LabOrderForm />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Form should be rendered (not showing error)
        const form = document.querySelector('form');
        expect(form).toBeTruthy();
      });
    });

    it('should use context data over props when both provided', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      const { LabOrderForm } = await import('@/components/laboratory/lab-order-form');
      
      const Wrapper = createWrapper();
      
      // Pass different IDs as props - context should take precedence
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <EncounterProvider encounterId={mockEncounter.id}>
              <LabOrderForm patientId={999} encounterId={999} />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show context patient name, not prop patient
        const patientDisplay = screen.queryByText(/Jane/);
        expect(patientDisplay).toBeTruthy();
      });
    });
  });

  // ===========================================================================
  // 2. Encounter Requirement
  // ===========================================================================
  describe('Encounter Requirement', () => {
    it('should show warning when no encounter context or props', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { LabOrderForm } = await import('@/components/laboratory/lab-order-form');
      
      const Wrapper = createWrapper();
      
      // Render WITHOUT EncounterProvider and without props
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <LabOrderForm />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show warning about missing encounter
        const warning = screen.queryByText(/encounter.*required/i) ||
                       screen.queryByRole('alert');
        expect(warning).toBeTruthy();
      });
    });

    it('should show warning when encounter is completed', async () => {
      mockEncountersApi.get.mockResolvedValue({
        ...mockEncounter,
        status: 'COMPLETED',
      });

      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      const { LabOrderForm } = await import('@/components/laboratory/lab-order-form');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <EncounterProvider encounterId={mockEncounter.id}>
              <LabOrderForm />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show warning about encounter not active
        const warning = screen.queryByText(/not active/i) ||
                       screen.queryByText(/completed/i) ||
                       screen.queryByRole('alert');
        expect(warning).toBeTruthy();
      });
    });
  });

  // ===========================================================================
  // 3. Form Rendering with Context
  // ===========================================================================
  describe('Form Rendering', () => {
    it('should render form when valid context is provided', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      const { LabOrderForm } = await import('@/components/laboratory/lab-order-form');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <EncounterProvider encounterId={mockEncounter.id}>
              <LabOrderForm />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Form should render with Order Information card
        const orderCard = screen.queryByText(/order information/i);
        expect(orderCard).toBeTruthy();
      });
    });
  });
});

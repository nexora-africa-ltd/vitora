/**
 * TDD Tests for EncounterContext and useEncounterContext hook
 * 
 * RED PHASE: These tests should FAIL initially because the implementation doesn't exist.
 * 
 * Encounter Context Requirements:
 * 1. Single authoritative encounter context provider
 * 2. Encounter data fetched ONCE and shared across all children
 * 3. Must be nested within PatientProvider (validates patient match)
 * 4. Provides encounter identity (ID, type, status, date)
 * 5. Tracks triage and consultation status
 * 6. Prevents clinical actions without valid encounter
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PatientProvider } from '@/lib/context/patient-context';
import { EncounterProvider, useEncounterContext } from '@/lib/context/encounter-context';

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

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;

// Test fixtures
const mockPatient = {
  id: 1,
  mrn: 'MRN-20260115-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1985-05-20',
  gender: 'F' as const,
  phone_number: '+254712345678',
  is_sensitive: false,
  consent_given: true,
  cr_number: 'CR-12345',
  sha_number: 'SHA-67890',
};

const mockEncounter = {
  id: 100,
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260115-0001',
  encounter_type: 'OPD',
  encounter_date: '2026-01-15',
  status: 'IN_PROGRESS',
  triage_status: 'COMPLETED',
  consultation_status: 'IN_PROGRESS',
  chief_complaint: 'Persistent headache',
  temperature: 37.2,
  pulse: 72,
  blood_pressure: '120/80',
  respiratory_rate: 16,
  spo2: 98,
  weight: 65,
  height: 165,
  notes: 'Patient presents with 3-day history of headache',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T11:30:00Z',
};

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

// Test component that consumes EncounterContext
function TestEncounterConsumer() {
  const context = useEncounterContext();
  
  return (
    <div>
      <span data-testid="loading">{context.isLoading.toString()}</span>
      <span data-testid="encounter-id">{context.encounter?.id || 'null'}</span>
      <span data-testid="encounter-type">{context.encounter?.encounter_type || 'null'}</span>
      <span data-testid="encounter-status">{context.encounter?.status || 'null'}</span>
      <span data-testid="encounter-date">{context.encounter?.encounter_date || 'null'}</span>
      <span data-testid="triage-status">{context.encounter?.triage_status || 'null'}</span>
      <span data-testid="consultation-status">{context.encounter?.consultation_status || 'null'}</span>
      <span data-testid="chief-complaint">{context.encounter?.chief_complaint || 'null'}</span>
      <span data-testid="can-order">{context.canPlaceOrders?.toString() || 'null'}</span>
      <span data-testid="is-active">{context.isActiveEncounter?.toString() || 'null'}</span>
      <span data-testid="error">{context.error?.message || 'null'}</span>
    </div>
  );
}

// =============================================================================
// Test Suite
// =============================================================================

describe('EncounterContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
  });

  // ===========================================================================
  // 1. Provider Initialization
  // ===========================================================================
  describe('Provider Initialization', () => {
    it('should throw error when useEncounterContext is used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<TestEncounterConsumer />);
      }).toThrow('useEncounterContext must be used within an EncounterProvider');
      
      consoleSpy.mockRestore();
    });

    it('should work without PatientProvider for encounter-first flows', async () => {
      // EncounterProvider can be used standalone for encounter-first navigation
      // (e.g., /encounters/123 route where patient is derived from encounter)
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <EncounterProvider encounterId={100}>
            <TestEncounterConsumer />
          </EncounterProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('encounter-id')).toHaveTextContent('100');
      });
    });

    it('should initialize with loading state when encounterId is provided', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('true');
    });

    it('should not fetch when encounterId is null', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={null}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      expect(mockEncountersApi.get).not.toHaveBeenCalled();
      expect(screen.getByTestId('encounter-id')).toHaveTextContent('null');
    });
  });

  // ===========================================================================
  // 2. Encounter Data Fetching
  // ===========================================================================
  describe('Encounter Data Fetching', () => {
    it('should fetch encounter data when encounterId is provided', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(mockEncountersApi.get).toHaveBeenCalledWith(100);
      expect(mockEncountersApi.get).toHaveBeenCalledTimes(1);
    });

    it('should provide encounter data to consumers', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('encounter-id')).toHaveTextContent('100');
      });

      expect(screen.getByTestId('encounter-type')).toHaveTextContent('OPD');
      expect(screen.getByTestId('encounter-status')).toHaveTextContent('IN_PROGRESS');
      expect(screen.getByTestId('encounter-date')).toHaveTextContent('2026-01-15');
      expect(screen.getByTestId('chief-complaint')).toHaveTextContent('Persistent headache');
    });

    it('should handle fetch errors gracefully', async () => {
      mockEncountersApi.get.mockRejectedValueOnce(new Error('Encounter not found'));
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={999}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Encounter not found');
      });
    });
  });

  // ===========================================================================
  // 3. Patient-Encounter Validation
  // ===========================================================================
  describe('Patient-Encounter Validation', () => {
    it('should validate that encounter belongs to current patient', async () => {
      // Encounter belongs to patient 2, but we're in patient 1 context
      const mismatchedEncounter = { ...mockEncounter, patient: 2 };
      mockEncountersApi.get.mockResolvedValueOnce(mismatchedEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Encounter does not belong to current patient');
      });
    });

    it('should allow encounter when patient matches', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('encounter-id')).toHaveTextContent('100');
      });

      expect(screen.getByTestId('error')).toHaveTextContent('null');
    });
  });

  // ===========================================================================
  // 4. Clinical Order Permissions
  // ===========================================================================
  describe('Clinical Order Permissions', () => {
    it('should allow orders when encounter is IN_PROGRESS', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-order')).toHaveTextContent('true');
      });
    });

    it('should NOT allow orders when encounter is COMPLETED', async () => {
      const completedEncounter = { ...mockEncounter, status: 'COMPLETED' };
      mockEncountersApi.get.mockResolvedValueOnce(completedEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-order')).toHaveTextContent('false');
      });
    });

    it('should NOT allow orders when encounter is CANCELLED', async () => {
      const cancelledEncounter = { ...mockEncounter, status: 'CANCELLED' };
      mockEncountersApi.get.mockResolvedValueOnce(cancelledEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-order')).toHaveTextContent('false');
      });
    });

    it('should indicate active encounter based on status', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-active')).toHaveTextContent('true');
      });
    });
  });

  // ===========================================================================
  // 5. Triage and Consultation Status
  // ===========================================================================
  describe('Triage and Consultation Status', () => {
    it('should provide triage status from encounter', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('triage-status')).toHaveTextContent('COMPLETED');
      });
    });

    it('should provide consultation status from encounter', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <TestEncounterConsumer />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('consultation-status')).toHaveTextContent('IN_PROGRESS');
      });
    });
  });

  // ===========================================================================
  // 6. Single Fetch Guarantee
  // ===========================================================================
  describe('Single Fetch Guarantee', () => {
    it('should only fetch encounter data once regardless of number of consumers', async () => {
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);
      
      function MultipleConsumers() {
        return (
          <>
            <TestEncounterConsumer />
            <TestEncounterConsumer />
            <TestEncounterConsumer />
          </>
        );
      }
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <MultipleConsumers />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        const idElements = screen.getAllByTestId('encounter-id');
        expect(idElements[0]).toHaveTextContent('100');
      });

      // Critical: Should only fetch ONCE
      expect(mockEncountersApi.get).toHaveBeenCalledTimes(1);
    });
  });
});

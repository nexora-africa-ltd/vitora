/**
 * TDD Tests for PatientShellHeader component
 *
 * RED PHASE: These tests should FAIL initially because the implementation doesn't exist.
 *
 * PatientShellHeader Requirements:
 * 1. Display patient identity (MRN, name, DOB, gender, age)
 * 2. Display verification badges (CR verified, SHA member)
 * 3. Display sensitive patient indicator
 * 4. Display encounter info when in encounter context
 * 5. Be completely READ-ONLY (no edit buttons in header)
 * 6. Be sticky/persistent across route navigation
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PatientProvider } from '@/lib/context/patient-context';
import { EncounterProvider } from '@/lib/context/encounter-context';
import { PatientShellHeader } from '@/components/layout/patient-shell-header';

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
import {
  mockPatient,
  mockSensitivePatient,
  mockUnverifiedPatient,
  mockEncounter,
} from '../../fixtures/patient-shell-fixtures';

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

describe('PatientShellHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Patient Identity Display
  // ===========================================================================
  describe('Patient Identity Display', () => {
    it('should display patient MRN', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('MRN-20260115-0001')).toBeInTheDocument();
      });
    });

    it('should display patient full name', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('should display patient date of birth', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should display DOB in a human-readable format
        expect(screen.getByText(/1985-05-20|May 20, 1985|20\/05\/1985/)).toBeInTheDocument();
      });
    });

    it('should display patient gender', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should display gender label (Female or F)
        expect(screen.getByText(/Female|F/)).toBeInTheDocument();
      });
    });

    it('should display calculated age', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Patient born 1985-05-20, current date is 2026-01-15 → 40 years old
        expect(screen.getByText(/40\s*(y|yr|yrs|years)/i)).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 2. Verification Badges
  // ===========================================================================
  describe('Verification Badges', () => {
    it('should display CR verified badge when cr_number is present', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/CR Verified|Verified/i)).toBeInTheDocument();
      });
    });

    it('should display SHA member badge when sha_number is present', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/SHA|Insured/i)).toBeInTheDocument();
      });
    });

    it('should NOT display verification badges when cr_number is missing', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockUnverifiedPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={3}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('MRN-20260115-0003')).toBeInTheDocument();
      });

      expect(screen.queryByText(/CR Verified|Verified/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/SHA|Insured/i)).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 3. Sensitive Patient Indicator
  // ===========================================================================
  describe('Sensitive Patient Indicator', () => {
    it('should display sensitive indicator for sensitive patients', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockSensitivePatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={2}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Sensitive|Confidential|Protected/i)).toBeInTheDocument();
      });
    });

    it('should NOT display sensitive indicator for non-sensitive patients', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Sensitive|Confidential|Protected/i)).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 4. Encounter Information
  // ===========================================================================
  describe('Encounter Information', () => {
    it('should display encounter type when in encounter context', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <PatientShellHeader />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/OPD|Outpatient/i)).toBeInTheDocument();
      });
    });

    it('should display encounter status when in encounter context', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <PatientShellHeader />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/In Progress|Active/i)).toBeInTheDocument();
      });
    });

    it('should display chief complaint when in encounter context', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);
      mockEncountersApi.get.mockResolvedValueOnce(mockEncounter);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <EncounterProvider encounterId={100}>
              <PatientShellHeader />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Persistent headache/i)).toBeInTheDocument();
      });
    });

    it('should NOT display encounter info when not in encounter context', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      // Should not show encounter-specific elements
      expect(screen.queryByText(/Persistent headache/i)).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 5. Read-Only Enforcement
  // ===========================================================================
  describe('Read-Only Enforcement', () => {
    it('should NOT have an Edit button in the header', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      // Should NOT have any edit buttons
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/edit patient/i)).not.toBeInTheDocument();
    });

    it('should NOT have inline editable fields', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      // Should NOT have any input fields
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should display patient info as text, not editable elements', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // MRN should be displayed as text, not in an input
        const mrnElement = screen.getByText('MRN-20260115-0001');
        expect(mrnElement.tagName).not.toBe('INPUT');
        expect(mrnElement.tagName).not.toBe('TEXTAREA');
      });
    });
  });

  // ===========================================================================
  // 6. Loading State
  // ===========================================================================
  describe('Loading State', () => {
    it('should display loading skeleton while patient data is loading', async () => {
      // Delay the response
      mockPatientsApi.getPatient.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPatient), 100))
      );

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      // Should show loading state initially
      expect(screen.getByTestId('patient-shell-loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 7. Accessibility
  // ===========================================================================
  describe('Accessibility', () => {
    it('should have proper ARIA labels for patient identity', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockPatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      // Should have a banner role or similar landmark
      expect(screen.getByRole('banner') || screen.getByLabelText(/patient/i)).toBeInTheDocument();
    });

    it('should announce sensitive status to screen readers', async () => {
      mockPatientsApi.getPatient.mockResolvedValueOnce(mockSensitivePatient);

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={2}>
            <PatientShellHeader />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        const sensitiveIndicator = screen.getByText(/Sensitive|Confidential|Protected/i);
        // Should have accessible labeling - check either the element or a parent
        const hasAriaLabel = sensitiveIndicator.hasAttribute('aria-label') ||
          sensitiveIndicator.closest('[aria-label]') !== null;
        expect(hasAriaLabel).toBe(true);
      });
    });
  });
});

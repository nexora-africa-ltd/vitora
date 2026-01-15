/**
 * Patient Detail Page Tests - RED Phase
 * 
 * Tests for migrating /patients/[id]/page.tsx to consume PatientContext
 * instead of independently fetching patient data.
 * 
 * Acceptance Criteria:
 * - Page consumes usePatientContext() instead of usePatient(id)
 * - No duplicate patient data fetching
 * - Edit button visibility based on user role
 * - Loading/error states handled by context
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
  usePathname: jest.fn(() => '/patients/1'),
}));

// Mock the API modules
jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    getPatient: jest.fn(),
    getPatientEmergencyContacts: jest.fn(),
  },
}));

// Mock SHA API
jest.mock('@/lib/api/sha', () => ({
  shaApi: {
    getSHAMembers: jest.fn(() => Promise.resolve({ results: [] })),
    checkEligibility: jest.fn(() => Promise.resolve({ eligible: false })),
    checkPatientEligibility: jest.fn(() => Promise.resolve({ eligible: false })),
  },
}));

// Mock patient hooks
jest.mock('@/lib/hooks/use-patients-enhanced', () => ({
  usePatientEmergencyContacts: jest.fn(() => ({ data: [], isLoading: false })),
  usePatientEncounters: jest.fn(() => ({ data: [], isLoading: false })),
}));

// Mock auth context
const mockUser = {
  id: 1,
  username: 'nurse1',
  role: 'NURSE',
  permissions: ['view_patient'],
};

const mockAdminUser = {
  id: 2,
  username: 'admin1',
  role: 'ADMIN',
  permissions: ['view_patient', 'edit_patient', 'manage_patient_identity'],
};

jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({ user: mockUser, isAuthenticated: true })),
}));

import { useParams } from 'next/navigation';
import { patientsApi } from '@/lib/api/patients';
import { useAuth } from '@/lib/auth/context';
import {
  mockPatient,
} from '../../fixtures/patient-shell-fixtures';

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

describe('Patient Detail Page - Context Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
    mockUseAuth.mockReturnValue({ user: mockUser, isAuthenticated: true } as any);
  });

  // ===========================================================================
  // 1. Context Consumption (NOT independent fetching)
  // ===========================================================================
  describe('Context Consumption', () => {
    it('should consume patient data from PatientContext, not fetch independently', async () => {
      // Import the page component dynamically to test context consumption
      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      
      // The page is rendered within PatientProvider (via layout)
      // So we need to test that it uses usePatientContext
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      // Wait for data to load - use regex to match within combined text
      await waitFor(() => {
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
      });

      // The key assertion: Patient API should only be called ONCE
      // (by the context provider, not by the page component)
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });

    it('should NOT call usePatient hook directly in the page component', async () => {
      // This test verifies the page doesn't have its own usePatient call
      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      
      // Render twice to simulate re-render
      const { rerender } = render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
      });

      // Re-render should NOT trigger another fetch
      rerender(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      // Still only 1 call (context caches)
      expect(mockPatientsApi.getPatient).toHaveBeenCalledTimes(1);
    });

    it('should display patient data from context', async () => {
      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Patient name should be visible
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
        expect(screen.getByText(/Doe/)).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 2. Role-Based Edit Button Visibility
  // ===========================================================================
  describe('Role-Based Edit Access', () => {
    it('should HIDE edit button for users without edit_patient permission', async () => {
      mockUseAuth.mockReturnValue({ 
        user: { ...mockUser, permissions: ['view_patient'] }, 
        isAuthenticated: true 
      } as any);

      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
      });

      // Edit button should NOT be visible
      expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });

    it('should SHOW edit button for users with edit_patient permission', async () => {
      mockUseAuth.mockReturnValue({ 
        user: { ...mockUser, permissions: ['view_patient', 'edit_patient'] }, 
        isAuthenticated: true 
      } as any);

      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
      });

      // Edit button SHOULD be visible
      const editButton = screen.getByRole('link', { name: /edit/i }) || 
                         screen.getByRole('button', { name: /edit/i });
      expect(editButton).toBeInTheDocument();
    });

    it('should SHOW edit button for ADMIN role regardless of permissions', async () => {
      mockUseAuth.mockReturnValue({ 
        user: mockAdminUser, 
        isAuthenticated: true 
      } as any);

      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
      });

      // Admin should always see edit button
      const editButton = screen.getByRole('link', { name: /edit/i }) || 
                         screen.getByRole('button', { name: /edit/i });
      expect(editButton).toBeInTheDocument();
    });

    it('should HIDE edit button for clinical roles (NURSE, DOCTOR) by default', async () => {
      mockUseAuth.mockReturnValue({ 
        user: { ...mockUser, role: 'DOCTOR', permissions: ['view_patient', 'create_encounter'] }, 
        isAuthenticated: true 
      } as any);

      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Jane/)).toBeInTheDocument();
      });

      // Clinical staff should NOT see edit button (identity safety)
      expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 3. Loading and Error States from Context
  // ===========================================================================
  describe('Loading and Error States', () => {
    it('should show loading state from context', async () => {
      // Make the API hang to simulate loading
      mockPatientsApi.getPatient.mockImplementation(() => new Promise(() => {}));

      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      // Should show loading indicator (from context, not page's own loading)
      // Check for any loading indicator - skeleton, status, or text
      const loadingIndicator = screen.queryByTestId('patient-shell-loading') || 
             screen.queryByRole('status') ||
             screen.queryByText(/loading/i) ||
             screen.queryByTestId('patient-detail-skeleton') ||
             document.querySelector('[class*="skeleton"]') ||
             document.querySelector('[class*="animate-pulse"]');
      expect(loadingIndicator).toBeTruthy();
    });

    it('should show error state from context', async () => {
      mockPatientsApi.getPatient.mockRejectedValue(new Error('Patient not found'));

      const PatientDetailPage = (await import('@/app/(dashboard)/patients/[id]/page')).default;
      const { PatientProvider } = await import('@/lib/context/patient-context');
      
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={1}>
            <PatientDetailPage />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Check for any error indication
        const errorElement = screen.queryByRole('alert') || 
               screen.queryByText(/error/i) ||
               screen.queryByText(/not found/i);
        expect(errorElement).toBeTruthy();
      });
    });
  });
});

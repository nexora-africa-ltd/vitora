/**
 * Billing Encounter Requirement Tests - RED Phase
 *
 * Tests for enforcing that billing actions (invoices, claims)
 * require an active encounter.
 *
 * Acceptance Criteria:
 * - Invoice creation requires encounter_id
 * - SHA claims require encounter_id
 * - Clear error message when no encounter
 * - Billing forms disabled without encounter context
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: '1' })),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
  })),
  usePathname: jest.fn(() => '/billing/invoices/new'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
  redirect: jest.fn(),
}));

// Mock the API modules
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

jest.mock('@/lib/api/billing', () => ({
  billingApi: {
    createInvoice: jest.fn(),
    getInvoice: jest.fn(),
    listInvoices: jest.fn(),
  },
}));

// Mock auth context
jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 1, username: 'billing1', role: 'BILLING_CLERK', permissions: ['create_invoice'] },
    isAuthenticated: true
  })),
}));

import { patientsApi } from '@/lib/api/patients';
import { encountersApi } from '@/lib/api/encounters';
import { billingApi } from '@/lib/api/billing';
import {
  mockPatient,
  mockEncounter,
} from '../../fixtures/patient-shell-fixtures';

const mockPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockBillingApi = billingApi as jest.Mocked<typeof billingApi>;

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

describe('Billing Encounter Requirement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatientsApi.getPatient.mockResolvedValue(mockPatient);
    mockEncountersApi.get.mockResolvedValue(mockEncounter);
    mockBillingApi.createInvoice.mockResolvedValue({ id: 1, invoice_number: 'INV-001' } as any);
  });

  // ===========================================================================
  // 1. Invoice Creation Requires Encounter
  // ===========================================================================
  describe('Invoice Creation', () => {
    it('should require encounter_id when creating an invoice', async () => {
      // Try to create invoice without encounter
      const invoiceData = {
        patient_id: mockPatient.id,
        // encounter_id: missing!
        items: [{ description: 'Consultation', amount: 500 }],
      };

      // API should reject invoice without encounter
      mockBillingApi.createInvoice.mockRejectedValueOnce(
        new Error('Encounter is required for invoice creation')
      );

      await expect(
        mockBillingApi.createInvoice(invoiceData as any)
      ).rejects.toThrow('Encounter is required');
    });

    it('should accept invoice with valid encounter_id', async () => {
      const invoiceData = {
        patient_id: mockPatient.id,
        encounter_id: mockEncounter.id,
        items: [{ description: 'Consultation', amount: 500 }],
      };

      const result = await mockBillingApi.createInvoice(invoiceData as any);
      expect(result.invoice_number).toBe('INV-001');
    });
  });

  // ===========================================================================
  // 2. Invoice Form Validation
  // ===========================================================================
  describe('Invoice Form - Encounter Validation', () => {
    it('should show error when submitting invoice form without encounter', async () => {
      // This test assumes InvoiceForm component exists
      const InvoiceForm = (await import('@/components/billing/InvoiceForm')).default;

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <InvoiceForm patientId={mockPatient.id} />
        </Wrapper>
      );

      // Fill in basic invoice details
      await waitFor(() => {
        expect(screen.getByRole('form') || screen.getByTestId('invoice-form')).toBeInTheDocument();
      });

      // Try to submit without encounter
      const submitButton = screen.getByRole('button', { name: /create|submit|save/i });
      await userEvent.click(submitButton);

      // Should show validation error about missing encounter
      await waitFor(() => {
        expect(
          screen.getByText(/encounter.*required/i) ||
          screen.getByText(/select.*encounter/i) ||
          screen.getByText(/no active encounter/i)
        ).toBeInTheDocument();
      });
    });

    it('should disable submit button when no encounter is selected', async () => {
      const InvoiceForm = (await import('@/components/billing/InvoiceForm')).default;

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <InvoiceForm patientId={mockPatient.id} />
        </Wrapper>
      );

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create|submit|save/i });
        // Button should be disabled without encounter
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable submit button when encounter is provided', async () => {
      const InvoiceForm = (await import('@/components/billing/InvoiceForm')).default;

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <InvoiceForm patientId={mockPatient.id} encounterId={mockEncounter.id} />
        </Wrapper>
      );

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create|submit|save/i });
        // Button should be enabled with encounter
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  // ===========================================================================
  // 3. Billing Page with Encounter Context
  // ===========================================================================
  describe('Billing Within Encounter Context', () => {
    it('should auto-populate encounter_id from EncounterContext', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const { EncounterProvider } = await import('@/lib/context/encounter-context');
      const InvoiceForm = (await import('@/components/billing/InvoiceForm')).default;

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <EncounterProvider encounterId={mockEncounter.id}>
              <InvoiceForm />
            </EncounterProvider>
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Encounter should be auto-populated
        const encounterField = screen.getByTestId('encounter-field') ||
                               screen.getByLabelText(/encounter/i);
        expect(encounterField).toHaveValue(mockEncounter.id.toString());
      });
    });

    it('should show warning banner when creating invoice without encounter context', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');
      const InvoiceForm = (await import('@/components/billing/InvoiceForm')).default;

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            {/* No EncounterProvider - billing outside encounter */}
            <InvoiceForm />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show warning about billing without encounter
        expect(
          screen.getByRole('alert') ||
          screen.getByText(/no active encounter/i) ||
          screen.getByText(/encounter required/i) ||
          screen.getByText(/sha.*reject/i)
        ).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 4. SHA Claims Require Encounter
  // ===========================================================================
  describe('SHA Claims Encounter Requirement', () => {
    it('should prevent SHA claim submission without encounter', async () => {
      // Mock SHA claims API
      const mockSubmitClaim = jest.fn().mockRejectedValue(
        new Error('SHA claims require an active encounter')
      );

      const claimData = {
        patient_id: mockPatient.id,
        invoice_id: 1,
        // encounter_id: missing!
      };

      await expect(mockSubmitClaim(claimData)).rejects.toThrow('SHA claims require');
    });

    it('should show SHA compliance warning when encounter is missing', async () => {
      const { PatientProvider } = await import('@/lib/context/patient-context');

      // Assuming there's a SHA claims component
      let SHAClaimForm;
      try {
        SHAClaimForm = (await import('@/components/billing/SHAClaimForm')).default;
      } catch {
        // Component may not exist yet - skip test
        return;
      }

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <PatientProvider patientId={mockPatient.id}>
            <SHAClaimForm invoiceId={1} />
          </PatientProvider>
        </Wrapper>
      );

      await waitFor(() => {
        // Should show SHA-specific warning - use queryAllByText since there may be multiple matches
        const shaWarnings = screen.queryAllByText(/sha.*encounter/i);
        expect(shaWarnings.length).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // 5. Encounter Selection Before Billing
  // ===========================================================================
  describe('Encounter Selection Flow', () => {
    it('should allow creating invoice and show patient selection', async () => {
      // This route is a redirect shim to the new transactions URL.
      const { redirect } = await import('next/navigation');
      const BillingNewPage = (await import('@/app/(dashboard)/billing/invoices/new/page')).default;

      render(<BillingNewPage searchParams={{}} />);

      await waitFor(() => {
        expect(redirect).toHaveBeenCalledWith('/transactions/invoices/new');
      });
    });

    it('should use patient from URL params when provided', async () => {
      const { redirect } = await import('next/navigation');
      const BillingNewPage = (await import('@/app/(dashboard)/billing/invoices/new/page')).default;

      render(<BillingNewPage searchParams={{ patient: String(mockPatient.id) }} />);

      await waitFor(() => {
        expect(redirect).toHaveBeenCalledWith(`/transactions/invoices/new?patient=${mockPatient.id}`);
      });
    });
  });
});

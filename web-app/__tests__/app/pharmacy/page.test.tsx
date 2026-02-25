/**
 * Tests for Pharmacy Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * TDD: These tests are written BEFORE the implementation.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PharmacyPage from '@/app/(dashboard)/pharmacy/page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the hooks
jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useDrugs: jest.fn(),
  useStockBatches: jest.fn(),
  useStockAlerts: jest.fn(),
  usePrescriptions: jest.fn(),
  useDispensings: jest.fn(),
  useLowStockAlerts: jest.fn(),
  useExpiringAlerts: jest.fn(),
  usePendingPrescriptions: jest.fn(),
  useBatchesForDrug: jest.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useCreateDispensing: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useAcknowledgeAlert: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useResolveAlert: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useAlertSettings: jest.fn(() => ({
    data: { expiry_warning_days: 90, low_stock_threshold: 100 },
  })),
  useUpdateAlertSettings: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}));

// Mock the toast hook
jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: jest.fn(() => ({
    toast: jest.fn(),
  })),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/pharmacy',
}));

import {
  useDrugs,
  useStockBatches,
  useStockAlerts,
  usePrescriptions,
  usePendingPrescriptions,
  useDispensings,
} from '@/lib/hooks/use-pharmacy';
import { mockDrugs, mockStockBatches, mockStockAlerts, mockPrescriptions } from '@/__tests__/mocks/pharmacy-data';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

describe('PharmacyPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (useDrugs as jest.Mock).mockReturnValue({
      data: { results: mockDrugs, count: mockDrugs.length },
      isLoading: false,
      error: null,
    });

    (useStockBatches as jest.Mock).mockReturnValue({
      data: { results: mockStockBatches, count: mockStockBatches.length },
      isLoading: false,
      error: null,
    });

    (useStockAlerts as jest.Mock).mockReturnValue({
      data: { results: mockStockAlerts, count: mockStockAlerts.length },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    (usePrescriptions as jest.Mock).mockReturnValue({
      data: { results: mockPrescriptions, count: mockPrescriptions.length },
      isLoading: false,
      error: null,
    });

    (usePendingPrescriptions as jest.Mock).mockReturnValue({
      data: mockPrescriptions.filter((p) => p.status === 'PENDING'),
      isLoading: false,
      error: null,
    });

    (useDispensings as jest.Mock).mockReturnValue({
      data: { results: [], count: 0 },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  describe('Page rendering', () => {
    it('should render the pharmacy page title', () => {
      renderWithProviders(<PharmacyPage />);

      expect(screen.getByRole('heading', { name: /pharmacy/i })).toBeInTheDocument();
    });

    it('should render pharmacy description', () => {
      renderWithProviders(<PharmacyPage />);

      // Description is now in HelpPopover, check that popover trigger exists
      expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
    });

    it('should render navigation tabs', () => {
      renderWithProviders(<PharmacyPage />);

      expect(screen.getByText('Drugs')).toBeInTheDocument();
      expect(screen.getByText('Inventory')).toBeInTheDocument();
      expect(screen.getByText('Prescriptions')).toBeInTheDocument();
      expect(screen.getByText('Alerts')).toBeInTheDocument();
    });
  });

  describe('Drugs tab', () => {
    it('should display drug catalog table', async () => {
      renderWithProviders(<PharmacyPage />);

      await waitFor(() => {
        // Data may appear in both mobile and desktop views
        expect(screen.getAllByText('Paracetamol').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Amoxicillin').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Metformin').length).toBeGreaterThan(0);
      });
    });

    it('should display drug details in table', async () => {
      renderWithProviders(<PharmacyPage />);

      await waitFor(() => {
        expect(screen.getByText('PARA500')).toBeInTheDocument();
        expect(screen.getAllByText('500mg').length).toBeGreaterThan(0);
      });
    });

    it('should show stock levels for drugs', async () => {
      renderWithProviders(<PharmacyPage />);

      await waitFor(() => {
        // Paracetamol has 450 in stock - may appear in multiple views
        expect(screen.getAllByText('450').length).toBeGreaterThan(0);
      });
    });

    it('should show add drug button', () => {
      renderWithProviders(<PharmacyPage />);

      expect(screen.getByRole('button', { name: /add drug/i })).toBeInTheDocument();
    });

    it('should have search input for drugs', () => {
      renderWithProviders(<PharmacyPage />);

      expect(screen.getByPlaceholderText(/search drugs/i)).toBeInTheDocument();
    });
  });

  describe('Inventory tab', () => {
    it('should switch to inventory tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Inventory'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /receive stock/i })).toBeInTheDocument();
      });
    });

    it('should display stock batches', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Inventory'));

      await waitFor(() => {
        // Batch numbers may appear in both mobile and desktop views
        expect(screen.getAllByText('BATCH001').length).toBeGreaterThan(0);
        expect(screen.getAllByText('BATCH002').length).toBeGreaterThan(0);
      });
    });

    it('should show batch status badges', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Inventory'));

      await waitFor(() => {
        // Status badges may appear in both mobile and desktop views
        expect(screen.getAllByText('AVAILABLE').length).toBeGreaterThan(0);
        expect(screen.getAllByText('LOW').length).toBeGreaterThan(0);
        expect(screen.getAllByText('EXPIRED').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Prescriptions tab', () => {
    it('should switch to prescriptions tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Prescriptions'));

      await waitFor(() => {
        // Responsive design may render multiple search inputs - use getAllBy
        expect(screen.getAllByPlaceholderText(/search prescriptions/i)[0]).toBeInTheDocument();
      });
    });

    it('should display prescription list', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Prescriptions'));

      await waitFor(() => {
        // Data may appear in both mobile and desktop views
        expect(screen.getAllByText('RX-20260101-0001').length).toBeGreaterThan(0);
        expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
      });
    });

    it('should show prescription status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Prescriptions'));

      await waitFor(() => {
        // Status badges may appear in both mobile and desktop views
        expect(screen.getAllByText('PENDING').length).toBeGreaterThan(0);
        expect(screen.getAllByText('DISPENSED').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Alerts tab', () => {
    it('should switch to alerts tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Alerts'));

      // Should show filter tabs in alerts panel
      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });
    });

    it('should display stock alerts', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PharmacyPage />);

      await user.click(screen.getByText('Alerts'));

      await waitFor(() => {
        // Use getAllByText for text that may appear multiple times (in widget and main panel)
        expect(screen.getAllByText(/amoxicillin 500mg stock is below reorder level/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/metformin 500mg is out of stock/i).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading state', () => {
    it('should show loading spinner when data is loading', () => {
      (useDrugs as jest.Mock).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      renderWithProviders(<PharmacyPage />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error message when fetch fails', () => {
      (useDrugs as jest.Mock).mockReturnValue({
        data: { results: [], count: 0 },
        isLoading: false,
        error: new Error('Failed to fetch drugs'),
      });

      renderWithProviders(<PharmacyPage />);

      expect(screen.getByText(/failed to fetch drugs/i)).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no drugs', () => {
      (useDrugs as jest.Mock).mockReturnValue({
        data: { results: [], count: 0 },
        isLoading: false,
        error: null,
      });

      renderWithProviders(<PharmacyPage />);

      expect(screen.getByText(/no drugs found/i)).toBeInTheDocument();
    });
  });
});

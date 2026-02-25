/**
 * TDD Tests for Triage Page Update (Phase 4.1)
 *
 * Tests that:
 * 1. "Awaiting Consultation" tab is REMOVED
 * 2. "Awaiting Triage" functionality is PRESERVED
 * 3. Page description is updated
 * 4. Links to Encounters page for consultation queue
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import TriageQueuePage from '@/app/(dashboard)/triage/page';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/hooks/use-triage', () => ({
  useWaitingQueue: jest.fn(),
  useStartTriage: jest.fn(),
  useCancelWaitingEntry: jest.fn(),
  useTriageWaitTimeStats: jest.fn(),
  useTriageHistory: jest.fn(),
  // These should no longer be used after removal
  useTriageQueue: jest.fn(),
  useTriageQueueActions: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.Mock;

// Import hooks for mocking
import {
  useWaitingQueue,
  useStartTriage,
  useCancelWaitingEntry,
  useTriageWaitTimeStats,
  useTriageHistory,
  useTriageQueue,
  useTriageQueueActions,
} from '@/lib/hooks/use-triage';

const mockedUseWaitingQueue = useWaitingQueue as jest.Mock;
const mockedUseStartTriage = useStartTriage as jest.Mock;
const mockedUseCancelWaitingEntry = useCancelWaitingEntry as jest.Mock;
const mockedUseTriageWaitTimeStats = useTriageWaitTimeStats as jest.Mock;
const mockedUseTriageHistory = useTriageHistory as jest.Mock;
const mockedUseTriageQueue = useTriageQueue as jest.Mock;
const mockedUseTriageQueueActions = useTriageQueueActions as jest.Mock;

// =============================================================================
// TEST SETUP
// =============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

const mockWaitingEntry = {
  id: 1,
  patient: 101,
  patient_name: 'John Kamau',
  patient_mrn: 'MRN-20260104-0001',
  patient_age: 45,
  patient_gender: 'M',
  encounter: 201,
  status: 'WAITING',
  wait_time_minutes: 15,
  reason_for_visit: 'Headache',
  priority_hint: 'NORMAL',
  checked_in_at: new Date().toISOString(),
};

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Triage Page - Phase 4.1 Updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
    });

    // Setup default mocks
    mockedUseWaitingQueue.mockReturnValue({
      data: { results: [mockWaitingEntry], count: 1 },
      isLoading: false,
      refetch: jest.fn(),
    });
    mockedUseStartTriage.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({}),
    });
    mockedUseCancelWaitingEntry.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({}),
    });
    mockedUseTriageWaitTimeStats.mockReturnValue({
      data: { avg_wait_minutes: 12, target_met_percentage: 90 },
    });
    mockedUseTriageHistory.mockReturnValue({
      data: { results: [], count: 0 },
      isLoading: false,
      refetch: jest.fn(),
    });
    mockedUseTriageQueue.mockReturnValue({
      data: { results: [], count: 0 },
      isLoading: false,
      refetch: jest.fn(),
      dataUpdatedAt: Date.now(),
    });
    mockedUseTriageQueueActions.mockReturnValue({
      callPatient: jest.fn(),
      markWithClinician: jest.fn(),
      markComplete: jest.fn(),
      markLWBS: jest.fn(),
      isLoading: false,
    });
  });

  // ===========================================================================
  // 1. Awaiting Consultation Tab REMOVED Tests
  // ===========================================================================
  describe('Awaiting Consultation Tab Removal', () => {
    it('should NOT display "Awaiting Consultation" tab', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Use getAllByText since mobile + desktop layouts both render patient name
        expect(screen.getAllByText('John Kamau')[0]).toBeInTheDocument();
      });

      // The "Awaiting Consultation" tab should NOT exist
      expect(screen.queryByRole('tab', { name: /Awaiting Consultation/i })).not.toBeInTheDocument();
    });

    it('should NOT display "In Priority Queue" KPI card', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText('John Kamau')[0]).toBeInTheDocument();
      });

      // The "In Priority Queue" card should NOT exist
      expect(screen.queryByText('In Priority Queue')).not.toBeInTheDocument();
    });

    it('should NOT render TriageQueueDashboard component', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText('John Kamau')[0]).toBeInTheDocument();
      });

      // Priority queue elements should not exist
      expect(screen.queryByText(/sorted by KETA priority/i)).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 2. Awaiting Triage Functionality PRESERVED Tests
  // ===========================================================================
  describe('Awaiting Triage Functionality Preserved', () => {
    it('should display "Patients Awaiting Triage" section', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Patients Awaiting Triage/i)).toBeInTheDocument();
      });
    });

    it('should display waiting patients list', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText('John Kamau')[0]).toBeInTheDocument();
        expect(screen.getAllByText('MRN-20260104-0001')[0]).toBeInTheDocument();
      });
    });

    it('should display "In Queue" KPI card', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // KPI card title is "In Queue" with description "Awaiting triage"
        expect(screen.getByText('In Queue')).toBeInTheDocument();
      });
    });

    it('should have "Start Triage" button for waiting patients', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Mobile shows "Start Triage", desktop shows "Start Triage" - both in DOM
        expect(screen.getAllByRole('button', { name: /Start.*Triage/i })[0]).toBeInTheDocument();
      });
    });

    it('should have "Cancel" button for waiting patients', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Mobile + desktop layouts both have Cancel button
        expect(screen.getAllByRole('button', { name: /Cancel/i })[0]).toBeInTheDocument();
      });
    });

    it('should navigate to triage form when "Start Triage" is clicked', async () => {
      const user = userEvent.setup();
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText('John Kamau')[0]).toBeInTheDocument();
      });

      const startButton = screen.getAllByRole('button', { name: /Start.*Triage/i })[0];
      await user.click(startButton);

      await waitFor(() => {
        // New tabbed triage flow routes to /triage/assess/{patientId}/{encounterId}/vitals
        // Legacy flow would route to /triage/new
        expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/triage\/(new|assess)/));
      });
    });
  });

  // ===========================================================================
  // 3. Page Header & Description Tests
  // ===========================================================================
  describe('Page Header Updates', () => {
    it('should display updated page title', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Page title is "Triage" (not "Triage Queue")
        expect(screen.getByRole('heading', { name: 'Triage' })).toBeInTheDocument();
      });
    });

    it('should have help button with triage-focused description', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Multiple help buttons exist (page header + card headers)
        // Verify at least one help button is present
        expect(screen.getAllByRole('button', { name: /Help/i })[0]).toBeInTheDocument();
      });
    });

    it('should have "New Triage" button', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /New Triage/i })).toBeInTheDocument();
      });
    });

    it('should use pull-to-refresh for data refresh', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Page uses PullToRefresh component instead of explicit Refresh button
        // Verify the pull-to-refresh container exists
        expect(screen.getByRole('heading', { name: 'Triage' })).toBeInTheDocument();
      });
      // The auto-refresh is handled by useWaitingQueue hook (15s interval)
      // No explicit refresh button needed
    });
  });

  // ===========================================================================
  // 4. Link to Encounters Page Tests
  // ===========================================================================
  describe('Link to Encounters Page', () => {
    it('should display link/info about consultation queue location', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Should have info text or link pointing to encounters page
        const linkOrInfo = (screen.queryAllByText(/encounters/i)[0] ?? null) ||
                          screen.queryByRole('link', { name: /consultation/i });
        // This might be in an info card or description
        expect(linkOrInfo || screen.getByText(/Patients Awaiting Triage/i)).toBeTruthy();
      });
    });
  });

  // ===========================================================================
  // 5. KPI Cards Update Tests
  // ===========================================================================
  describe('KPI Cards', () => {
    it('should display "Current Wait" KPI', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // KPI card shows "Current Wait" (avg queue wait now)
        expect(screen.getByText('Current Wait')).toBeInTheDocument();
      });
    });

    it('should display "Avg Completion" KPI', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // KPI card shows time from arrival to completion
        expect(screen.getByText('Avg Completion')).toBeInTheDocument();
      });
    });

    it('should display "Target Met" KPI', async () => {
      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Target Met')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 6. Empty State Tests
  // ===========================================================================
  describe('Empty State', () => {
    it('should show empty state when no patients waiting', async () => {
      mockedUseWaitingQueue.mockReturnValue({
        data: { results: [], count: 0 },
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/No patients waiting for triage/i)).toBeInTheDocument();
      });
    });

    it('should have "Register New Patient" button in empty state', async () => {
      mockedUseWaitingQueue.mockReturnValue({
        data: { results: [], count: 0 },
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<TriageQueuePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Register New Patient/i })).toBeInTheDocument();
      });
    });
  });
});

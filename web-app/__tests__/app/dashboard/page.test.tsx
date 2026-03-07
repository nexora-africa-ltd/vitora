import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '@/app/(dashboard)/dashboard/page';

jest.mock('next/dynamic', () => () => {
  const DynamicComponent = () => null;
  DynamicComponent.displayName = 'DynamicComponent';
  return DynamicComponent;
});

// Avoid needing AuthProvider in this unit test
jest.mock('@/lib/auth', () => ({
  useIsSupervisor: () => false,
}));

jest.mock('@/lib/hooks/use-triage', () => ({
  useTriageWaitTimeStats: () => ({
    data: {
      current_queue: {
        count: 4,
        avg_wait_minutes: 12,
      },
    },
    isLoading: false,
  }),
}));

jest.mock('@/lib/hooks/use-websocket', () => ({
  useEmergencySocket: () => ({
    connectionState: 'connected',
    reconnectAttempts: 0,
    lastUpdate: new Date('2026-03-07T10:00:00Z'),
  }),
}));

jest.mock('@/components/ui/websocket-status', () => ({
  WebSocketStatus: () => <div>WebSocketStatus Component</div>,
}));

// Create a new query client for tests
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Test wrapper with QueryClientProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Mock the dashboard stats hook
jest.mock('@/lib/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({
    data: {
      patients: { total: 100, today: 5, this_week: 14, this_month: 28 },
      encounters: { today: 20, in_progress: 3, completed_today: 17 },
      pharmacy: { prescriptions_today: 10, pending_dispensing: 2, low_stock_items: 1, expiring_soon: 4 },
      laboratory: { pending_tests: 6, completed_today: 8, critical_results: 1 },
      triage: { waiting: 4, avg_wait_time_minutes: 12, emergency_count: 1 },
      billing: { revenue_today: 12000, pending_payments: 4000, sha_claims_pending: 2 },
      alerts: { total_unresolved: 3, critical: 1, high: 1, medium: 1 },
    },
    isLoading: false,
    isError: false,
  }),
  formatNumber: (n: number) => n.toLocaleString(),
  formatCurrency: (n: number) => `KES ${n.toLocaleString()}`,
}));

// Mock the components
jest.mock('@/components/dashboard/stats-card', () => ({
  StatsCard: ({ title, href }: { title: string; href?: string }) => (
    href ? <a href={href}>{title}</a> : <div>{title}</div>
  ),
}));

jest.mock('@/components/dashboard/recent-patients', () => ({
  RecentPatients: () => <div>RecentPatients Component</div>,
}));

jest.mock('@/components/dashboard/alerts-widget', () => ({
  AlertsWidget: () => <div>AlertsWidget Component</div>,
}));

jest.mock('@/components/dashboard/my-claimed-widget', () => ({
  MyClaimedEncountersWidget: () => <div>MyClaimedEncountersWidget Component</div>,
}));

jest.mock('@/components/dashboard/all-claimed-widget', () => ({
  AllClaimedEncountersWidget: () => <div>AllClaimedEncountersWidget Component</div>,
}));

jest.mock('@/components/surveillance/idsr-dashboard-widget', () => ({
  IDSRDashboardWidget: () => <div>IDSRDashboardWidget Component</div>,
}));

describe('Dashboard Page', () => {
  it('should render dashboard title', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Total Patients')).toBeInTheDocument();
    expect(screen.getByText("Today's Encounters")).toBeInTheDocument();
    expect(screen.getByText('Pending Dispensing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Active Alerts' })).toHaveAttribute('href', '/surveillance/alerts');
    expect(screen.getByText('Pending Lab Tests')).toBeInTheDocument();
    expect(screen.getByText('Revenue Today')).toBeInTheDocument();
  });

  it('should render recent patients section', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Recent Patients')).toBeInTheDocument();
  });

  it('should render alerts widget', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('AlertsWidget Component')).toBeInTheDocument();
  });

  it('should render quick actions', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByRole('link', { name: /register patient/i })).toHaveAttribute('href', '/patients/new');
    expect(screen.getByRole('link', { name: /new encounter/i })).toHaveAttribute('href', '/encounters/new');
    expect(screen.getByRole('link', { name: /open triage/i })).toHaveAttribute('href', '/triage');
  });

  it('should render websocket status instead of refresh controls', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('WebSocketStatus Component')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
  });
});

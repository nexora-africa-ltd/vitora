import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '@/app/(dashboard)/dashboard/page';

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
      patients: { total: 100, today: 5 },
      encounters: { today: 20, in_progress: 3 },
      pharmacy: { prescriptions_today: 10, pending_dispensing: 2 },
      alerts: { total_unresolved: 3, critical: 1 },
    },
    isLoading: false,
  }),
  formatNumber: (n: number) => n.toLocaleString(),
}));

// Mock the components
jest.mock('@/components/dashboard/stats-card', () => ({
  StatsCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

jest.mock('@/components/dashboard/recent-patients', () => ({
  RecentPatients: () => <div>RecentPatients Component</div>,
}));

jest.mock('@/components/dashboard/alerts-widget', () => ({
  AlertsWidget: () => <div>AlertsWidget Component</div>,
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
    expect(screen.getByText('Prescriptions')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('should render recent patients section', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Recent Patients')).toBeInTheDocument();
  });

  it('should render alerts widget', () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/(dashboard)/page';

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
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Total Patients')).toBeInTheDocument();
    expect(screen.getByText("Today's Encounters")).toBeInTheDocument();
    expect(screen.getByText('Prescriptions')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('should render recent patients section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Recent Patients')).toBeInTheDocument();
  });

  it('should render alerts widget', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
  });
});

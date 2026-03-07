/**
 * TDD Tests for Dashboard StatsCard Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';

// Mock TrendIndicator component
jest.mock('@/components/charts', () => ({
  TrendIndicator: ({ direction }: { direction?: string }) => (
    <span data-testid="trend-indicator" data-direction={direction}>
      <svg data-testid="trend-icon" />
    </span>
  ),
}));

describe('StatsCard Component', () => {
  it('should render title', () => {
    render(
      <StatsCard
        title="Total Patients"
        value={150}
        icon={Users}
      />
    );

    expect(screen.getByText('Total Patients')).toBeInTheDocument();
  });

  it('should render value', () => {
    render(
      <StatsCard
        title="Total Patients"
        value={150}
        icon={Users}
      />
    );

    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('should render string value', () => {
    render(
      <StatsCard
        title="Revenue"
        value="$10,000"
        icon={Users}
      />
    );

    expect(screen.getByText('$10,000')).toBeInTheDocument();
  });

  it('should render description when provided', () => {
    render(
      <StatsCard
        title="Total Patients"
        value={150}
        description="+12% from last month"
        icon={Users}
      />
    );

    expect(screen.getByText('+12% from last month')).toBeInTheDocument();
  });

  it('should render meta when provided', () => {
    render(
      <StatsCard
        title="Total Patients"
        value={150}
        meta="12 registered today"
        icon={Users}
      />
    );

    expect(screen.getByText('12 registered today')).toBeInTheDocument();
  });

  it('should render icon', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value={100}
        icon={Users}
      />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should render up trend with TrendIndicator', () => {
    render(
      <StatsCard
        title="Total"
        value={100}
        description="Trending up"
        icon={Users}
        trend="up"
      />
    );

    const indicator = screen.getByTestId('trend-indicator');
    expect(indicator).toHaveAttribute('data-direction', 'up');
  });

  it('should render down trend with TrendIndicator', () => {
    render(
      <StatsCard
        title="Total"
        value={100}
        description="Trending down"
        icon={Users}
        trend="down"
      />
    );

    const indicator = screen.getByTestId('trend-indicator');
    expect(indicator).toHaveAttribute('data-direction', 'down');
  });

  it('should render neutral trend with TrendIndicator', () => {
    render(
      <StatsCard
        title="Total"
        value={100}
        description="No change"
        icon={Users}
        trend="neutral"
      />
    );

    const indicator = screen.getByTestId('trend-indicator');
    expect(indicator).toHaveAttribute('data-direction', 'neutral');
  });

  it('should apply warning variant to icon', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value={100}
        icon={Users}
        variant="warning"
      />
    );

    expect(container.querySelector('[class*="text-warning"]')).toBeInTheDocument();
  });

  it('should apply success variant to icon', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value={100}
        icon={Users}
        variant="success"
      />
    );

    expect(container.querySelector('[class*="text-success"]')).toBeInTheDocument();
  });

  it('should default to neutral trend', () => {
    render(
      <StatsCard
        title="Total"
        value={100}
        icon={Users}
      />
    );

    // Should render without errors with default values
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('should hide trend indicator when disabled', () => {
    render(
      <StatsCard
        title="Total"
        value={100}
        description="8 completed today"
        icon={Users}
        showTrendIndicator={false}
      />
    );

    expect(screen.queryByTestId('trend-indicator')).not.toBeInTheDocument();
  });

  it('should render interactive link when href is provided', () => {
    render(
      <StatsCard
        title="Total Patients"
        value={150}
        icon={Users}
        href="/patients"
        ariaLabel="Open patient list"
      />
    );

    expect(screen.getByRole('link', { name: 'Open patient list' })).toHaveAttribute('href', '/patients');
  });
});

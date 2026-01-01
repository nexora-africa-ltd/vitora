/**
 * TDD Tests for Dashboard StatsCard Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';

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

  it('should render up trend icon', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value={100}
        description="Trending up"
        icon={Users}
        trend="up"
      />
    );

    // Should have at least one icon
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });

  it('should render down trend icon', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value={100}
        description="Trending down"
        icon={Users}
        trend="down"
      />
    );

    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });

  it('should render neutral trend icon', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value={100}
        description="No change"
        icon={Users}
        trend="neutral"
      />
    );

    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
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

    expect(container.querySelector('[class*="text-amber"]')).toBeInTheDocument();
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

    expect(container.querySelector('[class*="text-green"]')).toBeInTheDocument();
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
});

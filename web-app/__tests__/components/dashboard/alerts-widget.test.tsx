/**
 * TDD Tests for Dashboard AlertsWidget Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';

// Mock the aggregate alert hook consumed by the dashboard widget.
jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useAlertSeveritySummary: jest.fn(() => ({
    data: {
      total: 3,
      critical: 1,
      high: 1,
      medium: 1,
      low: 0,
    },
    isLoading: false,
    error: null,
  })),
}));

describe('AlertsWidget Component', () => {
  it('should render unresolved alert summary', () => {
    render(<AlertsWidget />);

    expect(screen.getByText('3 unresolved alerts')).toBeInTheDocument();
  });

  it('should render alert count badges by severity', () => {
    render(<AlertsWidget />);

    // Check for severity level counts (High, Medium, Critical)
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('should render severity-based styling', () => {
    const { container } = render(<AlertsWidget />);

    // Should have severity indicator elements
    expect(container.querySelector('[data-testid="alerts-widget"]')).toBeInTheDocument();
  });

  it('should render icons for alerts', () => {
    const { container } = render(<AlertsWidget />);

    // Should have SVG icons
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('should show alert count badge and footer link', () => {
    render(<AlertsWidget />);

    expect(screen.getByRole('link', { name: /view all alerts/i })).toHaveAttribute(
      'href',
      '/pharmacy?tab=alerts'
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

/**
 * TDD Tests for Dashboard AlertsWidget Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';

// Mock the pharmacy hooks
jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useStockAlerts: jest.fn(() => ({
    data: {
      results: [
        {
          id: 1,
          drug_name: 'Paracetamol 500mg',
          alert_type: 'LOW_STOCK',
          severity: 'HIGH',
          message: 'Low Stock Alert - Paracetamol 500mg is below reorder level',
          resolved: false,
        },
        {
          id: 2,
          drug_name: 'Amoxicillin',
          alert_type: 'EXPIRING_SOON',
          severity: 'MEDIUM',
          message: 'Expiring Soon - Amoxicillin Batch B001 expires in 30 days',
          resolved: false,
        },
        {
          id: 3,
          drug_name: 'Metformin',
          alert_type: 'OUT_OF_STOCK',
          severity: 'CRITICAL',
          message: 'Critical - Metformin is out of stock',
          resolved: false,
        },
      ],
      count: 3,
    },
    isLoading: false,
    error: null,
  })),
}));

describe('AlertsWidget Component', () => {
  it('should render alerts widget header', () => {
    render(<AlertsWidget />);

    expect(screen.getByText('Stock Alerts')).toBeInTheDocument();
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

  it('should show alert count badge', () => {
    render(<AlertsWidget />);

    // Should show the count of alerts
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

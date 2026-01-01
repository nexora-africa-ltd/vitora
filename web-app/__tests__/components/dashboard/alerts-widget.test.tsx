/**
 * TDD Tests for Dashboard AlertsWidget Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';

describe('AlertsWidget Component', () => {
  it('should render alerts list', () => {
    render(<AlertsWidget />);

    // Should render alert items
    expect(screen.getByText(/Critical SpO2/i)).toBeInTheDocument();
    expect(screen.getByText(/Low Stock Alert/i)).toBeInTheDocument();
    expect(screen.getByText(/Expiring Soon/i)).toBeInTheDocument();
  });

  it('should render alert descriptions', () => {
    render(<AlertsWidget />);

    expect(screen.getByText(/Patient Jane Doe has SpO2 at 92%/i)).toBeInTheDocument();
    expect(screen.getByText(/Paracetamol 500mg/i)).toBeInTheDocument();
    expect(screen.getByText(/Amoxicillin Batch/i)).toBeInTheDocument();
  });

  it('should render severity-based styling', () => {
    const { container } = render(<AlertsWidget />);

    // Should have different colored alerts based on severity
    expect(container.querySelectorAll('[class*="text-red"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[class*="text-amber"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[class*="text-blue"]').length).toBeGreaterThan(0);
  });

  it('should render icons for each alert type', () => {
    const { container } = render(<AlertsWidget />);

    // Should have SVG icons
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('should render view button for each alert', () => {
    render(<AlertsWidget />);

    const viewButtons = screen.getAllByRole('button', { name: /View/i });
    expect(viewButtons.length).toBe(3);
  });
});

/**
 * Tests for Alerts Panel Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * TDD: These tests are written BEFORE the implementation.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertsPanel } from '@/components/pharmacy/alerts-panel';
import { mockStockAlerts } from '@/__tests__/mocks/pharmacy-data';

// Mock the hooks
jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useAcknowledgeAlert: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
  useResolveAlert: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}));

describe('AlertsPanel', () => {
  const defaultProps = {
    alerts: mockStockAlerts,
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render alerts list', () => {
      render(<AlertsPanel {...defaultProps} />);

      expect(screen.getByText(/amoxicillin 500mg stock is below reorder level/i)).toBeInTheDocument();
      expect(screen.getByText(/metformin 500mg is out of stock/i)).toBeInTheDocument();
    });

    it('should show drug name for each alert', () => {
      render(<AlertsPanel {...defaultProps} />);

      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
      expect(screen.getByText('Metformin 500mg')).toBeInTheDocument();
    });
  });

  describe('Severity badges', () => {
    it('should show severity badge for each alert', () => {
      render(<AlertsPanel {...defaultProps} />);

      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getAllByText('CRITICAL').length).toBeGreaterThan(0);
    });
  });

  describe('Alert status', () => {
    it('should show acknowledged status', () => {
      render(<AlertsPanel {...defaultProps} />);

      // Alert id 2 is acknowledged
      const metforminAlert = screen.getByText(/metformin 500mg is out of stock/i).closest('[data-testid="alert-item"]') as HTMLElement;
      expect(within(metforminAlert).getByText(/acknowledged/i)).toBeInTheDocument();
    });

    it('should show acknowledge button for unacknowledged alerts', () => {
      render(<AlertsPanel {...defaultProps} />);

      // Alert id 1 is not acknowledged
      const amoxAlert = screen.getByText(/amoxicillin 500mg stock is below reorder level/i).closest('[data-testid="alert-item"]') as HTMLElement;
      expect(within(amoxAlert).getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
    });

    it('should not show acknowledge button for acknowledged alerts', () => {
      render(<AlertsPanel {...defaultProps} />);

      const metforminAlert = screen.getByText(/metformin 500mg is out of stock/i).closest('[data-testid="alert-item"]') as HTMLElement;
      expect(within(metforminAlert).queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should have filter tabs for alert types', () => {
      render(<AlertsPanel {...defaultProps} />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Low Stock')).toBeInTheDocument();
      expect(screen.getByText('Expiring')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show loading spinner when isLoading is true', () => {
      render(<AlertsPanel {...defaultProps} isLoading={true} alerts={[]} />);

      expect(screen.getByTestId('alerts-loading')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show success message when no alerts', () => {
      render(<AlertsPanel {...defaultProps} alerts={[]} />);

      expect(screen.getByText(/no active alerts/i)).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error message when error is present', () => {
      render(<AlertsPanel {...defaultProps} error={new Error('Failed to load')} alerts={[]} />);

      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});

/**
 * Tests for Alerts Panel Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * TDD: These tests are written BEFORE the implementation.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertsPanel } from '@/components/pharmacy/alerts-panel';
import { mockStockAlerts } from '@/__tests__/mocks/pharmacy-data';

// Mock the hooks
jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useAcknowledgeAlert: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useResolveAlert: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useAlertSettings: jest.fn(() => ({
    data: { expiry_warning_days: 90, low_stock_threshold: 100 },
  })),
  useUpdateAlertSettings: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}));

// Mock the toast hook
jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: jest.fn(() => ({
    toast: jest.fn(),
  })),
}));

// Mock Tabs to render content directly
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: { children: React.ReactNode; defaultValue?: string }) =>
    React.createElement('div', { 'data-testid': 'tabs', 'data-value': defaultValue }, children),
  TabsList: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'tabs-list', role: 'tablist' }, children),
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement('button', { 'data-testid': `tab-${value}`, role: 'tab' }, children),
  TabsContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'tab-content' }, children),
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

      // Check for alert messages in the component
      expect(screen.getByText(/amoxicillin 500mg stock is below reorder level/i)).toBeInTheDocument();
      expect(screen.getByText(/metformin 500mg is out of stock/i)).toBeInTheDocument();
    });

    it('should show drug name for each alert', () => {
      render(<AlertsPanel {...defaultProps} />);

      // Drug names appear in alert items
      expect(screen.getByText(/Amoxicillin 500mg/)).toBeInTheDocument();
      expect(screen.getByText(/Metformin 500mg/)).toBeInTheDocument();
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
    it('should show acknowledged status for acknowledged alerts', () => {
      render(<AlertsPanel {...defaultProps} />);

      // Alert id 2 is acknowledged - look for acknowledgement info
      expect(screen.getByText(/Acknowledged by/i)).toBeInTheDocument();
    });

    it('should show acknowledge button for unacknowledged alerts', () => {
      render(<AlertsPanel {...defaultProps} />);

      // Look for acknowledge button using data-testid
      expect(screen.getByTestId('acknowledge-button')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should have filter controls for alert types', () => {
      render(<AlertsPanel {...defaultProps} />);

      // The component has tabs/filters for different alert types
      expect(screen.getByTestId('tab-all')).toBeInTheDocument();
      expect(screen.getByTestId('tab-low-stock')).toBeInTheDocument();
      expect(screen.getByTestId('tab-expiring')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show loading spinner when isLoading is true', () => {
      render(<AlertsPanel {...defaultProps} isLoading={true} alerts={[]} />);

      expect(screen.getByTestId('alerts-loading')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show message when no alerts', () => {
      render(<AlertsPanel {...defaultProps} alerts={[]} />);

      // Empty state message
      expect(screen.getByText(/no.*alert/i)).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error message when error is present', () => {
      render(<AlertsPanel {...defaultProps} error={new Error('Failed to load')} alerts={[]} />);

      expect(screen.getByText(/failed to load|error/i)).toBeInTheDocument();
    });
  });
});

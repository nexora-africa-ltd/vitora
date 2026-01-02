/**
 * Tests for Stock Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * TDD: These tests are written BEFORE the implementation.
 */

import { render, screen, within } from '@testing-library/react';
import { StockTable } from '@/components/pharmacy/stock-table';
import { mockStockBatches } from '@/__tests__/mocks/pharmacy-data';

describe('StockTable', () => {
  const defaultProps = {
    batches: mockStockBatches,
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    onPageChange: jest.fn(),
    onStatusFilter: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render table headers', () => {
      render(<StockTable {...defaultProps} />);

      expect(screen.getByText('Batch #')).toBeInTheDocument();
      expect(screen.getByText('Drug')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('Expiry Date')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Location')).toBeInTheDocument();
    });

    it('should render stock batch rows', () => {
      render(<StockTable {...defaultProps} />);

      expect(screen.getByText('BATCH001')).toBeInTheDocument();
      expect(screen.getByText('BATCH002')).toBeInTheDocument();
      expect(screen.getByText('BATCH003')).toBeInTheDocument();
    });

    it('should show drug name for each batch', () => {
      render(<StockTable {...defaultProps} />);

      expect(screen.getAllByText('Paracetamol 500mg').length).toBe(2);
      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
    });

    it('should show available quantity', () => {
      render(<StockTable {...defaultProps} />);

      expect(screen.getByText('450')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  describe('Status badges', () => {
    it('should show status badge for each batch', () => {
      render(<StockTable {...defaultProps} />);

      expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
      expect(screen.getByText('LOW')).toBeInTheDocument();
      expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    });
  });

  describe('Expiry date formatting', () => {
    it('should format expiry date correctly', () => {
      render(<StockTable {...defaultProps} />);

      // Dates should be formatted in a readable format
      expect(screen.getByText(/Jan 1, 2028/i)).toBeInTheDocument();
    });

    it('should highlight expired batches', () => {
      render(<StockTable {...defaultProps} />);

      // BATCH003 is expired
      const batch003Row = screen.getByText('BATCH003').closest('tr');
      expect(within(batch003Row!).getByTestId('expired-indicator')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show loading skeleton when isLoading is true', () => {
      render(<StockTable {...defaultProps} isLoading={true} batches={[]} />);

      expect(screen.getByTestId('stock-table-skeleton')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty message when no batches', () => {
      render(<StockTable {...defaultProps} batches={[]} />);

      expect(screen.getByText(/no stock batches found/i)).toBeInTheDocument();
    });
  });

  describe('Row actions', () => {
    it('should show adjust stock button for available batches', () => {
      render(<StockTable {...defaultProps} />);

      const batch001Row = screen.getByText('BATCH001').closest('tr');
      expect(within(batch001Row!).getByRole('button', { name: /adjust/i })).toBeInTheDocument();
    });

    it('should not show adjust button for expired batches', () => {
      render(<StockTable {...defaultProps} />);

      const batch003Row = screen.getByText('BATCH003').closest('tr');
      expect(within(batch003Row!).queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument();
    });
  });
});

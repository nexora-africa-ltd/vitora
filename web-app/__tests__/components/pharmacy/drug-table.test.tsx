/**
 * Tests for Drug Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * TDD: These tests are written BEFORE the implementation.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrugTable } from '@/components/pharmacy/drug-table';
import { mockDrugs } from '@/__tests__/mocks/pharmacy-data';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('DrugTable', () => {
  const defaultProps = {
    drugs: mockDrugs,
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    onPageChange: jest.fn(),
    onSearch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render table headers', () => {
      render(<DrugTable {...defaultProps} />);

      expect(screen.getByText('Code')).toBeInTheDocument();
      expect(screen.getByText('Drug Name')).toBeInTheDocument();
      expect(screen.getByText('Form')).toBeInTheDocument();
      expect(screen.getByText('Strength')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Stock')).toBeInTheDocument();
      expect(screen.getByText('Schedule')).toBeInTheDocument();
    });

    it('should render drug rows', () => {
      render(<DrugTable {...defaultProps} />);

      // Drug codes and names may appear in both mobile and desktop views
      expect(screen.getAllByText('PARA500').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Paracetamol').length).toBeGreaterThan(0);
      expect(screen.getAllByText('AMOX500').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Amoxicillin').length).toBeGreaterThan(0);
    });

    it('should show drug form as readable text', () => {
      render(<DrugTable {...defaultProps} />);

      // Multiple drugs can have "Tablet" form
      expect(screen.getAllByText('Tablet').length).toBeGreaterThan(0);
      expect(screen.getByText('Capsule')).toBeInTheDocument();
    });

    it('should show drug category', () => {
      render(<DrugTable {...defaultProps} />);

      // Categories may appear in both mobile and desktop views
      expect(screen.getAllByText('Analgesic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Antibiotic').length).toBeGreaterThan(0);
    });

    it('should show stock quantity', () => {
      render(<DrugTable {...defaultProps} />);

      // Stock quantities may appear in both mobile and desktop views
      expect(screen.getAllByText('450').length).toBeGreaterThan(0);
      expect(screen.getAllByText('25').length).toBeGreaterThan(0);
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });

    it('should show schedule badge', () => {
      render(<DrugTable {...defaultProps} />);

      // Schedule badges may appear in both mobile and desktop views
      expect(screen.getAllByText('OTC').length).toBeGreaterThan(0);
      expect(screen.getAllByText('POM').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Stock status indicators', () => {
    it('should show low stock warning for drugs below reorder level', () => {
      render(<DrugTable {...defaultProps} />);

      // Amoxicillin has 25 stock, reorder level 50 - look for warning icon or low stock text
      // The component uses AlertTriangle icon which has amber/yellow color
      const amoxElements = screen.getAllByText('AMOX500');
      const amoxRow = amoxElements.find(el => el.closest('tr'))?.closest('tr');
      if (amoxRow) {
        // Check for amber/yellow colored element indicating low stock
        const lowStockIndicator = amoxRow.querySelector('[class*="amber"], [class*="yellow"]');
        expect(lowStockIndicator).toBeInTheDocument();
      } else {
        // Mobile view - check for AlertTriangle icon or amber text
        const amberElements = document.querySelectorAll('[class*="amber"]');
        expect(amberElements.length).toBeGreaterThan(0);
      }
    });

    it('should show out of stock indicator for zero stock', () => {
      render(<DrugTable {...defaultProps} />);

      // Metformin has 0 stock - look for destructive/red colored element
      const metElements = screen.getAllByText('MET500');
      const metRow = metElements.find(el => el.closest('tr'))?.closest('tr');
      if (metRow) {
        // Check for destructive colored element indicating out of stock
        const outOfStockIndicator = metRow.querySelector('[class*="destructive"]');
        expect(outOfStockIndicator).toBeInTheDocument();
      } else {
        // Mobile view - check for destructive/red indicator
        const destructiveElements = document.querySelectorAll('[class*="destructive"]');
        expect(destructiveElements.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Search', () => {
    it('should render search input', () => {
      render(<DrugTable {...defaultProps} />);

      expect(screen.getByPlaceholderText(/search drugs/i)).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('should show pagination controls when multiple pages', () => {
      render(<DrugTable {...defaultProps} totalPages={3} />);

      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('should disable previous button on first page', () => {
      render(<DrugTable {...defaultProps} page={1} totalPages={3} />);

      expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    });

    it('should disable next button on last page', () => {
      render(<DrugTable {...defaultProps} page={3} totalPages={3} />);

      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('should call onPageChange when clicking next', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();
      render(<DrugTable {...defaultProps} page={1} totalPages={3} onPageChange={onPageChange} />);

      await user.click(screen.getByRole('button', { name: /next/i }));

      expect(onPageChange).toHaveBeenCalledWith(2);
    });
  });

  describe('Loading state', () => {
    it('should show loading skeleton when isLoading is true', () => {
      render(<DrugTable {...defaultProps} isLoading={true} drugs={[]} />);

      expect(screen.getByTestId('drug-table-skeleton')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error message when error is present', () => {
      render(<DrugTable {...defaultProps} error={new Error('Failed to load')} drugs={[]} />);

      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty message when no drugs', () => {
      render(<DrugTable {...defaultProps} drugs={[]} />);

      expect(screen.getByText(/no drugs found/i)).toBeInTheDocument();
    });
  });

  describe('Row actions', () => {
    it('should show more actions menu for each drug', () => {
      render(<DrugTable {...defaultProps} />);

      // The view action is in a dropdown menu, not a direct button
      const moreActionsButtons = screen.getAllByRole('button', { name: /more actions/i });
      expect(moreActionsButtons.length).toBe(mockDrugs.length);
    });
  });
});

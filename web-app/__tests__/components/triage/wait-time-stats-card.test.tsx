/**
 * TDD Tests for WaitTimeStatsCard Component
 *
 * Based on BDD scenarios from: features/triage/triage-reports.feature
 *
 * Test Categories:
 * 1. Display (@display)
 * 2. Category breakdown (@by-category)
 * 3. Wait time warnings (@exceeded)
 * 4. Loading state
 * 5. Date range
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { WaitTimeStatsCard } from '@/components/triage/wait-time-stats-card';
import type { WaitTimeStats, TriageCategory } from '@/lib/types/triage';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockWaitTimeStats: WaitTimeStats[] = [
  {
    category: 'RED',
    target_minutes: 0,
    avg_wait_minutes: 2,
    median_wait_minutes: 1,
    exceeded_count: 3,
    exceeded_percentage: 16.7,
    total_count: 18,
  },
  {
    category: 'ORANGE',
    target_minutes: 10,
    avg_wait_minutes: 8,
    median_wait_minutes: 7,
    exceeded_count: 12,
    exceeded_percentage: 17.9,
    total_count: 67,
  },
  {
    category: 'YELLOW',
    target_minutes: 60,
    avg_wait_minutes: 38,
    median_wait_minutes: 32,
    exceeded_count: 22,
    exceeded_percentage: 14.1,
    total_count: 156,
  },
  {
    category: 'GREEN',
    target_minutes: 240,
    avg_wait_minutes: 85,
    median_wait_minutes: 75,
    exceeded_count: 8,
    exceeded_percentage: 3.3,
    total_count: 245,
  },
  {
    category: 'BLUE',
    target_minutes: 480,
    avg_wait_minutes: 120,
    median_wait_minutes: 100,
    exceeded_count: 0,
    exceeded_percentage: 0,
    total_count: 37,
  },
];

const defaultProps = {
  stats: mockWaitTimeStats,
  overallAvgMinutes: 42,
  overallMedianMinutes: 35,
  targetMetPercentage: 85.2,
};

// =============================================================================
// DISPLAY TESTS
// =============================================================================

describe('WaitTimeStatsCard - Display', () => {
  describe('@display - Card display', () => {
    it('should display card title', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);
      expect(screen.getByText(/wait time/i)).toBeInTheDocument();
    });

    it('should display overall average wait time', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Avg Wait')).toBeInTheDocument();
    });

    it('should display overall median wait time', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);
      expect(screen.getByText('35')).toBeInTheDocument();
      expect(screen.getByText('Median')).toBeInTheDocument();
    });

    it('should display target met percentage', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);
      expect(screen.getByText('85.2%')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// CATEGORY BREAKDOWN TESTS
// =============================================================================

describe('WaitTimeStatsCard - Category Breakdown', () => {
  describe('@by-category - Wait times by category', () => {
    it('should display all KETA categories', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      expect(screen.getByText('RED')).toBeInTheDocument();
      expect(screen.getByText('ORANGE')).toBeInTheDocument();
      expect(screen.getByText('YELLOW')).toBeInTheDocument();
      expect(screen.getByText('GREEN')).toBeInTheDocument();
      expect(screen.getByText('BLUE')).toBeInTheDocument();
    });

    it('should display average wait time for each category', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      const redRow = screen.getByTestId('category-row-RED');
      expect(within(redRow).getByText(/2/)).toBeInTheDocument();

      const orangeRow = screen.getByTestId('category-row-ORANGE');
      expect(within(orangeRow).getByText(/8/)).toBeInTheDocument();
    });

    it('should display target time for each category', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      // RED target is 0 (Immediate)
      const redRow = screen.getByTestId('category-row-RED');
      expect(within(redRow).getByText(/0|imm/i)).toBeInTheDocument();

      // ORANGE target is 10
      const orangeRow = screen.getByTestId('category-row-ORANGE');
      expect(within(orangeRow).getByText(/10/)).toBeInTheDocument();
    });

    it('should show color-coded category indicators', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      const redRow = screen.getByTestId('category-row-RED');
      expect(within(redRow).getByTestId('category-indicator')).toHaveClass('bg-red-500');

      const greenRow = screen.getByTestId('category-row-GREEN');
      expect(within(greenRow).getByTestId('category-indicator')).toHaveClass('bg-green-500');
    });
  });
});

// =============================================================================
// WAIT TIME WARNINGS TESTS
// =============================================================================

describe('WaitTimeStatsCard - Warnings', () => {
  describe('@exceeded - Exceeded wait time highlighting', () => {
    it('should highlight categories with high exceeded percentage', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      // RED has 16.7% exceeded (should be highlighted)
      const redRow = screen.getByTestId('category-row-RED');
      expect(within(redRow).getByText(/16\.7%/)).toHaveClass('text-red-600');

      // ORANGE has 17.9% exceeded (should be highlighted)
      const orangeRow = screen.getByTestId('category-row-ORANGE');
      expect(within(orangeRow).getByText(/17\.9%/)).toHaveClass('text-red-600');
    });

    it('should show normal style for acceptable exceeded percentage', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      // GREEN has only 3.3% exceeded
      const greenRow = screen.getByTestId('category-row-GREEN');
      expect(within(greenRow).getByText(/3\.3%/)).not.toHaveClass('text-red-600');
    });

    it('should display exceeded count', () => {
      render(<WaitTimeStatsCard {...defaultProps} />);

      const orangeRow = screen.getByTestId('category-row-ORANGE');
      expect(within(orangeRow).getByText('12')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// LOADING STATE TESTS
// =============================================================================

describe('WaitTimeStatsCard - Loading', () => {
  it('should display loading skeleton when isLoading is true', () => {
    render(<WaitTimeStatsCard {...defaultProps} isLoading />);
    expect(screen.getByTestId('wait-time-stats-loading')).toBeInTheDocument();
  });

  it('should not display stats when loading', () => {
    render(<WaitTimeStatsCard {...defaultProps} isLoading />);
    expect(screen.queryByText('RED')).not.toBeInTheDocument();
  });
});

// =============================================================================
// EMPTY STATE TESTS
// =============================================================================

describe('WaitTimeStatsCard - Empty State', () => {
  it('should display empty state when no stats provided', () => {
    render(<WaitTimeStatsCard {...defaultProps} stats={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});

// =============================================================================
// COMPACT MODE TESTS
// =============================================================================

describe('WaitTimeStatsCard - Compact Mode', () => {
  it('should display in compact mode when specified', () => {
    render(<WaitTimeStatsCard {...defaultProps} compact />);

    // In compact mode, should show summary without full breakdown
    expect(screen.getByTestId('compact-stats')).toBeInTheDocument();
  });

  it('should show key metrics in compact mode', () => {
    render(<WaitTimeStatsCard {...defaultProps} compact />);

    expect(screen.getByText(/42/)).toBeInTheDocument(); // avg
    expect(screen.getByText(/85\.2%/)).toBeInTheDocument(); // target met
  });
});

// =============================================================================
// DATE RANGE TESTS
// =============================================================================

describe('WaitTimeStatsCard - Date Range', () => {
  it('should display date range when provided', () => {
    render(
      <WaitTimeStatsCard
        {...defaultProps}
        dateRange={{ start: '2025-12-27', end: '2026-01-03' }}
      />
    );

    expect(screen.getByText(/dec 27.*jan 3/i)).toBeInTheDocument();
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('WaitTimeStatsCard - Accessibility', () => {
  it('should have accessible structure', () => {
    render(<WaitTimeStatsCard {...defaultProps} />);

    // Should have a heading
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('should have accessible data presentation', () => {
    render(<WaitTimeStatsCard {...defaultProps} />);

    // Each category row should be in a list or table structure
    const rows = screen.getAllByTestId(/category-row-/);
    expect(rows.length).toBe(5);
  });
});

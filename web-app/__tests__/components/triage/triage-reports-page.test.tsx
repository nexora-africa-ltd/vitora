/**
 * TDD Tests for TriageReportsPage Component
 *
 * Based on BDD scenarios from: features/triage/triage-reports.feature
 *
 * Test Categories:
 * 1. Wait Time Reports (@wait-times)
 * 2. Volume Reports (@volume)
 * 3. LWBS Reports (@lwbs)
 * 4. Date Range Selection (@date-range)
 * 5. Filtering (@filter)
 * 6. Export (@export)
 * 7. Loading & Empty States
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriageReportsPage } from '@/components/triage/triage-reports-page';
import type {
  TriageReportSummary,
  WaitTimeStats,
  VolumeByCategory,
  VolumeByArea,
  LWBSStats,
  TriageCategory,
} from '@/lib/types/triage';

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

const mockVolumeByCategory: VolumeByCategory[] = [
  { category: 'RED', count: 18, percentage: 3.4 },
  { category: 'ORANGE', count: 67, percentage: 12.8 },
  { category: 'YELLOW', count: 156, percentage: 29.8 },
  { category: 'GREEN', count: 245, percentage: 46.8 },
  { category: 'BLUE', count: 37, percentage: 7.1 },
];

const mockVolumeByArea: VolumeByArea[] = [
  { area: 'ER_ACUTE', area_label: 'ER - Acute Care', count: 187 },
  { area: 'ER_FAST_TRACK', area_label: 'ER - Fast Track', count: 89 },
  { area: 'OPD', area_label: 'OPD', count: 156 },
  { area: 'ER_RESUS', area_label: 'ER - Resuscitation', count: 45 },
];

const mockLWBSStats: LWBSStats = {
  total_lwbs: 30,
  lwbs_rate: 5.7,
  avg_wait_before_lwbs_minutes: 145,
  by_category: [
    { category: 'RED', count: 0, rate: 0 },
    { category: 'ORANGE', count: 2, rate: 3 },
    { category: 'YELLOW', count: 8, rate: 5.1 },
    { category: 'GREEN', count: 15, rate: 6.1 },
    { category: 'BLUE', count: 5, rate: 13.5 },
  ],
};

const mockReportData: TriageReportSummary = {
  date_range: { start: '2025-12-27', end: '2026-01-03' },
  total_assessments: 523,
  avg_wait_time_minutes: 42,
  median_wait_time_minutes: 35,
  target_met_percentage: 85.2,
  wait_times_by_category: mockWaitTimeStats,
  volume_by_category: mockVolumeByCategory,
  volume_by_area: mockVolumeByArea,
  lwbs_stats: mockLWBSStats,
};

const defaultProps = {
  reportData: mockReportData,
  isLoading: false,
  onDateRangeChange: jest.fn(),
  onFilterChange: jest.fn(),
  onExport: jest.fn(),
};

// =============================================================================
// WAIT TIME REPORT TESTS
// =============================================================================

describe('TriageReportsPage - Wait Time Reports', () => {
  describe('@smoke @wait-times - Wait time summary', () => {
    it('should display total patients triaged', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByText('523')).toBeInTheDocument();
      expect(screen.getByText(/total.*triaged|patients.*triaged/i)).toBeInTheDocument();
    });

    it('should display average wait time', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByText(/average wait/i)).toBeInTheDocument();
      expect(screen.getByText(/42 min/)).toBeInTheDocument();
    });

    it('should display median wait time', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByText(/median wait/i)).toBeInTheDocument();
      expect(screen.getByText(/35 min/)).toBeInTheDocument();
    });

    it('should display target met percentage', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByText(/85\.2%|85.2/)).toBeInTheDocument();
      expect(screen.getByText(/target met/i)).toBeInTheDocument();
    });
  });

  describe('@wait-times @by-category - Wait times by category', () => {
    it('should display wait time table with category breakdown', () => {
      render(<TriageReportsPage {...defaultProps} />);

      // Should have a wait times section
      expect(screen.getByRole('heading', { name: /wait time/i })).toBeInTheDocument();

      // Should show categories
      const table = screen.getByTestId('wait-times-table');
      expect(within(table).getByText('RED')).toBeInTheDocument();
      expect(within(table).getByText('ORANGE')).toBeInTheDocument();
      expect(within(table).getByText('YELLOW')).toBeInTheDocument();
      expect(within(table).getByText('GREEN')).toBeInTheDocument();
      expect(within(table).getByText('BLUE')).toBeInTheDocument();
    });

    it('should display target times for each category', () => {
      render(<TriageReportsPage {...defaultProps} />);
      const table = screen.getByTestId('wait-times-table');

      // RED target is 0 min (Immediate)
      expect(within(table).getByText('Immediate')).toBeInTheDocument();
      // Check table has multiple rows with target times
      const rows = within(table).getAllByRole('row');
      expect(rows.length).toBeGreaterThan(5); // header + 5 categories
    });

    it('should display exceeded count and percentage', () => {
      render(<TriageReportsPage {...defaultProps} />);
      const table = screen.getByTestId('wait-times-table');

      // RED exceeded 16.7%
      expect(within(table).getByText(/16\.7%/)).toBeInTheDocument();
      // ORANGE exceeded 17.9%
      expect(within(table).getByText(/17\.9%/)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// VOLUME REPORT TESTS
// =============================================================================

describe('TriageReportsPage - Volume Reports', () => {
  describe('@smoke @volume - Volume summary', () => {
    it('should display total assessments', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByText('523')).toBeInTheDocument();
    });
  });

  describe('@volume @by-category - Volume by category', () => {
    it('should display volume section heading', () => {
      render(<TriageReportsPage {...defaultProps} />);

      // Should show volume section
      expect(screen.getByTestId('volume-section')).toBeInTheDocument();
    });

    it('should display category counts', () => {
      render(<TriageReportsPage {...defaultProps} />);

      // Should show RED count
      expect(screen.getByTestId('volume-RED')).toHaveTextContent('18');
      // Should show GREEN count (highest)
      expect(screen.getByTestId('volume-GREEN')).toHaveTextContent('245');
    });

    it('should display category percentages', () => {
      render(<TriageReportsPage {...defaultProps} />);

      // GREEN is highest at 46.8%
      expect(screen.getByTestId('volume-GREEN')).toHaveTextContent('46.8%');
    });
  });

  describe('@volume @by-area - Volume by area', () => {
    it('should display area volume breakdown', () => {
      render(<TriageReportsPage {...defaultProps} />);

      expect(screen.getByText('ER - Acute Care')).toBeInTheDocument();
      expect(screen.getByText('187')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// LWBS REPORT TESTS
// =============================================================================

describe('TriageReportsPage - LWBS Reports', () => {
  describe('@lwbs - LWBS summary', () => {
    it('should display total LWBS count', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByTestId('lwbs-total')).toHaveTextContent('30');
    });

    it('should display LWBS rate percentage', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByTestId('lwbs-rate')).toHaveTextContent('5.7%');
    });

    it('should display average wait before LWBS', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByText(/145 min|2 hr 25/)).toBeInTheDocument();
    });
  });

  describe('@lwbs @by-category - LWBS by category', () => {
    it('should show LWBS breakdown by category', () => {
      render(<TriageReportsPage {...defaultProps} />);

      const lwbsSection = screen.getByTestId('lwbs-section');
      // BLUE has highest LWBS rate (13.5%)
      expect(within(lwbsSection).getByText(/13\.5%/)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// DATE RANGE TESTS
// =============================================================================

describe('TriageReportsPage - Date Range Selection', () => {
  describe('@date-range - Predefined date ranges', () => {
    it('should display date range selector', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByLabelText(/date range/i)).toBeInTheDocument();
    });

    it('should display current date range', () => {
      render(<TriageReportsPage {...defaultProps} />);
      // Should show the selected range
      expect(screen.getByText(/dec 27.*jan 3|last 7 days/i)).toBeInTheDocument();
    });

    it('should call onDateRangeChange when range is selected', async () => {
      const user = userEvent.setup();
      const handleDateRangeChange = jest.fn();
      render(
        <TriageReportsPage {...defaultProps} onDateRangeChange={handleDateRangeChange} />
      );

      const dateSelector = screen.getByLabelText(/date range/i);
      await user.click(dateSelector);

      const lastMonthOption = await screen.findByText(/last 30 days/i);
      await user.click(lastMonthOption);

      expect(handleDateRangeChange).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// FILTER TESTS
// =============================================================================

describe('TriageReportsPage - Filtering', () => {
  describe('@filter @area - Filter by area', () => {
    it('should display area filter', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByLabelText(/filter.*area|area filter/i)).toBeInTheDocument();
    });
  });

  describe('@filter @category - Filter by category', () => {
    it('should display category filter', () => {
      render(<TriageReportsPage {...defaultProps} />);
      expect(screen.getByLabelText(/filter.*category|category filter/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// EXPORT TESTS
// =============================================================================

describe('TriageReportsPage - Export', () => {
  it('should display export button', () => {
    render(<TriageReportsPage {...defaultProps} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('should call onExport when export button is clicked', async () => {
    const user = userEvent.setup();
    const handleExport = jest.fn();
    render(<TriageReportsPage {...defaultProps} onExport={handleExport} />);

    const exportButton = screen.getByRole('button', { name: /export/i });
    await user.click(exportButton);

    expect(handleExport).toHaveBeenCalled();
  });
});

// =============================================================================
// LOADING & EMPTY STATES
// =============================================================================

describe('TriageReportsPage - Loading & Empty States', () => {
  it('should display loading state', () => {
    render(<TriageReportsPage {...defaultProps} isLoading />);
    expect(screen.getByTestId('reports-loading')).toBeInTheDocument();
  });

  it('should display empty state when no data', () => {
    const emptyReport: TriageReportSummary = {
      ...mockReportData,
      total_assessments: 0,
      wait_times_by_category: [],
      volume_by_category: [],
      volume_by_area: [],
    };
    render(<TriageReportsPage {...defaultProps} reportData={emptyReport} />);
    expect(screen.getByText(/no data|no assessments/i)).toBeInTheDocument();
  });
});

// =============================================================================
// PAGE STRUCTURE TESTS
// =============================================================================

describe('TriageReportsPage - Page Structure', () => {
  it('should have page title', () => {
    render(<TriageReportsPage {...defaultProps} />);
    expect(screen.getByRole('heading', { name: /triage reports/i })).toBeInTheDocument();
  });

  it('should display report sections', () => {
    render(<TriageReportsPage {...defaultProps} />);

    // Summary cards
    expect(screen.getByTestId('summary-section')).toBeInTheDocument();

    // Wait times section
    expect(screen.getByTestId('wait-times-section')).toBeInTheDocument();

    // Volume section
    expect(screen.getByTestId('volume-section')).toBeInTheDocument();

    // LWBS section
    expect(screen.getByTestId('lwbs-section')).toBeInTheDocument();
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('TriageReportsPage - Accessibility', () => {
  it('should have accessible heading structure', () => {
    render(<TriageReportsPage {...defaultProps} />);

    const mainHeading = screen.getByRole('heading', { level: 1 });
    expect(mainHeading).toHaveTextContent(/triage reports/i);
  });

  it('should have accessible filter labels', () => {
    render(<TriageReportsPage {...defaultProps} />);

    expect(screen.getByLabelText(/date range/i)).toBeInTheDocument();
  });
});

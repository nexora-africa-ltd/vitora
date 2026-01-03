/**
 * TDD Tests for TriageQueueDashboard Component
 *
 * Based on BDD scenarios from: features/triage/triage-queue.feature
 *
 * Test Categories:
 * 1. Queue Display & Sorting (@priority-sort, @patient-info, @wait-time)
 * 2. Category & Status Badges (@category-badge, @status-badge)
 * 3. Filtering (@filter)
 * 4. Search (@search)
 * 5. Queue Actions (@call-patient, @with-clinician, @complete, @lwbs)
 * 6. Queue Statistics (@queue-stats, @category-summary)
 * 7. Empty & Loading States
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriageQueueDashboard } from '@/components/triage/triage-queue-dashboard';
import type { TriageQueueItem, QueueStatus, TriageCategory } from '@/lib/types/triage';

// =============================================================================
// MOCK DATA
// =============================================================================

const createQueueItem = (overrides: Partial<TriageQueueItem> = {}): TriageQueueItem => ({
  id: Math.floor(Math.random() * 1000),
  patient_id: 1,
  patient_name: 'John Kamau',
  patient_mrn: 'MRN-20260103-0001',
  patient_age: 55,
  patient_gender: 'M',
  triage_category: 'ORANGE',
  chief_complaint_category: 'CHEST_PAIN',
  chief_complaint: 'Sharp chest pain',
  assigned_area: 'ER_ACUTE',
  assigned_area_display: 'ER - Acute Care',
  status: 'WAITING',
  arrival_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
  triage_time: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  wait_time_minutes: 10,
  alerts_count: 0,
  ...overrides,
});

const mockQueueItems: TriageQueueItem[] = [
  createQueueItem({
    id: 1,
    patient_name: 'Jane Wanjiku',
    patient_mrn: 'MRN-20260103-0001',
    triage_category: 'RED',
    arrival_time: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    wait_time_minutes: 15,
    assigned_area: 'ER_RESUS',
    assigned_area_display: 'ER - Resuscitation',
  }),
  createQueueItem({
    id: 2,
    patient_name: 'Mary Otieno',
    patient_mrn: 'MRN-20260103-0002',
    triage_category: 'RED',
    arrival_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    wait_time_minutes: 10,
    assigned_area: 'ER_RESUS',
    assigned_area_display: 'ER - Resuscitation',
  }),
  createQueueItem({
    id: 3,
    patient_name: 'John Kamau',
    patient_mrn: 'MRN-20260103-0003',
    triage_category: 'ORANGE',
    arrival_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    wait_time_minutes: 30,
    assigned_area: 'ER_ACUTE',
    assigned_area_display: 'ER - Acute Care',
  }),
  createQueueItem({
    id: 4,
    patient_name: 'Peter Odhiambo',
    patient_mrn: 'MRN-20260103-0004',
    triage_category: 'YELLOW',
    arrival_time: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    wait_time_minutes: 45,
    assigned_area: 'ER_FAST_TRACK',
    assigned_area_display: 'ER - Fast Track',
  }),
  createQueueItem({
    id: 5,
    patient_name: 'Grace Mwangi',
    patient_mrn: 'MRN-20260103-0005',
    triage_category: 'GREEN',
    arrival_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    wait_time_minutes: 60,
    assigned_area: 'OPD',
    assigned_area_display: 'OPD',
  }),
];

const defaultProps = {
  queueItems: mockQueueItems,
  onCallPatient: jest.fn(),
  onMarkWithClinician: jest.fn(),
  onMarkComplete: jest.fn(),
  onMarkLWBS: jest.fn(),
  onRefresh: jest.fn(),
  onSelectPatient: jest.fn(),
};

// =============================================================================
// QUEUE DISPLAY & SORTING TESTS
// =============================================================================

describe('TriageQueueDashboard - Queue Display', () => {
  describe('@smoke @priority-sort - Queue sorting', () => {
    it('should display queue items in priority order (RED first, then by arrival)', () => {
      render(<TriageQueueDashboard {...defaultProps} />);

      const queueCards = screen.getAllByTestId(/^queue-item-/);
      expect(queueCards).toHaveLength(5);

      // RED patients should be first (sorted by arrival time - earliest first)
      expect(queueCards[0]).toHaveTextContent('Jane Wanjiku');
      expect(queueCards[1]).toHaveTextContent('Mary Otieno');
      // Then ORANGE
      expect(queueCards[2]).toHaveTextContent('John Kamau');
      // Then YELLOW
      expect(queueCards[3]).toHaveTextContent('Peter Odhiambo');
      // Then GREEN
      expect(queueCards[4]).toHaveTextContent('Grace Mwangi');
    });
  });

  describe('@patient-info - Queue card displays patient information', () => {
    it('should display patient name', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByText('Jane Wanjiku')).toBeInTheDocument();
    });

    it('should display patient MRN', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByText(/MRN-20260103-0001/)).toBeInTheDocument();
    });

    it('should display patient age badge', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      // Age is displayed in a badge format
      expect(screen.getAllByText(/55 yrs/)[0]).toBeInTheDocument();
    });

    it('should display chief complaint with CC prefix', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getAllByText(/CC:/)[0]).toBeInTheDocument();
    });

    it('should display assigned area on card', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      // Check within the card context
      const firstCard = screen.getByTestId('queue-item-1');
      expect(firstCard).toHaveTextContent('ER - Resuscitation');
    });
  });

  describe('@wait-time - Wait time display', () => {
    it('should display wait time in minutes', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByText(/15 min/)).toBeInTheDocument();
    });

    it('should display wait time in hours for long waits', () => {
      const longWaitItem = createQueueItem({
        id: 99,
        patient_name: 'Long Wait Patient',
        wait_time_minutes: 180,
        triage_category: 'GREEN',
      });
      render(<TriageQueueDashboard {...defaultProps} queueItems={[longWaitItem]} />);
      expect(screen.getByText(/3 hr|180 min/)).toBeInTheDocument();
    });
  });

  describe('@wait-time @exceeded - Wait time warnings', () => {
    it('should show warning style when RED patient waits > 0 min', () => {
      const redPatient = createQueueItem({
        id: 99,
        patient_name: 'Critical Patient',
        triage_category: 'RED',
        wait_time_minutes: 5,
      });
      render(<TriageQueueDashboard {...defaultProps} queueItems={[redPatient]} />);

      const waitTime = screen.getByTestId('wait-time-99');
      expect(waitTime).toHaveClass('text-red-600');
    });

    it('should show warning when ORANGE patient exceeds 10 min', () => {
      const orangePatient = createQueueItem({
        id: 99,
        patient_name: 'Urgent Patient',
        triage_category: 'ORANGE',
        wait_time_minutes: 15,
      });
      render(<TriageQueueDashboard {...defaultProps} queueItems={[orangePatient]} />);

      const waitTime = screen.getByTestId('wait-time-99');
      expect(waitTime).toHaveClass('text-orange-600');
    });
  });
});

// =============================================================================
// CATEGORY & STATUS BADGES TESTS
// =============================================================================

describe('TriageQueueDashboard - Badges', () => {
  describe('@category-badge - Triage category badges', () => {
    it.each([
      { category: 'RED', color: 'red' },
      { category: 'ORANGE', color: 'orange' },
      { category: 'YELLOW', color: 'yellow' },
      { category: 'GREEN', color: 'green' },
      { category: 'BLUE', color: 'blue' },
    ] as const)('should display $color badge for $category category', ({ category }) => {
      const item = createQueueItem({ id: 99, triage_category: category });
      render(<TriageQueueDashboard {...defaultProps} queueItems={[item]} />);

      const badge = screen.getByTestId(`category-badge-99`);
      expect(badge).toHaveTextContent(category);
    });
  });

  describe('@status-badge - Queue status badges', () => {
    it.each([
      { status: 'WAITING', label: 'Waiting' },
      { status: 'CALLED', label: 'Called' },
      { status: 'WITH_CLINICIAN', label: 'With Doctor' },
    ] as const)('should display $label badge for $status status', ({ status, label }) => {
      const item = createQueueItem({ id: 99, status });
      render(<TriageQueueDashboard {...defaultProps} queueItems={[item]} />);

      // Use getAllByText since label may appear in multiple places
      const badges = screen.getAllByText(label);
      expect(badges.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// FILTERING TESTS
// =============================================================================

describe('TriageQueueDashboard - Filtering', () => {
  describe('@filter @area - Filter by assigned area', () => {
    it('should have area filter select', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByLabelText(/filter by area/i)).toBeInTheDocument();
    });
  });

  describe('@filter @category - Filter by triage category', () => {
    it('should have category filter select', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByLabelText(/filter by category/i)).toBeInTheDocument();
    });
  });

  describe('@clear-filter - Clear all filters', () => {
    it('should clear all filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<TriageQueueDashboard {...defaultProps} />);

      // First add a search term to activate filter
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Jane');

      // Clear filters
      const clearButton = screen.getByRole('button', { name: /clear/i });
      await user.click(clearButton);

      // All patients should be visible
      expect(screen.getByText('Jane Wanjiku')).toBeInTheDocument();
      expect(screen.getByText('John Kamau')).toBeInTheDocument();
      expect(screen.getByText('Peter Odhiambo')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// SEARCH TESTS
// =============================================================================

describe('TriageQueueDashboard - Search', () => {
  describe('@search - Search queue', () => {
    it('should filter queue by patient name search', async () => {
      const user = userEvent.setup();
      render(<TriageQueueDashboard {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Kamau');

      // Should only show matching patient
      expect(screen.getByText('John Kamau')).toBeInTheDocument();
      expect(screen.queryByText('Jane Wanjiku')).not.toBeInTheDocument();
    });

    it('should filter queue by MRN search', async () => {
      const user = userEvent.setup();
      render(<TriageQueueDashboard {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'MRN-20260103-0003');

      expect(screen.getByText('John Kamau')).toBeInTheDocument();
      expect(screen.queryByText('Jane Wanjiku')).not.toBeInTheDocument();
    });

    it('should show no results message when search has no matches', async () => {
      const user = userEvent.setup();
      render(<TriageQueueDashboard {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'NonExistentPatient');

      expect(screen.getByText(/no patients found/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// QUEUE ACTIONS TESTS
// =============================================================================

describe('TriageQueueDashboard - Queue Actions', () => {
  describe('@smoke @call-patient - Call patient', () => {
    it('should call onCallPatient when Call button is clicked', async () => {
      const user = userEvent.setup();
      const handleCall = jest.fn();
      render(<TriageQueueDashboard {...defaultProps} onCallPatient={handleCall} />);

      const firstCard = screen.getByTestId('queue-item-1');
      const callButton = within(firstCard).getByRole('button', { name: /call/i });
      await user.click(callButton);

      expect(handleCall).toHaveBeenCalledWith(1);
    });

    it('should show Called status after patient is called', () => {
      const calledItem = createQueueItem({
        id: 99,
        status: 'CALLED',
        called_by: 'Nurse Jane',
      });
      render(<TriageQueueDashboard {...defaultProps} queueItems={[calledItem]} />);

      expect(screen.getByText('Called')).toBeInTheDocument();
    });
  });

  describe('@with-clinician - Mark with clinician', () => {
    it('should call onMarkWithClinician when button is clicked', async () => {
      const user = userEvent.setup();
      const handleWithClinician = jest.fn();
      const calledItem = createQueueItem({ id: 99, status: 'CALLED' });
      render(
        <TriageQueueDashboard
          {...defaultProps}
          queueItems={[calledItem]}
          onMarkWithClinician={handleWithClinician}
        />
      );

      const withClinicianButton = screen.getByRole('button', { name: /with (clinician|doctor)/i });
      await user.click(withClinicianButton);

      expect(handleWithClinician).toHaveBeenCalledWith(99);
    });
  });

  describe('@complete - Mark complete', () => {
    it('should call onMarkComplete when Complete button is clicked', async () => {
      const user = userEvent.setup();
      const handleComplete = jest.fn();
      const withClinicianItem = createQueueItem({ id: 99, status: 'WITH_CLINICIAN' });
      render(
        <TriageQueueDashboard
          {...defaultProps}
          queueItems={[withClinicianItem]}
          onMarkComplete={handleComplete}
        />
      );

      const completeButton = screen.getByRole('button', { name: /complete/i });
      await user.click(completeButton);

      expect(handleComplete).toHaveBeenCalledWith(99);
    });
  });

  describe('@lwbs - Left Without Being Seen', () => {
    it('should show LWBS dialog when LWBS button is clicked', async () => {
      const user = userEvent.setup();
      render(<TriageQueueDashboard {...defaultProps} />);

      const firstCard = screen.getByTestId('queue-item-1');
      const lwbsButton = within(firstCard).getByRole('button', { name: /lwbs/i });
      await user.click(lwbsButton);

      expect(screen.getByText(/reason for lwbs/i)).toBeInTheDocument();
    });

    it('should call onMarkLWBS with reason when confirmed', async () => {
      const user = userEvent.setup();
      const handleLWBS = jest.fn();
      render(<TriageQueueDashboard {...defaultProps} onMarkLWBS={handleLWBS} />);

      const firstCard = screen.getByTestId('queue-item-1');
      const lwbsButton = within(firstCard).getByRole('button', { name: /lwbs/i });
      await user.click(lwbsButton);

      const reasonInput = screen.getByLabelText(/reason/i);
      await user.type(reasonInput, 'Patient left, stated would return later');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmButton);

      expect(handleLWBS).toHaveBeenCalledWith(1, 'Patient left, stated would return later');
    });
  });
});

// =============================================================================
// QUEUE STATISTICS TESTS
// =============================================================================

describe('TriageQueueDashboard - Statistics', () => {
  describe('@queue-stats - Queue statistics summary', () => {
    it('should display total in queue label', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByText('Total in Queue')).toBeInTheDocument();
    });

    it('should display waiting count', () => {
      render(<TriageQueueDashboard {...defaultProps} />);
      expect(screen.getByTestId('stat-waiting')).toHaveTextContent('5');
    });
  });

  describe('@category-summary - Category breakdown', () => {
    it('should display count per category', () => {
      render(<TriageQueueDashboard {...defaultProps} />);

      // Should show category counts
      expect(screen.getByTestId('category-count-RED')).toHaveTextContent('2');
      expect(screen.getByTestId('category-count-ORANGE')).toHaveTextContent('1');
      expect(screen.getByTestId('category-count-YELLOW')).toHaveTextContent('1');
      expect(screen.getByTestId('category-count-GREEN')).toHaveTextContent('1');
    });
  });
});

// =============================================================================
// EMPTY & LOADING STATES
// =============================================================================

describe('TriageQueueDashboard - Empty & Loading States', () => {
  it('should display empty state when queue is empty', () => {
    render(<TriageQueueDashboard {...defaultProps} queueItems={[]} />);
    expect(screen.getByText(/no patients in queue/i)).toBeInTheDocument();
  });

  it('should display loading state', () => {
    render(<TriageQueueDashboard {...defaultProps} isLoading />);
    expect(screen.getByTestId('queue-loading')).toBeInTheDocument();
  });
});

// =============================================================================
// REFRESH TESTS
// =============================================================================

describe('TriageQueueDashboard - Refresh', () => {
  describe('@refresh - Manual refresh', () => {
    it('should call onRefresh when refresh button is clicked', async () => {
      const user = userEvent.setup();
      const handleRefresh = jest.fn();
      render(<TriageQueueDashboard {...defaultProps} onRefresh={handleRefresh} />);

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);

      expect(handleRefresh).toHaveBeenCalled();
    });

    it('should display last updated timestamp', () => {
      render(<TriageQueueDashboard {...defaultProps} lastUpdated={new Date()} />);
      expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// PATIENT SELECTION TESTS
// =============================================================================

describe('TriageQueueDashboard - Patient Selection', () => {
  describe('@view-details - View patient details', () => {
    it('should call onSelectPatient when queue card is clicked', async () => {
      const user = userEvent.setup();
      const handleSelect = jest.fn();
      render(<TriageQueueDashboard {...defaultProps} onSelectPatient={handleSelect} />);

      const firstCard = screen.getByTestId('queue-item-1');
      await user.click(firstCard);

      expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('TriageQueueDashboard - Accessibility', () => {
  it('should have appropriate heading structure', () => {
    render(<TriageQueueDashboard {...defaultProps} />);
    expect(screen.getByRole('heading', { name: /triage queue/i })).toBeInTheDocument();
  });

  it('should have accessible labels for filters', () => {
    render(<TriageQueueDashboard {...defaultProps} />);
    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
  });
});

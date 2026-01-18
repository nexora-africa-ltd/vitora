/**
 * TDD Tests for ConsultationQueue Component
 *
 * Phase 3.1: Consultation Queue Component
 *
 * Test Categories:
 * 1. Queue Display (@queue-display, @patient-info, @wait-time)
 * 2. Triage Status Badges (@triage-badge, @bypass-badge)
 * 3. Queue Actions (@call-patient, @start-consultation)
 * 4. Loading & Empty States
 * 5. Filtering & Sorting
 * 6. Real-time Updates (polling)
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsultationQueue } from '@/components/encounters/consultation-queue';
import type { ConsultationQueueItem } from '@/lib/types/encounter';

beforeAll(() => {
  // Radix Tooltip relies on PointerEvent; JSDOM may not implement it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = window.MouseEvent;
});

// Helper to get HTMLElement from closest() for use with within()
const getClosestElement = (text: string, selector: string): HTMLElement => {
  const element = screen.getByText(text).closest(selector);
  if (!element) throw new Error(`Could not find element with selector "${selector}" near "${text}"`);
  return element as HTMLElement;
};

// =============================================================================
// MOCK DATA
// =============================================================================

const createQueueItem = (overrides: Partial<ConsultationQueueItem> = {}): ConsultationQueueItem => ({
  id: Math.floor(Math.random() * 1000),
  patient_id: 1,
  patient_name: 'John Kamau',
  patient_mrn: 'MRN-20260104-0001',
  patient_age: 45,
  patient_gender: 'M',
  encounter_type: 'OPD',
  encounter_type_display: 'Outpatient Department',
  chief_complaint: 'Headache and fever',
  triage_status: 'COMPLETED',
  triage_category: 'YELLOW',
  triage_bypass_reason: null,
  consultation_status: 'WAITING',
  arrival_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
  triage_completed_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  wait_time_minutes: 25,
  called_at: null,
  ...overrides,
});

const mockQueueItems: ConsultationQueueItem[] = [
  // RED - highest priority, longest wait
  createQueueItem({
    id: 1,
    patient_name: 'Jane Wanjiku',
    patient_mrn: 'MRN-20260104-0001',
    triage_status: 'COMPLETED',
    triage_category: 'RED',
    consultation_status: 'WAITING',
    wait_time_minutes: 5, // Even short wait for RED is urgent
    chief_complaint: 'Chest pain and shortness of breath',
  }),
  // ORANGE - second priority
  createQueueItem({
    id: 2,
    patient_name: 'Peter Odhiambo',
    patient_mrn: 'MRN-20260104-0002',
    triage_status: 'COMPLETED',
    triage_category: 'ORANGE',
    consultation_status: 'WAITING',
    wait_time_minutes: 15,
    chief_complaint: 'Severe abdominal pain',
  }),
  // YELLOW - medium priority
  createQueueItem({
    id: 3,
    patient_name: 'Mary Otieno',
    patient_mrn: 'MRN-20260104-0003',
    triage_status: 'COMPLETED',
    triage_category: 'YELLOW',
    consultation_status: 'WAITING',
    wait_time_minutes: 30,
    chief_complaint: 'Persistent cough for 2 weeks',
  }),
  // BYPASSED patient
  createQueueItem({
    id: 4,
    patient_name: 'Grace Mwangi',
    patient_mrn: 'MRN-20260104-0004',
    triage_status: 'BYPASSED',
    triage_category: null,
    triage_bypass_reason: 'STABLE_FOLLOW_UP',
    consultation_status: 'WAITING',
    wait_time_minutes: 20,
    chief_complaint: 'Follow-up for diabetes management',
  }),
  // NOT_APPLICABLE (procedure)
  createQueueItem({
    id: 5,
    patient_name: 'James Kiprotich',
    patient_mrn: 'MRN-20260104-0005',
    encounter_type: 'PROCEDURE',
    encounter_type_display: 'Scheduled Procedure',
    triage_status: 'NOT_APPLICABLE',
    triage_category: null,
    consultation_status: 'WAITING',
    wait_time_minutes: 10,
    chief_complaint: 'Scheduled endoscopy',
  }),
  // CALLED patient
  createQueueItem({
    id: 6,
    patient_name: 'Alice Njeri',
    patient_mrn: 'MRN-20260104-0006',
    triage_status: 'COMPLETED',
    triage_category: 'GREEN',
    consultation_status: 'CALLED',
    wait_time_minutes: 45,
    called_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // Called 2 min ago
    chief_complaint: 'Mild headache',
  }),
];

const defaultProps = {
  queueItems: mockQueueItems,
  onCallPatient: jest.fn(),
  onStartConsultation: jest.fn(),
  isLoading: false,
  error: null,
};

// =============================================================================
// TEST SUITE
// =============================================================================

describe('ConsultationQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Queue Display Tests
  // ===========================================================================
  describe('Queue Display', () => {
    it('should render the consultation queue header', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByText(/Consultation Queue/i)).toBeInTheDocument();
    });

    it('should display queue count', () => {
      render(<ConsultationQueue {...defaultProps} />);

      // Should show count of patients waiting
      expect(screen.getByText(/6 patients/i)).toBeInTheDocument();
    });

    it('should render all queue items', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByText('Jane Wanjiku')).toBeInTheDocument();
      expect(screen.getByText('Peter Odhiambo')).toBeInTheDocument();
      expect(screen.getByText('Mary Otieno')).toBeInTheDocument();
      expect(screen.getByText('Grace Mwangi')).toBeInTheDocument();
      expect(screen.getByText('James Kiprotich')).toBeInTheDocument();
      expect(screen.getByText('Alice Njeri')).toBeInTheDocument();
    });

    it('should display patient MRN', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByText('MRN-20260104-0001')).toBeInTheDocument();
    });

    it('should display chief complaint', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByText('Chest pain and shortness of breath')).toBeInTheDocument();
    });

    it('should display wait time', () => {
      render(<ConsultationQueue {...defaultProps} />);

      // Should show wait times - use getAllByText since multiple items may have same wait time
      expect(screen.getAllByText(/min/i).length).toBeGreaterThan(0);
    });

    it('should display encounter type', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByText('Scheduled Procedure')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 2. Triage Status Badges Tests
  // ===========================================================================
  describe('Triage Status Badges', () => {
    it('should display RED triage badge for emergency patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const janeRow = getClosestElement('Jane Wanjiku', '[data-testid="queue-item"]');
      expect(janeRow).toBeInTheDocument();
      expect(within(janeRow).getByText('RED')).toBeInTheDocument();
    });

    it('should display ORANGE triage badge', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const peterRow = getClosestElement('Peter Odhiambo', '[data-testid="queue-item"]');
      expect(within(peterRow).getByText('ORANGE')).toBeInTheDocument();
    });

    it('should display YELLOW triage badge', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const maryRow = getClosestElement('Mary Otieno', '[data-testid="queue-item"]');
      expect(within(maryRow).getByText('YELLOW')).toBeInTheDocument();
    });

    it('should display GREEN triage badge', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      expect(within(aliceRow).getByText('GREEN')).toBeInTheDocument();
    });

    it('should display "Bypassed" badge with reason for bypassed patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const graceRow = getClosestElement('Grace Mwangi', '[data-testid="queue-item"]');
      // Badge contains both "Bypassed" and "Stable follow-up" in the same element
      expect(within(graceRow).getByText(/Bypassed.*Stable follow-up/i)).toBeInTheDocument();
    });

    it('should display "Direct" badge for NOT_APPLICABLE triage status', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const jamesRow = getClosestElement('James Kiprotich', '[data-testid="queue-item"]');
      expect(within(jamesRow).getByText(/Direct/i)).toBeInTheDocument();
    });

    it('should display "CALLED" status badge for called patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      // Look for the Called badge (not the "Called X min ago" text)
      const calledBadge = within(aliceRow).getByText('📣 Called');
      expect(calledBadge).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 3. Queue Actions Tests
  // ===========================================================================
  describe('Queue Actions', () => {
    it('should render "Call Patient" button for waiting patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const callButtons = screen.getAllByRole('button', { name: /Call Patient/i });
      expect(callButtons.length).toBeGreaterThan(0);
    });

    it('should call onCallPatient when "Call Patient" is clicked', async () => {
      const user = userEvent.setup();
      render(<ConsultationQueue {...defaultProps} />);

      const janeRow = getClosestElement('Jane Wanjiku', '[data-testid="queue-item"]');
      const callButton = within(janeRow).getByRole('button', { name: /Call Patient/i });

      await user.click(callButton);

      expect(defaultProps.onCallPatient).toHaveBeenCalledWith(1);
    });

    it('should provide tooltip text for "Call Patient" button', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const janeRow = getClosestElement('Jane Wanjiku', '[data-testid="queue-item"]');
      const callButton = within(janeRow).getByRole('button', { name: /Call Patient/i });

      expect(callButton).toHaveAttribute(
        'title',
        'Mark as called and notify the patient/waiting area.'
      );
    });

    it('should render "Start Consultation" button for called patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      expect(within(aliceRow).getByRole('button', { name: /Start Consultation/i })).toBeInTheDocument();
    });

    it('should call onStartConsultation when "Start Consultation" is clicked', async () => {
      const user = userEvent.setup();
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      const startButton = within(aliceRow).getByRole('button', { name: /Start Consultation/i });

      await user.click(startButton);

      expect(defaultProps.onStartConsultation).toHaveBeenCalledWith(6);
    });

    it('should render "Re-call" button for already called patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      expect(within(aliceRow).getByRole('button', { name: /Re-call/i })).toBeInTheDocument();
    });

    it('should disable Call button while action is loading', async () => {
      const user = userEvent.setup();
      const slowCallPatient = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      render(<ConsultationQueue {...defaultProps} onCallPatient={slowCallPatient} />);

      const janeRow = getClosestElement('Jane Wanjiku', '[data-testid="queue-item"]');
      const callButton = within(janeRow).getByRole('button', { name: /Call Patient/i });

      // Click and check it shows loading state
      fireEvent.click(callButton);

      // Button should now show "Calling..." and be disabled
      await waitFor(() => {
        expect(within(janeRow).getByRole('button', { name: /Calling/i })).toBeDisabled();
      });
    });
  });

  // ===========================================================================
  // 4. Loading & Empty States Tests
  // ===========================================================================
  describe('Loading & Empty States', () => {
    it('should display loading skeleton when isLoading is true', () => {
      render(<ConsultationQueue {...defaultProps} queueItems={[]} isLoading={true} />);

      expect(screen.getByTestId('queue-loading')).toBeInTheDocument();
    });

    it('should display empty state when queue is empty', () => {
      render(<ConsultationQueue {...defaultProps} queueItems={[]} isLoading={false} />);

      expect(screen.getByTestId('empty-queue')).toBeInTheDocument();
      expect(screen.getByText(/No patients waiting/i)).toBeInTheDocument();
    });

    it('should display error message when error occurs', () => {
      render(<ConsultationQueue {...defaultProps} error="Failed to load queue" />);

      expect(screen.getByTestId('error-state')).toBeInTheDocument();
      // Error message appears multiple times in the error state
      expect(screen.getAllByText('Failed to load queue').length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 5. Filtering & Sorting Tests
  // ===========================================================================
  describe('Filtering & Sorting', () => {
    it('should sort queue by priority (RED first)', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const queueItems = screen.getAllByTestId('queue-item');
      // Called patients come first, then RED. Alice is called, Jane is RED.
      // So Alice (CALLED) should be first, then Jane (RED)
      expect(within(queueItems[0] as HTMLElement).getByText('Alice Njeri')).toBeInTheDocument();
      expect(within(queueItems[1] as HTMLElement).getByText('Jane Wanjiku')).toBeInTheDocument();
    });

    it('should render filter by triage status', async () => {
      render(<ConsultationQueue {...defaultProps} />);

      // Check for filter by status select (button trigger)
      const filterSelect = screen.getByRole('button', { name: /Filter by status/i });
      expect(filterSelect).toBeInTheDocument();
    });

    it('should filter queue when status filter is applied', async () => {
      const user = userEvent.setup();
      render(<ConsultationQueue {...defaultProps} />);

      const filterSelect = screen.getByRole('button', { name: /Filter by status/i });
      await user.click(filterSelect);

      // Wait for dropdown and select "Called"
      await waitFor(() => {
        expect(screen.getByText('Called')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Called'));

      // Should only show called patients (Alice)
      await waitFor(() => {
        expect(screen.queryByText('Jane Wanjiku')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Alice Njeri')).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByPlaceholderText(/Search patient/i)).toBeInTheDocument();
    });

    it('should filter queue by search term', async () => {
      const user = userEvent.setup();
      render(<ConsultationQueue {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(/Search patient/i);
      await user.type(searchInput, 'Jane');

      await waitFor(() => {
        expect(screen.getByText('Jane Wanjiku')).toBeInTheDocument();
        expect(screen.queryByText('Peter Odhiambo')).not.toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 6. Queue Statistics Tests
  // ===========================================================================
  describe('Queue Statistics', () => {
    it('should display queue statistics summary', () => {
      render(<ConsultationQueue {...defaultProps} />);

      expect(screen.getByTestId('queue-stats')).toBeInTheDocument();
    });

    it('should show count by triage category', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const stats = screen.getByTestId('queue-stats');
      // 1 RED, 1 ORANGE, 1 YELLOW, 1 GREEN - check for badge text format "CATEGORY: count"
      expect(within(stats).getByText(/RED: 1/)).toBeInTheDocument();
      expect(within(stats).getByText(/ORANGE: 1/)).toBeInTheDocument();
    });

    it('should show called count', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const stats = screen.getByTestId('queue-stats');
      expect(within(stats).getByText(/Called: 1/)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 7. Visual Indicators Tests
  // ===========================================================================
  describe('Visual Indicators', () => {
    it('should highlight called patients differently', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      expect(aliceRow).toHaveClass('called');
    });

    it('should show urgent indicator for long wait times', () => {
      const longWaitItem = createQueueItem({
        id: 99,
        patient_name: 'Urgent Patient',
        triage_category: 'YELLOW',
        wait_time_minutes: 120, // 2 hours
      });

      render(<ConsultationQueue {...defaultProps} queueItems={[longWaitItem]} />);

      expect(screen.getByTestId('urgent-indicator')).toBeInTheDocument();
    });

    it('should display time since called for called patients', () => {
      render(<ConsultationQueue {...defaultProps} />);

      const aliceRow = getClosestElement('Alice Njeri', '[data-testid="queue-item"]');
      expect(within(aliceRow).getByText(/Called 2 min ago/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// CONSULTATION QUEUE ITEM COMPONENT TESTS
// =============================================================================

describe('ConsultationQueueItem', () => {
  const { ConsultationQueueItem } = require('@/components/encounters/consultation-queue-item');

  const mockItem = createQueueItem({
    id: 1,
    patient_name: 'Test Patient',
    patient_mrn: 'MRN-TEST-001',
    triage_category: 'YELLOW',
    wait_time_minutes: 30,
    consultation_status: 'WAITING',
  });

  const defaultItemProps = {
    item: mockItem,
    onCall: jest.fn(),
    onStartConsultation: jest.fn(),
    isCallingPatient: false,
  };

  it('should render patient information', () => {
    render(<ConsultationQueueItem {...defaultItemProps} />);

    expect(screen.getByText('Test Patient')).toBeInTheDocument();
    expect(screen.getByText('MRN-TEST-001')).toBeInTheDocument();
  });

  it('should render correct triage badge color', () => {
    render(<ConsultationQueueItem {...defaultItemProps} />);

    const badge = screen.getByText('YELLOW');
    expect(badge).toHaveClass('bg-yellow-500');
  });

  it('should show age and gender', () => {
    render(<ConsultationQueueItem {...defaultItemProps} />);

    expect(screen.getByText(/45.*M/)).toBeInTheDocument();
  });
});

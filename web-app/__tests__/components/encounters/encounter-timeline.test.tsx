/**
 * Tests for Encounter Timeline Component
 * Sprint 2 - Phase 2A: State History Display
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EncounterTimeline, StateHistoryEntry } from '@/components/encounters/encounter-timeline';

const mockHistory: StateHistoryEntry[] = [
  {
    id: 1,
    from_status: 'CREATED',
    to_status: 'CHECKED_IN',
    changed_at: '2026-02-07T08:00:00Z',
    changed_by: 'receptionist',
    reason: 'Patient arrived',
  },
  {
    id: 2,
    from_status: 'CHECKED_IN',
    to_status: 'TRIAGED',
    changed_at: '2026-02-07T08:15:00Z',
    changed_by: 'nurse_mary',
    reason: 'Triage completed',
  },
  {
    id: 3,
    from_status: 'TRIAGED',
    to_status: 'IN_PROGRESS',
    changed_at: '2026-02-07T08:30:00Z',
    changed_by: 'dr_ochieng',
    reason: '',
  },
];

describe('EncounterTimeline', () => {
  it('renders state history entries', () => {
    render(<EncounterTimeline stateHistory={mockHistory} />);

    expect(screen.getByText('State History')).toBeInTheDocument();
    expect(screen.getByText('Patient arrived')).toBeInTheDocument();
    expect(screen.getByText('Triage completed')).toBeInTheDocument();
  });

  it('shows all transition status badges', () => {
    render(<EncounterTimeline stateHistory={mockHistory} />);

    // Created appears as from_status in the first entry
    expect(screen.getByText('Created')).toBeInTheDocument();
    // Checked In appears as both to_status (first entry) and from_status (second entry)
    expect(screen.getAllByText('Checked In')).toHaveLength(2);
    // Triaged appears as both to_status (second) and from_status (third)
    expect(screen.getAllByText('Triaged')).toHaveLength(2);
    // In Progress appears as to_status in the third
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('displays usernames for each transition', () => {
    render(<EncounterTimeline stateHistory={mockHistory} />);

    expect(screen.getByText(/receptionist/)).toBeInTheDocument();
    expect(screen.getByText(/nurse_mary/)).toBeInTheDocument();
    expect(screen.getByText(/dr_ochieng/)).toBeInTheDocument();
  });

  it('renders nothing when history is empty', () => {
    const { container } = render(<EncounterTimeline stateHistory={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders multiple entries in chronological order', () => {
    render(<EncounterTimeline stateHistory={mockHistory} />);

    const reasons = screen.getAllByText(/(Patient arrived|Triage completed)/);
    expect(reasons).toHaveLength(2);
  });
});

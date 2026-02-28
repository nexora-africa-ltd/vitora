/**
 * Tests for Encounter State Transition Component
 * Sprint 2 - Phase 2A: Enhanced State Machine
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EncounterStateTransition } from '@/components/encounters/encounter-state-transition';
import type { EncounterStatus } from '@/lib/types/encounter';

// Mock the encounters API
const mockTransition = jest.fn();
jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    transition: (...args: unknown[]) => mockTransition(...args),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('EncounterStateTransition', () => {
  const mockOnTransitionComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders transition buttons for valid next states', () => {
    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="CREATED"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    // CREATED can go to CHECKED_IN or CANCELLED
    expect(screen.getByText('Checked In')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    // Should not show invalid transitions
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
  });

  it('renders correct transitions for CHECKED_IN status', () => {
    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="CHECKED_IN"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    expect(screen.getByText('Triaged')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders correct transitions for IN_PROGRESS status', () => {
    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="IN_PROGRESS"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    expect(screen.getByText('On Hold')).toBeInTheDocument();
    expect(screen.getByText('Orders Placed')).toBeInTheDocument();
    expect(screen.getByText('Ready to Close')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders nothing for terminal states (CLOSED)', () => {
    const { container } = render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="CLOSED"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for terminal states (CANCELLED)', () => {
    const { container } = render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="CANCELLED"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows current status badge', () => {
    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="IN_PROGRESS"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    expect(screen.getByText('Current:')).toBeInTheDocument();
  });

  it('calls API on non-destructive transition click', async () => {
    mockTransition.mockResolvedValue({
      id: 1,
      status: 'CHECKED_IN',
      previous_status: 'CREATED',
      transitioned_at: '2026-02-07T10:00:00Z',
      transitioned_by: 'testuser',
    });

    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="CREATED"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    fireEvent.click(screen.getByText('Checked In'));

    await waitFor(() => {
      expect(mockTransition).toHaveBeenCalledWith(1, {
        to_status: 'CHECKED_IN',
        reason: '',
      });
    });

    await waitFor(() => {
      expect(mockOnTransitionComplete).toHaveBeenCalledWith('CHECKED_IN');
    });
  });

  it('shows confirmation dialog for CANCELLED transition', () => {
    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="CREATED"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    fireEvent.click(screen.getByText('Cancelled'));

    // Confirmation dialog should appear
    expect(screen.getByText('Cancel Encounter?')).toBeInTheDocument();
  });

  it('shows confirmation dialog for CLOSED transition', () => {
    render(
      <EncounterStateTransition
        encounterId={1}
        currentStatus="READY_TO_CLOSE"
        onTransitionComplete={mockOnTransitionComplete}
      />
    );

    fireEvent.click(screen.getByText('Closed'));

    expect(screen.getByText('Close Encounter?')).toBeInTheDocument();
  });

  it('displays all 11 status choices correctly in VALID_ENCOUNTER_TRANSITIONS', () => {
    // Verify the transition map covers all statuses
    const allStatuses: EncounterStatus[] = [
      'CREATED', 'CHECKED_IN', 'TRIAGED', 'IN_PROGRESS',
      'ON_HOLD', 'ORDERS_PLACED', 'RESULTS_PENDING',
      'READY_TO_CLOSE', 'CLOSED', 'COMPLETED', 'CANCELLED',
    ];

    const { VALID_ENCOUNTER_TRANSITIONS } = require('@/lib/types/encounter');

    allStatuses.forEach((status) => {
      expect(VALID_ENCOUNTER_TRANSITIONS).toHaveProperty(status);
    });
  });
});

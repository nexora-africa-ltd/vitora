/**
 * Tests for Encounter Status Badge Component
 * Sprint 2 - Phase 2A: Enhanced State Machine
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EncounterStatusBadge } from '@/components/encounters/encounter-status-badge';
import type { EncounterStatus } from '@/lib/types/encounter';
import { ENCOUNTER_STATUS_DISPLAY } from '@/lib/types/encounter';

describe('EncounterStatusBadge', () => {
  const allStatuses: EncounterStatus[] = [
    'CREATED',
    'CHECKED_IN',
    'TRIAGED',
    'IN_PROGRESS',
    'ON_HOLD',
    'ORDERS_PLACED',
    'RESULTS_PENDING',
    'READY_TO_CLOSE',
    'CLOSED',
    'CANCELLED',
  ];

  it.each(allStatuses)('renders correct display text for %s status', (status) => {
    render(<EncounterStatusBadge status={status} />);
    expect(screen.getByText(ENCOUNTER_STATUS_DISPLAY[status])).toBeInTheDocument();
  });

  it('renders without icon when showIcon is false', () => {
    render(<EncounterStatusBadge status="CREATED" showIcon={false} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('renders with small size', () => {
    render(<EncounterStatusBadge status="IN_PROGRESS" size="sm" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders all 10 encounter statuses', () => {
    expect(allStatuses).toHaveLength(10);
    allStatuses.forEach((status) => {
      const { unmount } = render(<EncounterStatusBadge status={status} />);
      expect(screen.getByText(ENCOUNTER_STATUS_DISPLAY[status])).toBeInTheDocument();
      unmount();
    });
  });
});

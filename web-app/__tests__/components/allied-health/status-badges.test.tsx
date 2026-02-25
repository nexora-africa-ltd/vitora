/**
 * Tests for Allied Health status badge components.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  OrderStatusBadge,
  SessionStatusBadge,
} from '@/components/allied-health/status-badges';
import { PriorityBadge } from '@/components/allied-health/priority-badge';

describe('OrderStatusBadge', () => {
  it('renders PENDING status correctly', () => {
    render(<OrderStatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders APPROVED status correctly', () => {
    render(<OrderStatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders IN_PROGRESS status correctly', () => {
    render(<OrderStatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders COMPLETED status correctly', () => {
    render(<OrderStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders CANCELLED status correctly', () => {
    render(<OrderStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders REJECTED status correctly', () => {
    render(<OrderStatusBadge status="REJECTED" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders ON_HOLD status correctly', () => {
    render(<OrderStatusBadge status="ON_HOLD" />);
    expect(screen.getByText('On Hold')).toBeInTheDocument();
  });
});

describe('SessionStatusBadge', () => {
  it('renders SCHEDULED status correctly', () => {
    render(<SessionStatusBadge status="SCHEDULED" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders IN_PROGRESS status correctly', () => {
    render(<SessionStatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders COMPLETED status correctly', () => {
    render(<SessionStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders CANCELLED status correctly', () => {
    render(<SessionStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders NO_SHOW status correctly', () => {
    render(<SessionStatusBadge status="NO_SHOW" />);
    expect(screen.getByText('No Show')).toBeInTheDocument();
  });

  it('renders RESCHEDULED status correctly', () => {
    render(<SessionStatusBadge status="RESCHEDULED" />);
    expect(screen.getByText('Rescheduled')).toBeInTheDocument();
  });
});

describe('PriorityBadge', () => {
  it('renders EMERGENCY priority correctly', () => {
    render(<PriorityBadge priority="EMERGENCY" />);
    expect(screen.getByText('Emergency')).toBeInTheDocument();
  });

  it('renders URGENT priority correctly', () => {
    render(<PriorityBadge priority="URGENT" />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('renders ROUTINE priority correctly', () => {
    render(<PriorityBadge priority="ROUTINE" />);
    expect(screen.getByText('Routine')).toBeInTheDocument();
  });

  it('renders STAT priority correctly', () => {
    render(<PriorityBadge priority="STAT" />);
    expect(screen.getByText('STAT')).toBeInTheDocument();
  });
});

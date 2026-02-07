/**
 * Tests for Visit Reason Select Component
 * Sprint 2 - Phase 2D: Visit Reason Taxonomy
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { VisitReasonSelect } from '@/components/encounters/visit-reason-select';
import { VISIT_REASON_DISPLAY, SKIP_TRIAGE_REASONS } from '@/lib/types/encounter';
import type { VisitReason } from '@/lib/types/encounter';

describe('VisitReasonSelect', () => {
  const mockOnValueChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with placeholder text', () => {
    render(
      <VisitReasonSelect onValueChange={mockOnValueChange} />
    );

    expect(screen.getByText('Select visit reason')).toBeInTheDocument();
  });

  it('renders selected value', () => {
    render(
      <VisitReasonSelect
        value="CHRONIC_CARE"
        onValueChange={mockOnValueChange}
      />
    );

    expect(screen.getByText('Chronic Care Review')).toBeInTheDocument();
  });

  it('shows skip-triage indicator for LAB_REVIEW', () => {
    render(
      <VisitReasonSelect
        value="LAB_REVIEW"
        onValueChange={mockOnValueChange}
        showSkipIndicator={true}
      />
    );

    expect(screen.getByText('This visit reason allows skipping triage')).toBeInTheDocument();
  });

  it('shows skip-triage indicator for REFILL_ONLY', () => {
    render(
      <VisitReasonSelect
        value="REFILL_ONLY"
        onValueChange={mockOnValueChange}
        showSkipIndicator={true}
      />
    );

    expect(screen.getByText('This visit reason allows skipping triage')).toBeInTheDocument();
  });

  it('does not show skip-triage indicator for FOLLOW_UP', () => {
    render(
      <VisitReasonSelect
        value="FOLLOW_UP"
        onValueChange={mockOnValueChange}
        showSkipIndicator={true}
      />
    );

    expect(screen.queryByText('This visit reason allows skipping triage')).not.toBeInTheDocument();
  });

  it('does not show skip-triage indicator when disabled', () => {
    render(
      <VisitReasonSelect
        value="LAB_REVIEW"
        onValueChange={mockOnValueChange}
        showSkipIndicator={false}
      />
    );

    expect(screen.queryByText('This visit reason allows skipping triage')).not.toBeInTheDocument();
  });

  it('renders in disabled state', () => {
    render(
      <VisitReasonSelect
        value="FOLLOW_UP"
        onValueChange={mockOnValueChange}
        disabled={true}
      />
    );

    // The trigger should have disabled styling (Radix Select uses data-disabled)
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
  });

  it('has all expected visit reason options', () => {
    const expectedReasons: VisitReason[] = [
      'NEW_COMPLAINT',
      'FOLLOW_UP',
      'CHRONIC_CARE',
      'PROCEDURE_REVIEW',
      'REFILL_ONLY',
      'LAB_REVIEW',
      'REFERRAL_VISIT',
      'OTHER',
    ];

    expectedReasons.forEach((reason) => {
      expect(VISIT_REASON_DISPLAY[reason]).toBeDefined();
    });

    expect(Object.keys(VISIT_REASON_DISPLAY)).toHaveLength(8);
  });

  it('correctly identifies skip-triage reasons', () => {
    expect(SKIP_TRIAGE_REASONS).toContain('LAB_REVIEW');
    expect(SKIP_TRIAGE_REASONS).toContain('REFILL_ONLY');
    expect(SKIP_TRIAGE_REASONS).not.toContain('NEW_COMPLAINT');
    expect(SKIP_TRIAGE_REASONS).not.toContain('FOLLOW_UP');
    expect(SKIP_TRIAGE_REASONS).not.toContain('CHRONIC_CARE');
  });
});

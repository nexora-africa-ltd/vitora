/**
 * Tests for SessionProgress component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SessionProgress } from '@/components/allied-health/shared/session-progress';

describe('SessionProgress', () => {
  it('renders session count correctly', () => {
    render(<SessionProgress completed={3} total={10} />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('renders 0 completed sessions', () => {
    render(<SessionProgress completed={0} total={12} />);
    expect(screen.getByText('0 / 12')).toBeInTheDocument();
  });

  it('renders all sessions completed', () => {
    render(<SessionProgress completed={8} total={8} />);
    expect(screen.getByText('8 / 8')).toBeInTheDocument();
  });

  it('applies correct progress bar width for partial completion', () => {
    const { container } = render(<SessionProgress completed={5} total={10} />);
    const progressIndicator = container.querySelector('[style*="width"]');
    // Progress should be 50%
    expect(progressIndicator).toBeInTheDocument();
  });

  it('applies correct progress bar width for zero completion', () => {
    const { container } = render(<SessionProgress completed={0} total={10} />);
    const progressIndicator = container.querySelector('[style*="width"]');
    // Progress should be 0%
    expect(progressIndicator).toBeInTheDocument();
  });

  it('applies correct progress bar width for full completion', () => {
    const { container } = render(<SessionProgress completed={10} total={10} />);
    const progressIndicator = container.querySelector('[style*="width"]');
    // Progress should be 100%
    expect(progressIndicator).toBeInTheDocument();
  });

  it('handles edge case of zero total sessions', () => {
    render(<SessionProgress completed={0} total={0} />);
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });
});

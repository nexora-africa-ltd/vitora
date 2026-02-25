/**
 * Tests for ModuleCard component.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModuleCard } from '@/components/allied-health/module-card';
import { Stethoscope } from 'lucide-react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('ModuleCard', () => {
  const defaultProps = {
    title: 'Physiotherapy',
    description: 'Manage physiotherapy orders',
    icon: Stethoscope,
    href: '/allied-health/physiotherapy',
    stats: {
      pending: 5,
      inProgress: 3,
      todaySessions: 10,
      completedToday: 7,
    },
  };

  it('renders module title correctly', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('Physiotherapy')).toBeInTheDocument();
  });

  it('renders module description correctly', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('Manage physiotherapy orders')).toBeInTheDocument();
  });

  it('renders pending count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders in-progress count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders today sessions count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders completed today count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders icon', () => {
    const { container } = render(<ModuleCard {...defaultProps} />);
    // Lucide icons render as SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('is a link to the href', () => {
    const { container } = render(<ModuleCard {...defaultProps} />);
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', '/allied-health/physiotherapy');
  });

  it('renders with zero stats', () => {
    const propsWithZeroStats = {
      ...defaultProps,
      stats: {
        pending: 0,
        inProgress: 0,
        todaySessions: 0,
        completedToday: 0,
      },
    };
    render(<ModuleCard {...propsWithZeroStats} />);
    // Should show 4 zeros
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });
});

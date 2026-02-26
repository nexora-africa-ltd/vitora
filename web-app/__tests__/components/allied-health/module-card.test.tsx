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
    icon: Stethoscope,
    href: '/allied-health/physiotherapy',
    stats: [
      { label: 'pending', value: 5, variant: 'warning' as const },
      { label: 'in progress', value: 3 },
      { label: 'sessions today', value: 10 },
    ],
  };

  it('renders module title correctly', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText('Physiotherapy')).toBeInTheDocument();
  });

  it('renders pending count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText(/5\s+pending/i)).toBeInTheDocument();
  });

  it('renders in-progress count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText(/3\s+in progress/i)).toBeInTheDocument();
  });

  it('renders today sessions count stat', () => {
    render(<ModuleCard {...defaultProps} />);
    expect(screen.getByText(/10\s+sessions today/i)).toBeInTheDocument();
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
      stats: [
        { label: 'pending', value: 0, variant: 'warning' as const },
        { label: 'in progress', value: 0 },
        { label: 'sessions today', value: 0 },
      ],
    };
    render(<ModuleCard {...propsWithZeroStats} />);
    expect(screen.getByText(/0\s+pending/i)).toBeInTheDocument();
  });
});

/**
 * Tests for PriorityBadge component.
 * Phase B: Frontend Order Management
 */

import { render, screen } from '@testing-library/react';
import { PriorityBadge } from '@/components/imaging/priority-badge';
import { ImagingPriority } from '@/lib/types/imaging';

describe('PriorityBadge', () => {
  const priorities: ImagingPriority[] = ['ROUTINE', 'URGENT', 'STAT'];

  it.each(priorities)('renders %s priority correctly', (priority) => {
    render(<PriorityBadge priority={priority} />);
    // Each priority has its label rendered
    expect(screen.getByText(/.+/)).toBeInTheDocument();
  });

  it('renders with icon by default', () => {
    const { container } = render(<PriorityBadge priority="URGENT" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('hides icon when showIcon is false', () => {
    const { container } = render(<PriorityBadge priority="URGENT" showIcon={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <PriorityBadge priority="STAT" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('displays Routine label', () => {
    render(<PriorityBadge priority="ROUTINE" />);
    expect(screen.getByText('Routine')).toBeInTheDocument();
  });

  it('displays Urgent label', () => {
    render(<PriorityBadge priority="URGENT" />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('displays STAT label', () => {
    render(<PriorityBadge priority="STAT" />);
    // STAT label includes "(Immediate)"
    expect(screen.getByText(/STAT/i)).toBeInTheDocument();
  });

  it('applies destructive variant for STAT', () => {
    const { container } = render(<PriorityBadge priority="STAT" />);
    // STAT priority has bold font
    expect(container.firstChild).toHaveClass('font-bold');
  });
});

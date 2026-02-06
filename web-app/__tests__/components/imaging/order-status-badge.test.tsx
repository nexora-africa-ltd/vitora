/**
 * Tests for OrderStatusBadge component.
 * Phase B: Frontend Order Management
 */

import { render, screen } from '@testing-library/react';
import { OrderStatusBadge } from '@/components/imaging/order-status-badge';
import { ImagingOrderStatus } from '@/lib/types/imaging';

describe('OrderStatusBadge', () => {
  const statuses: ImagingOrderStatus[] = [
    'DRAFT',
    'ORDERED',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'REPORTED',
    'CANCELLED',
  ];

  it.each(statuses)('renders %s status correctly', (status) => {
    const { container } = render(<OrderStatusBadge status={status} />);
    // Badge should render with some content
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with icon by default', () => {
    const { container } = render(<OrderStatusBadge status="ORDERED" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('hides icon when showIcon is false', () => {
    const { container } = render(<OrderStatusBadge status="ORDERED" showIcon={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <OrderStatusBadge status="COMPLETED" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('displays correct label for STAT priority', () => {
    render(<OrderStatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('displays correct label for CANCELLED', () => {
    render(<OrderStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('displays correct label for REPORTED', () => {
    render(<OrderStatusBadge status="REPORTED" />);
    expect(screen.getByText('Reported')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { KPICard } from '@/components/reports/kpi-card';

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('KPICard', () => {
  const defaultProps = {
    id: 'test-kpi',
    title: 'Test KPI',
    value: 100,
  };

  it('renders title and value', () => {
    render(<KPICard {...defaultProps} />);
    
    expect(screen.getByText('Test KPI')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders value with unit when provided', () => {
    render(<KPICard {...defaultProps} unit="%" />);
    
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('renders positive trend with up arrow', () => {
    render(
      <KPICard
        {...defaultProps}
        change={12.5}
        changeType="increase"
        trend="up"
      />
    );
    
    expect(screen.getByText('12.5%')).toBeInTheDocument();
  });

  it('renders negative trend with down arrow', () => {
    render(
      <KPICard
        {...defaultProps}
        change={-5.2}
        changeType="decrease"
        trend="down"
      />
    );
    
    expect(screen.getByText('5.2%')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<KPICard {...defaultProps} description="This is a test description" />);
    
    expect(screen.getByText('This is a test description')).toBeInTheDocument();
  });

  it('renders as link when href is provided', () => {
    render(<KPICard {...defaultProps} href="/patients" />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/patients');
  });

  it('applies success variant styling', () => {
    const { container } = render(<KPICard {...defaultProps} variant="success" />);
    
    expect(container.querySelector('.border-green-200')).toBeInTheDocument();
  });

  it('applies warning variant styling', () => {
    const { container } = render(<KPICard {...defaultProps} variant="warning" />);
    
    expect(container.querySelector('.border-amber-200')).toBeInTheDocument();
  });

  it('applies destructive variant styling', () => {
    const { container } = render(<KPICard {...defaultProps} variant="destructive" />);
    
    expect(container.querySelector('.border-destructive')).toBeInTheDocument();
  });

  it('renders string values correctly', () => {
    render(<KPICard {...defaultProps} value="KES 145,200" />);
    
    expect(screen.getByText('KES 145,200')).toBeInTheDocument();
  });
});

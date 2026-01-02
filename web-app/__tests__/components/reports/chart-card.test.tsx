import { render, screen } from '@testing-library/react';
import { ChartCard } from '@/components/reports/chart-card';

describe('ChartCard', () => {
  it('renders title', () => {
    render(
      <ChartCard title="Test Chart">
        <div>Chart content</div>
      </ChartCard>
    );
    
    expect(screen.getByText('Test Chart')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <ChartCard title="Test Chart" description="Chart description">
        <div>Chart content</div>
      </ChartCard>
    );
    
    expect(screen.getByText('Chart description')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <ChartCard title="Test Chart">
        <div data-testid="chart-content">Chart content</div>
      </ChartCard>
    );
    
    expect(screen.getByTestId('chart-content')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    const { container } = render(
      <ChartCard title="Test Chart" isLoading>
        <div>Chart content</div>
      </ChartCard>
    );
    
    // Should not show children when loading
    expect(screen.queryByText('Chart content')).not.toBeInTheDocument();
    // Should show skeleton
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders action element when provided', () => {
    render(
      <ChartCard
        title="Test Chart"
        action={<button>Refresh</button>}
      >
        <div>Chart content</div>
      </ChartCard>
    );
    
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ChartCard title="Test Chart" className="custom-class">
        <div>Chart content</div>
      </ChartCard>
    );
    
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});

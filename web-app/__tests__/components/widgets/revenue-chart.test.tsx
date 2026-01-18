import { render, screen } from '@testing-library/react';
import { RevenueBreakdownChart } from '@/components/widgets/revenue-chart';
import type { RevenueData } from '@/lib/types/dashboard';

// Mock the charts library components
jest.mock('@/components/charts', () => ({
  DonutChart: ({ data, showLegend, centerLabelTitle, centerLabelValue }: {
    data: Array<{ name: string; value: number }>;
    showLegend?: boolean;
    centerLabelTitle?: string;
    centerLabelValue?: string;
  }) => (
    <div data-testid="donut-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      {showLegend && <div data-testid="legend" />}
      {centerLabelTitle && <div data-testid="center-label-title">{centerLabelTitle}</div>}
      {centerLabelValue && <div data-testid="center-label-value">{centerLabelValue}</div>}
    </div>
  ),
  ChartEmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="chart-empty-state">
      <div data-testid="empty-title">{title}</div>
      <div data-testid="empty-description">{description}</div>
    </div>
  ),
  createChartConfig: jest.fn(() => ({})),
  formatChartValue: (value: number, type: string) =>
    type === 'currency' ? `KES ${value.toLocaleString()}` : value.toString(),
}));

describe('RevenueBreakdownChart', () => {
  const mockData: RevenueData[] = [
    { department: 'Consultation', amount: 45000, percentage: 31, color: '#0088FE' },
    { department: 'Laboratory', amount: 35000, percentage: 24, color: '#00C49F' },
    { department: 'Pharmacy', amount: 42000, percentage: 29, color: '#FFBB28' },
    { department: 'Procedures', amount: 23200, percentage: 16, color: '#FF8042' },
  ];

  it('renders donut chart', () => {
    render(<RevenueBreakdownChart data={mockData} />);

    expect(screen.getByTestId('donut-chart')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<RevenueBreakdownChart data={[]} />);

    expect(screen.getByTestId('chart-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-title')).toHaveTextContent('No revenue data');
  });

  it('renders legend by default', () => {
    render(<RevenueBreakdownChart data={mockData} />);

    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('hides legend when showLegend is false', () => {
    render(<RevenueBreakdownChart data={mockData} showLegend={false} />);

    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('handles null data gracefully', () => {
    // @ts-expect-error Testing null handling
    render(<RevenueBreakdownChart data={null} />);

    expect(screen.getByTestId('chart-empty-state')).toBeInTheDocument();
  });

  it('transforms data correctly for DonutChart', () => {
    render(<RevenueBreakdownChart data={mockData} />);

    const chartData = screen.getByTestId('chart-data');
    const parsed = JSON.parse(chartData.textContent || '[]');

    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toEqual({ name: 'consultation', value: 45000 });
  });

  it('displays total revenue in center label', () => {
    render(<RevenueBreakdownChart data={mockData} />);

    expect(screen.getByTestId('center-label-title')).toHaveTextContent('Total');
    // Total: 45000 + 35000 + 42000 + 23200 = 145200
    expect(screen.getByTestId('center-label-value')).toHaveTextContent('KES 145,200');
  });
});

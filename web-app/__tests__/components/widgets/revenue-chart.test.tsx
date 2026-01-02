import { render, screen } from '@testing-library/react';
import { RevenueBreakdownChart } from '@/components/widgets/revenue-chart';
import type { RevenueData } from '@/lib/types/dashboard';

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie">{children}</div>
  ),
  Cell: () => <div data-testid="cell" />,
  Legend: () => <div data-testid="legend" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

describe('RevenueBreakdownChart', () => {
  const mockData: RevenueData[] = [
    { department: 'Consultation', amount: 45000, percentage: 31, color: '#0088FE' },
    { department: 'Laboratory', amount: 35000, percentage: 24, color: '#00C49F' },
    { department: 'Pharmacy', amount: 42000, percentage: 29, color: '#FFBB28' },
    { department: 'Procedures', amount: 23200, percentage: 16, color: '#FF8042' },
  ];

  it('renders chart container', () => {
    render(<RevenueBreakdownChart data={mockData} />);
    
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders pie chart', () => {
    render(<RevenueBreakdownChart data={mockData} />);
    
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(<RevenueBreakdownChart data={[]} />);
    
    expect(screen.getByText('No revenue data available')).toBeInTheDocument();
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
    
    expect(screen.getByText('No revenue data available')).toBeInTheDocument();
  });

  it('renders cells for each data point', () => {
    render(<RevenueBreakdownChart data={mockData} />);
    
    const cells = screen.getAllByTestId('cell');
    expect(cells.length).toBe(mockData.length);
  });
});

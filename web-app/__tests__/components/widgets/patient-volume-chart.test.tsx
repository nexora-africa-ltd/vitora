import { render, screen } from '@testing-library/react';
import { PatientVolumeChart } from '@/components/widgets/patient-volume-chart';
import type { PatientVolumeData } from '@/lib/types/dashboard';

// Mock the charts library components
jest.mock('@/components/charts', () => ({
  AreaChart: ({ 
    data, 
    showLegend, 
    showGrid, 
    showXAxis, 
    showYAxis,
    dataKeys,
  }: {
    data: Array<Record<string, unknown>>;
    showLegend?: boolean;
    showGrid?: boolean;
    showXAxis?: boolean;
    showYAxis?: boolean;
    dataKeys?: string[];
  }) => (
    <div data-testid="area-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="data-keys">{JSON.stringify(dataKeys)}</div>
      {showLegend && <div data-testid="legend" />}
      {showGrid && <div data-testid="grid" />}
      {showXAxis && <div data-testid="x-axis" />}
      {showYAxis && <div data-testid="y-axis" />}
    </div>
  ),
  ChartEmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="chart-empty-state">
      <div data-testid="empty-title">{title}</div>
      <div data-testid="empty-description">{description}</div>
    </div>
  ),
  createChartConfig: jest.fn(() => ({})),
}));

describe('PatientVolumeChart', () => {
  const mockData: PatientVolumeData[] = [
    {
      date: '2026-01-01',
      registrations: 10,
      encounters: 25,
      opd: 20,
      ipd: 3,
      emergency: 2,
    },
    {
      date: '2026-01-02',
      registrations: 12,
      encounters: 30,
      opd: 22,
      ipd: 5,
      emergency: 3,
    },
  ];

  it('renders area chart', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<PatientVolumeChart data={[]} />);
    
    expect(screen.getByTestId('chart-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-title')).toHaveTextContent('No volume data');
  });

  it('renders legend by default', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('hides legend when showLegend is false', () => {
    render(<PatientVolumeChart data={mockData} showLegend={false} />);
    
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('renders chart axes', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
  });

  it('renders grid lines', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    expect(screen.getByTestId('grid')).toBeInTheDocument();
  });

  it('handles null data gracefully', () => {
    // @ts-expect-error Testing null handling
    render(<PatientVolumeChart data={null} />);
    
    expect(screen.getByTestId('chart-empty-state')).toBeInTheDocument();
  });

  it('passes correct data keys for registrations and encounters', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    const dataKeys = screen.getByTestId('data-keys');
    expect(JSON.parse(dataKeys.textContent || '[]')).toEqual(['registrations', 'encounters']);
  });

  it('formats dates correctly', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    const chartData = screen.getByTestId('chart-data');
    const parsed = JSON.parse(chartData.textContent || '[]');
    
    // Check formatted dates
    expect(parsed[0].formattedDate).toBe('Jan 1');
    expect(parsed[1].formattedDate).toBe('Jan 2');
  });
});

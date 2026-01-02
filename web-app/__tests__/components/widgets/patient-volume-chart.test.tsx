import { render, screen } from '@testing-library/react';
import { PatientVolumeChart } from '@/components/widgets/patient-volume-chart';
import type { PatientVolumeData } from '@/lib/types/dashboard';

// Mock recharts to avoid rendering issues in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
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

  it('renders chart container', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders area chart', () => {
    render(<PatientVolumeChart data={mockData} />);
    
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(<PatientVolumeChart data={[]} />);
    
    expect(screen.getByText('No data available')).toBeInTheDocument();
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
    
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });
});

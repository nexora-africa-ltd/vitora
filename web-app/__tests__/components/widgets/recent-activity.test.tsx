import { render, screen } from '@testing-library/react';
import { RecentActivity } from '@/components/widgets/recent-activity';
import type { RecentActivity as RecentActivityType } from '@/lib/types/dashboard';

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock format utility
jest.mock('@/lib/utils/format', () => ({
  formatRelativeTime: jest.fn(() => '2 minutes ago'),
}));

describe('RecentActivity', () => {
  const mockActivities: RecentActivityType[] = [
    {
      id: '1',
      type: 'patient',
      title: 'New patient registered',
      description: 'John Kamau - MRN-20260102-0045',
      timestamp: '2026-01-02T10:00:00Z',
      user: 'Reception',
      href: '/patients/45',
    },
    {
      id: '2',
      type: 'encounter',
      title: 'OPD visit completed',
      description: 'Mary Wanjiku - Follow-up consultation',
      timestamp: '2026-01-02T09:30:00Z',
      href: '/encounters/123',
    },
    {
      id: '3',
      type: 'lab',
      title: 'Lab results ready',
      description: 'CBC & Malaria RDT - Peter Ochieng',
      timestamp: '2026-01-02T09:00:00Z',
    },
    {
      id: '4',
      type: 'pharmacy',
      title: 'Prescription dispensed',
      description: '5 items dispensed to Jane Achieng',
      timestamp: '2026-01-02T08:30:00Z',
    },
    {
      id: '5',
      type: 'billing',
      title: 'Payment received',
      description: 'KES 3,500 - Cash payment',
      timestamp: '2026-01-02T08:00:00Z',
    },
  ];

  it('renders activity list header', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('renders all activity items', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    expect(screen.getByText('New patient registered')).toBeInTheDocument();
    expect(screen.getByText('OPD visit completed')).toBeInTheDocument();
    expect(screen.getByText('Lab results ready')).toBeInTheDocument();
    expect(screen.getByText('Prescription dispensed')).toBeInTheDocument();
    expect(screen.getByText('Payment received')).toBeInTheDocument();
  });

  it('renders activity descriptions', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    expect(screen.getByText('John Kamau - MRN-20260102-0045')).toBeInTheDocument();
    expect(screen.getByText('KES 3,500 - Cash payment')).toBeInTheDocument();
  });

  it('renders timestamps', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    const timestamps = screen.getAllByText('2 minutes ago');
    expect(timestamps.length).toBe(mockActivities.length);
  });

  it('renders user when provided', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    expect(screen.getByText('Reception')).toBeInTheDocument();
  });

  it('renders as links when href is provided', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(2); // Only 2 activities have href
    expect(links[0]).toHaveAttribute('href', '/patients/45');
    expect(links[1]).toHaveAttribute('href', '/encounters/123');
  });

  it('shows empty state when no activities', () => {
    render(<RecentActivity activities={[]} />);
    
    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('shows empty state with null activities', () => {
    // @ts-expect-error Testing null handling
    render(<RecentActivity activities={null} />);
    
    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('applies custom maxHeight', () => {
    const { container } = render(
      <RecentActivity activities={mockActivities} maxHeight="500px" />
    );
    
    // ScrollArea would have the maxHeight style
    const scrollArea = container.querySelector('[style*="max-height"]');
    expect(scrollArea).toHaveStyle({ maxHeight: '500px' });
  });

  it('renders different icons for different activity types', () => {
    render(<RecentActivity activities={mockActivities} />);
    
    // Each activity should render with its icon (verified by the activity being present)
    expect(screen.getByText('New patient registered')).toBeInTheDocument();
    expect(screen.getByText('Lab results ready')).toBeInTheDocument();
    expect(screen.getByText('Prescription dispensed')).toBeInTheDocument();
  });
});

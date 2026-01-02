import { render, screen } from '@testing-library/react';
import { TimelineItem } from '@/components/patients/timeline-item';
import type { TimelineEvent } from '@/lib/types/timeline';

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
  formatDate: jest.fn((date: string) => date),
  formatRelativeTime: jest.fn(() => '2 hours ago'),
}));

describe('TimelineItem', () => {
  const baseEvent: TimelineEvent = {
    id: 'encounter-1',
    type: 'encounter',
    title: 'OPD Visit',
    description: 'Routine checkup',
    timestamp: '2026-01-02T10:00:00Z',
    metadata: {
      encounterId: 1,
      encounterType: 'OPD',
      status: 'COMPLETED',
    },
  };

  it('renders event title', () => {
    render(<TimelineItem event={baseEvent} />);
    
    expect(screen.getByText('OPD Visit')).toBeInTheDocument();
  });

  it('renders event description', () => {
    render(<TimelineItem event={baseEvent} />);
    
    expect(screen.getByText('Routine checkup')).toBeInTheDocument();
  });

  it('renders relative timestamp', () => {
    render(<TimelineItem event={baseEvent} />);
    
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('renders event type badge', () => {
    render(<TimelineItem event={baseEvent} />);
    
    expect(screen.getByText('Visit')).toBeInTheDocument();
  });

  it('renders encounter type badge for encounters', () => {
    render(<TimelineItem event={baseEvent} />);
    
    expect(screen.getByText('OPD')).toBeInTheDocument();
  });

  it('renders emergency badge with destructive style', () => {
    const emergencyEvent: TimelineEvent = {
      ...baseEvent,
      metadata: {
        ...baseEvent.metadata,
        encounterType: 'EMERGENCY',
      },
    };
    
    render(<TimelineItem event={emergencyEvent} />);
    
    expect(screen.getByText('EMERGENCY')).toBeInTheDocument();
  });

  it('renders critical severity badge', () => {
    const criticalEvent: TimelineEvent = {
      ...baseEvent,
      metadata: {
        ...baseEvent.metadata,
        severity: 'critical',
      },
    };
    
    render(<TimelineItem event={criticalEvent} />);
    
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders as link for encounter events', () => {
    render(<TimelineItem event={baseEvent} />);
    
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/encounters/1');
  });

  it('renders lab result event correctly', () => {
    const labEvent: TimelineEvent = {
      id: 'lab-1',
      type: 'lab_result',
      title: 'CBC Results',
      timestamp: '2026-01-02T10:00:00Z',
    };
    
    render(<TimelineItem event={labEvent} />);
    
    expect(screen.getByText('CBC Results')).toBeInTheDocument();
    expect(screen.getByText('Lab Result')).toBeInTheDocument();
  });

  it('renders prescription event correctly', () => {
    const rxEvent: TimelineEvent = {
      id: 'rx-1',
      type: 'prescription',
      title: 'Medication Dispensed',
      timestamp: '2026-01-02T10:00:00Z',
    };
    
    render(<TimelineItem event={rxEvent} />);
    
    expect(screen.getByText('Medication Dispensed')).toBeInTheDocument();
    expect(screen.getByText('Prescription')).toBeInTheDocument();
  });

  it('renders provider when provided', () => {
    const eventWithProvider: TimelineEvent = {
      ...baseEvent,
      metadata: {
        ...baseEvent.metadata,
        provider: 'Dr. Smith',
      },
    };
    
    render(<TimelineItem event={eventWithProvider} />);
    
    expect(screen.getByText('Provider: Dr. Smith')).toBeInTheDocument();
  });

  it('renders ICD-10 code when provided', () => {
    const eventWithICD: TimelineEvent = {
      ...baseEvent,
      metadata: {
        ...baseEvent.metadata,
        icd10Code: 'J06.9',
      },
    };
    
    render(<TimelineItem event={eventWithICD} />);
    
    expect(screen.getByText('ICD-10: J06.9')).toBeInTheDocument();
  });

  it('renders status badge when provided', () => {
    render(<TimelineItem event={baseEvent} />);
    
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('renders without description when not provided', () => {
    const eventNoDesc: TimelineEvent = {
      ...baseEvent,
      description: undefined,
    };
    
    render(<TimelineItem event={eventNoDesc} />);
    
    expect(screen.queryByText('Routine checkup')).not.toBeInTheDocument();
  });
});

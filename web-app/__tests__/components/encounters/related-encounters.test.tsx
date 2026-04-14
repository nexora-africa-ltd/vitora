/**
 * Tests for Related Encounters Component
 * Sprint 2 - Phase 2B: Encounter Linking
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RelatedEncounters } from '@/components/encounters/related-encounters';
import type { RelatedEncounter } from '@/lib/types/encounter';

// Mock the encounters API
const mockGetRelated = jest.fn();
jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    getRelated: (...args: unknown[]) => mockGetRelated(...args),
  },
}));

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockRelatedEncounters: RelatedEncounter[] = [
  {
    id: 2,
    patient: 1,
    patient_mrn: 'MRN-20260101-0001',
    patient_name: 'Jane Smith',
    encounter_type: 'FOLLOW_UP',
    encounter_date: '2026-02-05',
    chief_complaint: 'Follow-up for hypertension',
    status: 'CLOSED',
    visit_reason: 'FOLLOW_UP',
    created_at: '2026-02-05T10:00:00Z',
  },
  {
    id: 3,
    patient: 1,
    patient_mrn: 'MRN-20260101-0001',
    patient_name: 'Jane Smith',
    encounter_type: 'OPD',
    encounter_date: '2026-02-07',
    chief_complaint: 'Lab results review',
    status: 'IN_PROGRESS',
    visit_reason: 'LAB_REVIEW',
    created_at: '2026-02-07T09:00:00Z',
  },
];

describe('RelatedEncounters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetRelated.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RelatedEncounters encounterId={1} patientId={1} />);
    // Loader should be present (spinner)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders related encounters when data is available', async () => {
    mockGetRelated.mockResolvedValue(mockRelatedEncounters);

    render(<RelatedEncounters encounterId={1} patientId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Related Visits (2)')).toBeInTheDocument();
    });

    expect(screen.getByText('Follow-up for hypertension')).toBeInTheDocument();
    expect(screen.getByText('Lab results review')).toBeInTheDocument();
  });

  it('renders nothing when no related encounters exist', async () => {
    mockGetRelated.mockResolvedValue([]);

    const { container } = render(<RelatedEncounters encounterId={1} patientId={1} />);

    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('shows encounter type badges', async () => {
    mockGetRelated.mockResolvedValue(mockRelatedEncounters);

    render(<RelatedEncounters encounterId={1} patientId={1} />);

    await waitFor(() => {
      expect(screen.getByText('FOLLOW_UP')).toBeInTheDocument();
      expect(screen.getByText('OPD')).toBeInTheDocument();
    });
  });

  it('shows proper status badges', async () => {
    mockGetRelated.mockResolvedValue(mockRelatedEncounters);

    render(<RelatedEncounters encounterId={1} patientId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Closed')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });
  });

  it('links to the correct encounter detail page', async () => {
    mockGetRelated.mockResolvedValue(mockRelatedEncounters);

    render(<RelatedEncounters encounterId={1} patientId={1} />);

    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', '/patients/1/encounters/2');
      expect(links[1]).toHaveAttribute('href', '/patients/1/encounters/3');
    });
  });

  it('shows error state when API fails', async () => {
    mockGetRelated.mockRejectedValue(new Error('Network error'));

    render(<RelatedEncounters encounterId={1} patientId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load related encounters')).toBeInTheDocument();
    });
  });

  it('calls API with correct encounter ID', async () => {
    mockGetRelated.mockResolvedValue([]);

    render(<RelatedEncounters encounterId={42} patientId={1} />);

    await waitFor(() => {
      expect(mockGetRelated).toHaveBeenCalledWith(42);
    });
  });
});

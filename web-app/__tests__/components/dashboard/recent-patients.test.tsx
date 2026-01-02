/**
 * TDD Tests for Dashboard RecentPatients Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { RecentPatients } from '@/components/dashboard/recent-patients';

// Mock the usePatients hook
jest.mock('@/lib/hooks/use-patients', () => ({
  usePatients: jest.fn(),
}));

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

import { usePatients } from '@/lib/hooks/use-patients';

const mockUsePatients = usePatients as jest.MockedFunction<typeof usePatients>;

describe('RecentPatients Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading skeleton while loading', () => {
    mockUsePatients.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    const { container } = render(<RecentPatients />);

    // Should show skeleton placeholders
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty message when no patients', () => {
    mockUsePatients.mockReturnValue({
      data: { results: [], count: 0 },
      isLoading: false,
      error: null,
    } as any);

    render(<RecentPatients />);

    expect(screen.getByText(/No patients found/i)).toBeInTheDocument();
  });

  it('should render patient list', () => {
    mockUsePatients.mockReturnValue({
      data: {
        results: [
          { id: 1, first_name: 'John', last_name: 'Doe', mrn: 'MRN-001', created_at: '2025-01-01T10:00:00Z' },
          { id: 2, first_name: 'Jane', last_name: 'Smith', mrn: 'MRN-002', created_at: '2025-01-02T10:00:00Z' },
        ],
        count: 2,
      },
      isLoading: false,
      error: null,
    } as any);

    render(<RecentPatients />);

    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/i)).toBeInTheDocument();
  });

  it('should render patient MRN', () => {
    mockUsePatients.mockReturnValue({
      data: {
        results: [
          { id: 1, first_name: 'John', last_name: 'Doe', mrn: 'MRN-001', created_at: '2025-01-01T10:00:00Z' },
        ],
        count: 1,
      },
      isLoading: false,
      error: null,
    } as any);

    render(<RecentPatients />);

    expect(screen.getByText(/MRN-001/i)).toBeInTheDocument();
  });

  it('should link to patient detail page', () => {
    mockUsePatients.mockReturnValue({
      data: {
        results: [
          { id: 123, first_name: 'John', last_name: 'Doe', mrn: 'MRN-001', created_at: '2025-01-01T10:00:00Z' },
        ],
        count: 1,
      },
      isLoading: false,
      error: null,
    } as any);

    render(<RecentPatients />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/patients/123');
  });

  it('should call usePatients with limit of 5', () => {
    mockUsePatients.mockReturnValue({
      data: { results: [], count: 0 },
      isLoading: false,
      error: null,
    } as any);

    render(<RecentPatients />);

    expect(mockUsePatients).toHaveBeenCalledWith({ limit: 5 });
  });

  it('should render avatars for patients', () => {
    mockUsePatients.mockReturnValue({
      data: {
        results: [
          { id: 1, first_name: 'John', last_name: 'Doe', mrn: 'MRN-001', created_at: '2025-01-01T10:00:00Z' },
        ],
        count: 1,
      },
      isLoading: false,
      error: null,
    } as any);

    const { container } = render(<RecentPatients />);

    // Should have avatar initials
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});

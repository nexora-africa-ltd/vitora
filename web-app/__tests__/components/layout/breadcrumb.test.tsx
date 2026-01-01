import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '@/components/layout/breadcrumb';

// Mock next/navigation
const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Breadcrumb', () => {
  it('should show Dashboard on home page', () => {
    mockUsePathname.mockReturnValue('/');
    render(<Breadcrumb />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should show path segments', () => {
    mockUsePathname.mockReturnValue('/patients');
    render(<Breadcrumb />);
    expect(screen.getByText('Patients')).toBeInTheDocument();
  });

  it('should show nested paths', () => {
    mockUsePathname.mockReturnValue('/patients/123');
    render(<Breadcrumb />);
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('#123')).toBeInTheDocument();
  });

  it('should have clickable links except for current page', () => {
    mockUsePathname.mockReturnValue('/patients/123');
    render(<Breadcrumb />);
    const patientsLink = screen.getByRole('link', { name: 'Patients' });
    expect(patientsLink).toHaveAttribute('href', '/patients');
    // Current page (#123) should not be a link
    const currentPage = screen.getByText('#123');
    expect(currentPage.tagName).toBe('SPAN');
  });
});

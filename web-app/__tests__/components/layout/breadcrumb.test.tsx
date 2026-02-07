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
    // Text appears in both mobile and desktop views
    expect(screen.getAllByText('Patients').length).toBeGreaterThan(0);
  });

  it('should show nested paths', () => {
    mockUsePathname.mockReturnValue('/patients/123');
    render(<Breadcrumb />);
    // Text appears in both mobile and desktop views
    expect(screen.getAllByText('Patients').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#123').length).toBeGreaterThan(0);
  });

  it('should have clickable links except for current page', () => {
    mockUsePathname.mockReturnValue('/patients/123');
    render(<Breadcrumb />);
    const patientsLink = screen.getByRole('link', { name: 'Patients' });
    expect(patientsLink).toHaveAttribute('href', '/patients');
    // Current page (#123) should not be a link - get all and check at least one is a SPAN
    const currentPages = screen.getAllByText('#123');
    expect(currentPages.some(el => el.tagName === 'SPAN')).toBe(true);
  });
});

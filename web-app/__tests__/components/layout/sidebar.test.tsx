import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));

// Mock auth hooks
jest.mock('@/lib/auth/hooks', () => ({
  useLogout: jest.fn(() => jest.fn()),
}));

describe('Sidebar', () => {
  const defaultProps = {
    collapsed: false,
    onCollapse: jest.fn(),
    mobileOpen: false,
    onMobileClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all main navigation items', () => {
    render(<Sidebar {...defaultProps} />);
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Encounters')).toBeInTheDocument();
    expect(screen.getByText('Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('Laboratory')).toBeInTheDocument();
  });

  it('should highlight active navigation item', () => {
    render(<Sidebar {...defaultProps} />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveClass('bg-primary');
  });

  it('should call onCollapse when collapse button clicked', () => {
    render(<Sidebar {...defaultProps} />);
    const collapseButton = screen.getByText('Collapse').closest('button');
    fireEvent.click(collapseButton!);
    expect(defaultProps.onCollapse).toHaveBeenCalledWith(true);
  });

  it('should hide labels when collapsed', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    // In collapsed state, labels are not rendered (not even hidden via CSS)
    // because of the {!collapsed && <span>...} logic
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('should call onMobileClose when link clicked on mobile', () => {
    render(<Sidebar {...defaultProps} mobileOpen={true} />);
    const patientLink = screen.getByRole('link', { name: /patients/i });
    fireEvent.click(patientLink);
    expect(defaultProps.onMobileClose).toHaveBeenCalled();
  });

  it('should show Vitora branding', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Vitora')).toBeInTheDocument();
  });

  it('should have logout button', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should apply correct styles when mobile sidebar is open', () => {
    render(<Sidebar {...defaultProps} mobileOpen={true} />);
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveClass('translate-x-0');
  });
});

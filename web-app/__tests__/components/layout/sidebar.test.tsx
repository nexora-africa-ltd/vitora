import React from 'react';
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

// Mock ScrollArea to avoid Radix React 19 issues
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('div', { 'data-testid': 'scroll-area', className }, children),
}));

// Mock Tooltip to avoid Radix issues
jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : React.createElement('span', null, children),
  TooltipContent: () => null,
}));

// Mock Collapsible to render children directly
jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    React.createElement('div', { 'data-testid': 'collapsible', 'data-open': open }, children),
  CollapsibleTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : React.createElement('button', null, children),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'collapsible-content' }, children),
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
    // Reset localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
      },
      writable: true,
    });
  });

  it('should render all main navigation items', () => {
    render(<Sidebar {...defaultProps} />);
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Triage')).toBeInTheDocument();
    expect(screen.getByText('Encounters')).toBeInTheDocument();
    expect(screen.getByText('Inpatient')).toBeInTheDocument();
    expect(screen.getByText('Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('should highlight active navigation item via aria-current', () => {
    render(<Sidebar {...defaultProps} />);
    // Dashboard link should have aria-current="page" when on root path
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  });

  it('should call onCollapse when collapse button clicked', () => {
    render(<Sidebar {...defaultProps} />);
    // The collapse button is a Button with variant="ghost" and size="sm" with className "w-full"
    // It's the last button in the sidebar that triggers collapse
    const buttons = screen.getAllByRole('button');
    // Find the button that's likely the collapse toggle (has w-full class and is near the end)
    const collapseButton = buttons.find(btn => 
      btn.classList.contains('w-full') && btn.closest('.mt-4')
    ) || buttons[buttons.length - 1];
    
    fireEvent.click(collapseButton);
    expect(defaultProps.onCollapse).toHaveBeenCalled();
  });

  it('should hide labels when collapsed', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    // In collapsed state, text labels are not rendered 
    // but icons and structure should still be there
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Patients')).not.toBeInTheDocument();
  });

  it('should call onMobileClose when link clicked', () => {
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
    // Just check for the text "Logout" which is always rendered when not collapsed
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should apply correct styles when mobile sidebar is open', () => {
    render(<Sidebar {...defaultProps} mobileOpen={true} />);
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveClass('translate-x-0');
  });

  it('should have Inpatient menu with Wards and Admissions children', () => {
    render(<Sidebar {...defaultProps} />);
    
    // Inpatient parent should be visible
    expect(screen.getByText('Inpatient')).toBeInTheDocument();
    
    // Children should be visible (rendered via CollapsibleContent mock)
    expect(screen.getByText('Wards')).toBeInTheDocument();
    expect(screen.getByText('Admissions')).toBeInTheDocument();
    
    // Children should be links with correct hrefs
    expect(screen.getByRole('link', { name: /wards/i })).toHaveAttribute('href', '/wards');
    expect(screen.getByRole('link', { name: /admissions/i })).toHaveAttribute('href', '/admissions');
  });

  it('should have Diagnostics menu with Laboratory and Imaging children', () => {
    render(<Sidebar {...defaultProps} />);
    
    // Diagnostics parent should be visible
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    
    // Children should be visible
    expect(screen.getByText('Laboratory')).toBeInTheDocument();
    expect(screen.getByText('Imaging')).toBeInTheDocument();
    
    // Children should be links with correct hrefs
    expect(screen.getByRole('link', { name: /laboratory/i })).toHaveAttribute('href', '/laboratory');
    expect(screen.getByRole('link', { name: /imaging/i })).toHaveAttribute('href', '/imaging');
  });
});

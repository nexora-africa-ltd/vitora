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

// Mock usePermissions to grant all access (superuser)
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: jest.fn(() => ({
    canAccessModule: () => true,
    canPerformAction: () => true,
    hasPermission: () => true,
    canEditPatient: true,
    canEditIdentity: true,
    canCreateInvoice: true,
    canCreateEncounter: true,
    canViewSensitive: true,
    role: 'ADMIN',
    roleCategory: null,
    isAuthenticated: true,
    isSuperuser: true,
  })),
}));

// Mock useFacility to allow all modules
jest.mock('@/lib/context/facility-context', () => ({
  useFacility: jest.fn(() => ({
    facility: null,
    isLoading: false,
    hasModule: () => true,
  })),
}));

// Mock ScrollArea to avoid Radix React 19 issues
jest.mock('@/components/ui/scroll-area', () => {
  const MockScrollArea = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
    ({ children, className }, ref) =>
      React.createElement('div', { ref, 'data-testid': 'scroll-area', className }, children)
  );
  MockScrollArea.displayName = 'MockScrollArea';
  return { ScrollArea: MockScrollArea };
});

// Mock Tooltip to avoid Radix issues
jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : React.createElement('span', null, children),
  TooltipContent: () => null,
}));

// Mock Collapsible (lightweight) with trigger click support.
// We still render content to keep existing tests simple, but allow the trigger
// to call onOpenChange to simulate Radix behavior.
jest.mock('@/components/ui/collapsible', () => {
  const React = require('react');
  const Ctx = React.createContext({ open: false, onOpenChange: undefined as undefined | ((open: boolean) => void) });

  function Collapsible({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) {
    return React.createElement(
      Ctx.Provider,
      { value: { open: !!open, onOpenChange } },
      React.createElement('div', { 'data-testid': 'collapsible', 'data-open': open }, children)
    );
  }

  function CollapsibleTrigger({ children, asChild }: { children: any; asChild?: boolean }) {
    const ctx = React.useContext(Ctx);
    if (asChild && React.isValidElement(children)) {
      const existingOnClick = children.props?.onClick;
      return React.cloneElement(children, {
        onClick: (e: any) => {
          existingOnClick?.(e);
          ctx.onOpenChange?.(!ctx.open);
        },
      });
    }
    return React.createElement('button', { onClick: () => ctx.onOpenChange?.(!ctx.open) }, children);
  }

  function CollapsibleContent({ children }: { children: React.ReactNode }) {
    return React.createElement('div', { 'data-testid': 'collapsible-content' }, children);
  }

  return { Collapsible, CollapsibleTrigger, CollapsibleContent };
});

describe('Sidebar', () => {
  const defaultProps = {
    collapsed: false,
    onCollapse: jest.fn(),
    mobileOpen: false,
    onMobileClose: jest.fn(),
  };

  const mockedUsePathname = require('next/navigation').usePathname as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePathname.mockReturnValue('/');
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

    // Some labels can appear more than once (e.g., mobile + desktop variants)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Patients').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Triage').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Encounters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inpatient').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pharmacy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Laboratory').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Imaging').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Theatre').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Finance').length).toBeGreaterThan(0);
  });

  it('should highlight active navigation item via aria-current', () => {
    render(<Sidebar {...defaultProps} />);
    // Dashboard link should have aria-current="page" when on root path
    const dashboardLink = screen.getAllByRole('link', { name: /dashboard/i })[0];
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
    expect(screen.getByAltText(/Vitora HMIS/i)).toBeInTheDocument();
  });

  it('should have logout button', () => {
    render(<Sidebar {...defaultProps} />);
    // Logout is now icon-only (text shown via tooltip); assert via aria-label
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
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

  it('should have Laboratory and Imaging as separate menus', () => {
    render(<Sidebar {...defaultProps} />);

    // Laboratory and Imaging parents should be visible
    expect(screen.getAllByText('Laboratory').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Imaging').length).toBeGreaterThan(0);

    // Lab children should include a Dashboard link to /laboratory
    const dashboardLinks = screen.getAllByRole('link', { name: /^dashboard$/i });
    expect(dashboardLinks.some(link => link.getAttribute('href') === '/laboratory')).toBe(true);
    expect(dashboardLinks.some(link => link.getAttribute('href') === '/imaging')).toBe(true);
  });

  it('should have Theatre menu with Schedule, Checklists, Cases, and Reports children (feature-flagged)', () => {
    // Theatre is gated behind ENABLE_THEATRE flag (defaults to true in non-production)
    render(<Sidebar {...defaultProps} />);

    // Theatre parent should be visible
    expect(screen.getByText('Theatre')).toBeInTheDocument();

    // Children should be visible
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Checklists')).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();
    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);

    // Children should be links with correct hrefs (use getAllByRole to handle potential duplicates)
    const scheduleLinks = screen.getAllByRole('link', { name: /schedule/i });
    expect(scheduleLinks.some(link => link.getAttribute('href') === '/theatre/schedule')).toBe(true);
    const checklistLinks = screen.getAllByRole('link', { name: /checklists/i });
    expect(checklistLinks.some(link => link.getAttribute('href') === '/theatre/checklists')).toBe(true);
    const casesLinks = screen.getAllByRole('link', { name: /cases/i });
    expect(casesLinks.some(link => link.getAttribute('href') === '/theatre/cases')).toBe(true);
    const reportsLinks = screen.getAllByRole('link', { name: /reports/i });
    expect(reportsLinks.some(link => link.getAttribute('href') === '/theatre/reports')).toBe(true);
  });

  it('should have Finance menu with Transactions and Insurance children', () => {
    render(<Sidebar {...defaultProps} />);

    // Finance parent should be visible
    expect(screen.getByText('Finance')).toBeInTheDocument();

    // Children should be visible
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Invoices').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Insurance').length).toBeGreaterThan(0);

    // Children should be links with correct hrefs (avoid ambiguity with the main Dashboard link)
    const dashboardLinks = screen.getAllByRole('link', { name: /^dashboard$/i });
    expect(dashboardLinks.some((l) => l.getAttribute('href') === '/finance/overview')).toBe(true);
    expect(screen.getByRole('link', { name: /invoices/i })).toHaveAttribute('href', '/transactions/invoices');
    expect(screen.getByRole('link', { name: /payments/i })).toHaveAttribute('href', '/transactions/payments');
    expect(screen.getByRole('link', { name: /insurance/i })).toHaveAttribute('href', '/insurance');
  });

  it('should have Reports under Admin', () => {
    render(<Sidebar {...defaultProps} />);

    // Admin parent should be visible
    expect(screen.getByText('Admin')).toBeInTheDocument();

    // Reports should exist as a link to /reports (as an Admin child)
    const reportsLinks = screen.getAllByRole('link', { name: /reports/i });
    expect(reportsLinks.some(link => link.getAttribute('href') === '/reports')).toBe(true);
  });

  it('should allow collapsing an active parent menu', () => {
    // Navigate to a Finance child route so Finance auto-opens
    mockedUsePathname.mockReturnValue('/insurance');

    render(<Sidebar {...defaultProps} />);

    // Finance group should start open due to active child
    const financeGroup = screen.getAllByTestId('collapsible').find((node) =>
      node.textContent?.includes('Finance')
    );
    expect(financeGroup).toHaveAttribute('data-open', 'true');

    // Clicking the group trigger should close it and it should remain closed
    fireEvent.click(screen.getByRole('button', { name: 'Finance' }));
    expect(financeGroup).toHaveAttribute('data-open', 'false');
  });
});

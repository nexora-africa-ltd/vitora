/**
 * Sidebar RBAC + Capability filtering tests
 *
 * Verifies that the sidebar correctly hides nav items when:
 * - The user's RBAC role doesn't include a module (moduleKey)
 * - The facility doesn't support a module (facilityModule)
 * - Both checks combined
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

// --- Mock setup ---

const mockCanAccessModule = jest.fn(() => true);
const mockCanPerformAction = jest.fn(() => true);
const mockHasModule = jest.fn(() => true);
const mockSearchParams = jest.fn(() => new URLSearchParams());
const mockUseNavigationMode = jest.fn(() => ({
  navigationMode: 'standard',
  isClinicalNavigationEligible: true,
}));
const mockPatientJourneyState = {
  selectedPatientId: null as number | null,
  activePatients: {} as Record<number, unknown>,
};

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useSearchParams: () => mockSearchParams(),
}));

jest.mock('@/lib/auth/hooks', () => ({
  useLogout: jest.fn(() => jest.fn()),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: jest.fn(() => ({
    canAccessModule: mockCanAccessModule,
    canPerformAction: mockCanPerformAction,
    hasPermission: () => true,
    canEditPatient: true,
    canEditIdentity: true,
    canCreateInvoice: true,
    canCreateEncounter: true,
    canViewSensitive: true,
    role: 'DOCTOR',
    roleCategory: 'CLINICAL',
    isAuthenticated: true,
    isSuperuser: false,
  })),
}));

jest.mock('@/lib/context/facility-context', () => ({
  useFacility: jest.fn(() => ({
    facility: { id: 1, name: 'Test Hospital', modules: {} },
    isLoading: false,
    hasModule: mockHasModule,
  })),
}));

jest.mock('@/lib/context/navigation-mode-context', () => ({
  useNavigationMode: () => mockUseNavigationMode(),
}));

jest.mock('@/lib/stores/patient-journey', () => ({
  usePatientJourneyStore: jest.fn((selector: (state: typeof mockPatientJourneyState) => unknown) =>
    selector(mockPatientJourneyState)
  ),
}));

// Mock Radix UI components to avoid portals/state issues in tests
jest.mock('@/components/ui/scroll-area', () => {
  const MockScrollArea = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
    ({ children, className }, ref) =>
      React.createElement('div', { ref, 'data-testid': 'scroll-area', className }, children)
  );
  MockScrollArea.displayName = 'MockScrollArea';
  return { ScrollArea: MockScrollArea };
});

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : React.createElement('span', null, children),
  TooltipContent: () => null,
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => children,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : React.createElement('span', null, children),
  PopoverContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'popover-content' }, children),
}));

jest.mock('@/components/ui/collapsible', () => {
  const React = require('react');
  function Collapsible({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) {
    return React.createElement('div', { 'data-testid': 'collapsible', 'data-open': open }, children);
  }
  function CollapsibleTrigger({ children, asChild }: { children: any; asChild?: boolean }) {
    if (asChild && React.isValidElement(children)) return children;
    return React.createElement('button', null, children);
  }
  function CollapsibleContent({ children }: { children: React.ReactNode }) {
    return React.createElement('div', { 'data-testid': 'collapsible-content' }, children);
  }
  return { Collapsible, CollapsibleTrigger, CollapsibleContent };
});

const defaultProps = {
  collapsed: false,
  onCollapse: jest.fn(),
  mobileOpen: false,
  onMobileClose: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCanAccessModule.mockReturnValue(true);
  mockCanPerformAction.mockReturnValue(true);
  mockHasModule.mockReturnValue(true);
  mockPatientJourneyState.selectedPatientId = null;
  mockPatientJourneyState.activePatients = {};
  mockUseNavigationMode.mockReturnValue({
    navigationMode: 'standard',
    isClinicalNavigationEligible: true,
  });
  mockSearchParams.mockReturnValue(new URLSearchParams());
  Object.defineProperty(window, 'localStorage', {
    value: { getItem: jest.fn(() => null), setItem: jest.fn() },
    writable: true,
  });
});

describe('Sidebar RBAC filtering', () => {
  it('hides Pharmacy when RBAC denies pharmacy module', () => {
    mockCanAccessModule.mockImplementation((key: string) => key !== 'pharmacy');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Pharmacy')).not.toBeInTheDocument();
    // Other items should still appear
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('hides Laboratory when RBAC denies laboratory module', () => {
    mockCanAccessModule.mockImplementation((key: string) => key !== 'laboratory');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Laboratory')).not.toBeInTheDocument();
  });

  it('hides AI Assistant when action access is denied', () => {
    mockCanPerformAction.mockImplementation((action: string) => action !== 'ai.use_chat');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
  });
});

describe('Sidebar facility capability filtering', () => {
  it('hides Inpatient when facility does not support inpatient', () => {
    mockHasModule.mockImplementation((key: string) => key !== 'inpatient');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Inpatient')).not.toBeInTheDocument();
    // Other items should still appear
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('hides Imaging when facility does not support imaging', () => {
    mockHasModule.mockImplementation((key: string) => key !== 'imaging');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Imaging')).not.toBeInTheDocument();
  });

  it('hides Theatre when facility does not support theatre', () => {
    mockHasModule.mockImplementation((key: string) => key !== 'theatre');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Theatre')).not.toBeInTheDocument();
  });
});

describe('Sidebar combined RBAC + capability filtering', () => {
  it('hides Pharmacy when RBAC allows but facility does not', () => {
    mockCanAccessModule.mockReturnValue(true);
    mockHasModule.mockImplementation((key: string) => key !== 'pharmacy');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Pharmacy')).not.toBeInTheDocument();
  });

  it('hides Laboratory when facility allows but RBAC does not', () => {
    mockHasModule.mockReturnValue(true);
    mockCanAccessModule.mockImplementation((key: string) => key !== 'laboratory');

    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText('Laboratory')).not.toBeInTheDocument();
  });

  it('shows everything when both RBAC and capability allow all', () => {
    render(<Sidebar {...defaultProps} />);

    expect(screen.getAllByText('Pharmacy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Laboratory').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inpatient').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Imaging').length).toBeGreaterThan(0);
  });

  it('shows workflow-oriented items in clinical mode for eligible users', () => {
    mockUseNavigationMode.mockReturnValue({
      navigationMode: 'clinical',
      isClinicalNavigationEligible: true,
    });

    render(<Sidebar {...defaultProps} />);

    expect(screen.getAllByText("Today's Queue").length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting for Triage').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting for Consult').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending Results').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pharmacy')).not.toBeInTheDocument();
  });

  it('falls back to standard module items in standard mode', () => {
    render(<Sidebar {...defaultProps} />);

    expect(screen.queryByText("Today's Queue")).not.toBeInTheDocument();
    expect(screen.getAllByText('Pharmacy').length).toBeGreaterThan(0);
  });

  it('hides outpatient workflow items when the facility lacks outpatient capability', () => {
    mockUseNavigationMode.mockReturnValue({
      navigationMode: 'clinical',
      isClinicalNavigationEligible: true,
    });
    mockHasModule.mockImplementation((key: string) => key !== 'outpatient');

    render(<Sidebar {...defaultProps} />);

    expect(screen.getAllByText("Today's Queue").length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting for Triage').length).toBeGreaterThan(0);
    expect(screen.queryByText('Waiting for Consult')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending Results')).not.toBeInTheDocument();
  });
});

/**
 * TDD Tests for PermissionGuard Component
 * Tests permission-based access control for protected routes
 *
 * Note: Authentication is now handled by middleware.ts (server-side redirect).
 * These tests focus only on permission checking.
 */
import { render, screen } from '@testing-library/react';
import { PermissionGuard, AuthGuard, RouteGuard, getModuleForRoute } from '@/lib/auth/guard';
import { useAuth } from '@/lib/auth/context';
import { useFacility } from '@/lib/context/facility-context';

// Mock the auth context
jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/context/facility-context', () => ({
  useFacility: jest.fn(),
}));

// Mock next/navigation
const mockPathname = jest.fn(() => '/');
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseFacility = useFacility as jest.MockedFunction<typeof useFacility>;

const createMockUser = (overrides: Partial<ReturnType<typeof useAuth>['user']> = {}) => ({
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  is_staff: false,
  permissions: [],
  ...overrides,
});

const createMockAuthState = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => ({
  isAuthenticated: true,
  isLoading: false,
  user: createMockUser(),
  tokens: { access: 'token', refresh: 'refresh' },
  login: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
  ...overrides,
});

describe('PermissionGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFacility.mockReturnValue({
      facility: null,
      assignedFacility: null,
      facilityOverride: null,
      isUsingFacilityOverride: false,
      isLoading: false,
      hasModule: jest.fn(() => true),
      setFacilityOverride: jest.fn(),
      clearFacilityOverride: jest.fn(),
    });
  });

  it('should show access denied for missing required permission', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({ permissions: ['read:patients'] }),
      })
    );

    render(
      <PermissionGuard requiredPermission="admin:dashboard">
        <div>Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to access this page.')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should render children when user has required permission', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({ permissions: ['admin:dashboard', 'read:patients'] }),
      })
    );

    render(
      <PermissionGuard requiredPermission="admin:dashboard">
        <div>Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
  });

  it('should show custom fallback when provided', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({ permissions: [] }),
      })
    );

    render(
      <PermissionGuard
        requiredPermission="admin:dashboard"
        fallback={<div>Custom Denied Message</div>}
      >
        <div>Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Custom Denied Message')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should show access denied when user has no permissions array', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({ permissions: undefined as unknown as string[] }),
      })
    );

    render(
      <PermissionGuard requiredPermission="admin:dashboard">
        <div>Admin Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });
});

describe('AuthGuard (deprecated)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be a passthrough component (no-op)', () => {
    mockUseAuth.mockReturnValue(createMockAuthState());

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    // AuthGuard is now a no-op - auth is handled by middleware
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

// =============================================================================
// getModuleForRoute — pure function tests
// =============================================================================

describe('getModuleForRoute', () => {
  it('maps /pharmacy to pharmacy', () => {
    expect(getModuleForRoute('/pharmacy')).toBe('pharmacy');
  });

  it('maps /pharmacy/dispensing to pharmacy', () => {
    expect(getModuleForRoute('/pharmacy/dispensing')).toBe('pharmacy');
  });

  it('maps /laboratory to laboratory', () => {
    expect(getModuleForRoute('/laboratory')).toBe('laboratory');
  });

  it('maps /admissions to inpatient', () => {
    expect(getModuleForRoute('/admissions')).toBe('inpatient');
  });

  it('maps /admissions/123/discharge to inpatient', () => {
    expect(getModuleForRoute('/admissions/123/discharge')).toBe('inpatient');
  });

  it('maps /transactions/invoices to billing', () => {
    expect(getModuleForRoute('/transactions/invoices')).toBe('billing');
  });

  it('maps /encounters to encounters', () => {
    expect(getModuleForRoute('/encounters')).toBe('encounters');
  });

  it('maps /surveillance to surveillance', () => {
    expect(getModuleForRoute('/surveillance')).toBe('surveillance');
  });

  it('maps /admin to admin', () => {
    expect(getModuleForRoute('/admin')).toBe('admin');
  });

  it('returns null for /dashboard', () => {
    expect(getModuleForRoute('/dashboard')).toBeNull();
  });

  it('returns null for root /', () => {
    expect(getModuleForRoute('/')).toBeNull();
  });

  it('returns null for unmatched routes', () => {
    expect(getModuleForRoute('/some-random-page')).toBeNull();
  });
});

// =============================================================================
// RouteGuard — integration tests
// =============================================================================

describe('RouteGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/');
    mockUseFacility.mockReturnValue({
      facility: null,
      assignedFacility: null,
      facilityOverride: null,
      isUsingFacilityOverride: false,
      isLoading: false,
      hasModule: jest.fn(() => true),
      setFacilityOverride: jest.fn(),
      clearFacilityOverride: jest.fn(),
    });
  });

  it('renders children on unrestricted route', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({ user: createMockUser({ permissions: [] }) })
    );

    mockPathname.mockReturnValue('/dashboard');

    render(
      <RouteGuard>
        <div>Dashboard</div>
      </RouteGuard>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders children when user can access the module', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: ['view_patient'],
          role: 'ADMIN',
          is_superuser: true,
        }),
      })
    );

    mockPathname.mockReturnValue('/pharmacy');

    render(
      <RouteGuard>
        <div>Pharmacy Page</div>
      </RouteGuard>
    );

    expect(screen.getByText('Pharmacy Page')).toBeInTheDocument();
  });

  it('shows Access Denied on restricted route when user lacks module access', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: [],
          role: 'BILLING_CLERK',
        }),
      })
    );

    mockPathname.mockReturnValue('/pharmacy');

    render(
      <RouteGuard>
        <div>Pharmacy Page</div>
      </RouteGuard>
    );

    expect(screen.queryByText('Pharmacy Page')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('shows Access Denied when the facility capability is disabled for the route', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: ['view_lab_results', 'laboratory.view_labresult'],
          role: 'LAB_TECH',
        }),
      })
    );

    mockUseFacility.mockReturnValue({
      facility: { id: 1, name: 'Test Facility', modules: { laboratory: false } },
      assignedFacility: null,
      facilityOverride: null,
      isUsingFacilityOverride: false,
      isLoading: false,
      hasModule: jest.fn((module: string) => module !== 'laboratory'),
      setFacilityOverride: jest.fn(),
      clearFacilityOverride: jest.fn(),
    } as any);

    mockPathname.mockReturnValue('/laboratory');

    render(
      <RouteGuard>
        <div>Laboratory Page</div>
      </RouteGuard>
    );

    expect(screen.queryByText('Laboratory Page')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('allows the theatre route when the user has scheduling view permission', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: ['scheduling.view_schedule'],
          role: 'SURGEON',
        }),
      })
    );

    mockPathname.mockReturnValue('/theatre/schedule');

    render(
      <RouteGuard>
        <div>Theatre Page</div>
      </RouteGuard>
    );

    expect(screen.getByText('Theatre Page')).toBeInTheDocument();
  });

  it('allows the finance route when the user has SHA claim permission', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: ['billing.submit_sha_claim'],
          role: 'BILLING_CLERK',
        }),
      })
    );

    mockPathname.mockReturnValue('/transactions/sha-claims');

    render(
      <RouteGuard>
        <div>SHA Claims Page</div>
      </RouteGuard>
    );

    expect(screen.getByText('SHA Claims Page')).toBeInTheDocument();
  });

  it('allows the inpatient route when the user only has ward permissions', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: ['inpatient.view_ward'],
          role: 'NURSE',
        }),
      })
    );

    mockPathname.mockReturnValue('/wards');

    render(
      <RouteGuard>
        <div>Ward Page</div>
      </RouteGuard>
    );

    expect(screen.getByText('Ward Page')).toBeInTheDocument();
  });

  it('allows the surveillance route when the user has IHR permissions', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: ['surveillance.notify_ihr_to_who'],
          role: 'SURVEILLANCE_OFFICER',
        }),
      })
    );

    mockPathname.mockReturnValue('/surveillance/ihr');

    render(
      <RouteGuard>
        <div>IHR Page</div>
      </RouteGuard>
    );

    expect(screen.getByText('IHR Page')).toBeInTheDocument();
  });

  it('shows Access Denied on the AI route when the user lacks ai.use_chat action access', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: [],
          role: 'NURSE',
        }),
      })
    );

    mockPathname.mockReturnValue('/ai');

    render(
      <RouteGuard>
        <div>AI Page</div>
      </RouteGuard>
    );

    expect(screen.queryByText('AI Page')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('allows the AI route when the user has ai.use_chat action access', () => {
    mockUseAuth.mockReturnValue(
      createMockAuthState({
        user: createMockUser({
          permissions: [],
          role: 'DOCTOR',
        }),
      })
    );

    mockPathname.mockReturnValue('/ai');

    render(
      <RouteGuard>
        <div>AI Page</div>
      </RouteGuard>
    );

    expect(screen.getByText('AI Page')).toBeInTheDocument();
  });
});

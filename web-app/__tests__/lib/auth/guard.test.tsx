/**
 * TDD Tests for PermissionGuard Component
 * Tests permission-based access control for protected routes
 * 
 * Note: Authentication is now handled by middleware.ts (server-side redirect).
 * These tests focus only on permission checking.
 */
import { render, screen } from '@testing-library/react';
import { PermissionGuard, AuthGuard } from '@/lib/auth/guard';
import { useAuth } from '@/lib/auth/context';

// Mock the auth context
jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

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

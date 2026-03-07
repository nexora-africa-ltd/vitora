import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Header } from '@/components/layout/header';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: jest.fn(),
  })),
}));

// Mock dropdown menu primitives to keep the test focused on rendered links
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  DropdownMenuSeparator: () => React.createElement('hr'),
  DropdownMenuItem: ({ children, asChild = false, ...props }: { children: React.ReactNode; asChild?: boolean } & Record<string, unknown>) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props);
    }

    return React.createElement('button', props, children);
  },
}));

// Mock auth context
jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({
    user: { username: 'testuser', first_name: 'Test', last_name: 'User' },
  })),
}));

// Mock auth hooks
jest.mock('@/lib/auth/hooks', () => ({
  useLogout: jest.fn(() => jest.fn()),
}));

// Mock network status hook
jest.mock('@/lib/hooks/use-network-status', () => ({
  useNetworkStatus: jest.fn(() => ({
    isOnline: true,
  })),
}));

// Mock sync context
jest.mock('@/lib/context/sync-context', () => ({
  useSyncStatus: jest.fn(() => ({
    lastSyncTime: new Date(),
    isSyncing: false,
    pendingChanges: 0,
    lastError: null,
    triggerSync: jest.fn(),
  })),
  formatLastSync: jest.fn(() => 'Just now'),
}));

// Mock NotificationPanel component
jest.mock('@/components/notifications/notification-panel', () => ({
  NotificationPanel: () => React.createElement('div', { 'data-testid': 'notification-panel' }, null),
}));

// Mock Breadcrumb component
jest.mock('@/components/layout/breadcrumb', () => ({
  Breadcrumb: () => React.createElement('div', { 'data-testid': 'breadcrumb' }, 'Dashboard'),
}));

// Mock Tooltip components to avoid Radix issues
jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : React.createElement('span', null, children),
  TooltipContent: () => null,
}));

describe('Header', () => {
  const defaultProps = {
    onMenuClick: jest.fn(),
    sidebarCollapsed: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render mobile menu button', () => {
    render(<Header {...defaultProps} />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('should call onMenuClick when menu button clicked', () => {
    render(<Header {...defaultProps} />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    fireEvent.click(menuButton);
    expect(defaultProps.onMenuClick).toHaveBeenCalled();
  });

  it('should render search input on desktop', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByPlaceholderText(/search patients/i)).toBeInTheDocument();
  });

  it('should render notification panel', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    render(<Header {...defaultProps} />);
    // AnimatedThemeToggle sets an explicit aria-label after mount
    return waitFor(() => {
      expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
    });
  });

  it('should render user avatar with initials', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('TU')).toBeInTheDocument(); // Test User initials
  });

  it('should provide working profile and settings links in the user menu', async () => {
    render(<Header {...defaultProps} />);

    const profileLink = await screen.findByRole('link', { name: /profile/i });
    const settingsLink = await screen.findByRole('link', { name: /settings/i });

    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });
});

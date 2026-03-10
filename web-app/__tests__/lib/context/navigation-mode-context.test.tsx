import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  NavigationModeProvider,
  useNavigationMode,
  NAVIGATION_MODE_STORAGE_KEY,
} from '@/lib/context/navigation-mode-context';

const mockUsePermissions = jest.fn();

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <NavigationModeProvider>{children}</NavigationModeProvider>;
  };
}

describe('NavigationModeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePermissions.mockReturnValue({
      role: 'DOCTOR',
      roleCategory: 'CLINICAL',
    });

    let store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => store[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
          store[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete store[key];
        }),
        clear: jest.fn(() => {
          store = {};
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  it('defaults to standard mode for eligible users', async () => {
    const { result } = renderHook(() => useNavigationMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.navigationMode).toBe('standard');
    });
    expect(result.current.isClinicalNavigationEligible).toBe(true);
  });

  it('restores a persisted clinical mode preference for eligible users', async () => {
    window.localStorage.setItem(NAVIGATION_MODE_STORAGE_KEY, 'clinical');

    const { result } = renderHook(() => useNavigationMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.navigationMode).toBe('clinical');
    });
  });

  it('falls back to standard mode for ineligible users even if clinical was stored', async () => {
    mockUsePermissions.mockReturnValue({
      role: 'BILLING_CLERK',
      roleCategory: 'ADMINISTRATIVE',
    });
    window.localStorage.setItem(NAVIGATION_MODE_STORAGE_KEY, 'clinical');

    const { result } = renderHook(() => useNavigationMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.navigationMode).toBe('standard');
    });
    expect(result.current.isClinicalNavigationEligible).toBe(false);
  });

  it('persists mode changes immediately', async () => {
    const { result } = renderHook(() => useNavigationMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.navigationMode).toBe('standard');
    });

    act(() => {
      result.current.setNavigationMode('clinical');
    });

    expect(result.current.navigationMode).toBe('clinical');
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      NAVIGATION_MODE_STORAGE_KEY,
      'clinical'
    );
  });

  it('throws when hook is used outside the provider', () => {
    const renderOutsideProvider = () => renderHook(() => useNavigationMode());

    expect(renderOutsideProvider).toThrow('useNavigationMode must be used within a NavigationModeProvider');
  });

  it('renders children normally', () => {
    render(
      <NavigationModeProvider>
        <div>Navigation mode content</div>
      </NavigationModeProvider>
    );

    expect(screen.getByText('Navigation mode content')).toBeInTheDocument();
  });
});
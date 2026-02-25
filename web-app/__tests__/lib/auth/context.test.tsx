/**
 * TDD Tests for AuthProvider and useAuth hook
 * Following TDD approach: Write tests FIRST before implementation
 */
import React, { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/lib/auth/context';

// Polyfill clearImmediate and setImmediate for JSDOM environment
if (typeof global.clearImmediate === 'undefined') {
  (global as any).clearImmediate = (id: any) => clearTimeout(id);
}
if (typeof global.setImmediate === 'undefined') {
  (global as any).setImmediate = (fn: () => void) => setTimeout(fn, 0);
}

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage with a factory to ensure fresh store per test
let localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: jest.fn((key: string) => localStorageStore[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: jest.fn(() => {
    localStorageStore = {};
  }),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Test component that uses useAuth
function TestAuthConsumer() {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();

  return (
    <div>
      <span data-testid="loading">{isLoading.toString()}</span>
      <span data-testid="authenticated">{isAuthenticated.toString()}</span>
      <span data-testid="user">{user ? user.username : 'null'}</span>
      <button onClick={() => login('testuser', 'password')}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    localStorageStore = {};
    localStorageMock.getItem.mockImplementation((key: string) => localStorageStore[key] || null);
  });

  describe('initial state', () => {
    it('should handle authentication initialization', async () => {
      // The initial loading state transitions quickly to false after mount
      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      // After initialization, loading should be false
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });

    it('should be unauthenticated initially with no stored tokens', async () => {
      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });

    it('should restore auth state from localStorage', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_staff: false,
        permissions: [],
      };

      // Set up localStorage store directly
      localStorageStore['vitora_access_token'] = 'mock_access_token';
      localStorageStore['vitora_refresh_token'] = 'mock_refresh_token';
      localStorageStore['vitora_user'] = JSON.stringify(mockUser);

      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent('testuser');
    });
  });

  describe('login', () => {
    it('should authenticate user on successful login', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_staff: false,
        permissions: [],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access: 'access_token', refresh: 'refresh_token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUser,
        });

      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });
      expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vitora_access_token',
        'access_token'
      );
    });

    it('should throw error on failed login', async () => {
      const user = userEvent.setup();
      const loginError = new Error('Invalid credentials');
      mockFetch.mockRejectedValueOnce(loginError);

      const TestWithError = () => {
        const { login } = useAuth();
        const [error, setError] = useState<string | null>(null);

        const handleLogin = async () => {
          try {
            await login('testuser', 'wrongpassword');
          } catch (e) {
            setError((e as Error).message);
          }
        };

        return (
          <div>
            <button onClick={handleLogin}>Login</button>
            {error && <span data-testid="error">{error}</span>}
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestWithError />
        </AuthProvider>
      );

      await act(async () => {
        await user.click(screen.getByText('Login'));
      });

      // Allow time for the async error handling flow
      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
      }, { timeout: 5000 });

      expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('should clear auth state and localStorage on logout', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_staff: false,
        permissions: [],
      };

      // Set up localStorage store directly
      localStorageStore['vitora_access_token'] = 'mock_access_token';
      localStorageStore['vitora_refresh_token'] = 'mock_refresh_token';
      localStorageStore['vitora_user'] = JSON.stringify(mockUser);

      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('vitora_access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('vitora_refresh_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('vitora_user');
    });
  });
});

describe('useAuth', () => {
  it('should throw error when used outside AuthProvider', () => {
    const TestComponent = () => {
      useAuth();
      return <div>Test</div>;
    };

    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );

    consoleSpy.mockRestore();
  });
});

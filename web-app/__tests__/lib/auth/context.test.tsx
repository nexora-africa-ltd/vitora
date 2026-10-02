/**
 * TDD Tests for AuthProvider and useAuth hook
 * Following TDD approach: Write tests FIRST before implementation
 */
import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/lib/auth/context';
import { clearPowerSyncDatabase, SyncProvider, useSyncStatus } from '@/lib/context/sync-context';
import { PowerSyncDatabase } from '@powersync/web';
import { apiClient } from '@/lib/api/client';

jest.mock('@powersync/web', () => ({
  PowerSyncDatabase: jest.fn(),
  Schema: jest.fn(),
  Table: jest.fn(),
  column: { text: 'text', integer: 'integer', real: 'real' },
}));

// Auth restoration verifies the cached profile against this client. Keep this
// unit test independent of the API client's interceptors and MSW handlers.
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
  },
  onFacilityChange: jest.fn(() => () => {}),
  getActiveFacilityId: jest.fn(() => 10),
}));

describe('PowerSync logout disposal', () => {
  function database(count: number) {
    return {
      disconnect: jest.fn().mockResolvedValue(undefined),
      getAll: jest.fn().mockResolvedValue([{ cnt: count }]),
      disconnectAndClear: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('clears downloaded records and closes a fully uploaded database', async () => {
    const db = database(0);
    await clearPowerSyncDatabase(db as unknown as Parameters<typeof clearPowerSyncDatabase>[0]);
    expect(db.disconnectAndClear).toHaveBeenCalledWith({ clearLocal: true });
    expect(db.close).toHaveBeenCalled();
  });

  it('quarantines unsynced clinical work instead of silently deleting it', async () => {
    const db = database(2);
    const retained = await clearPowerSyncDatabase(db as unknown as Parameters<typeof clearPowerSyncDatabase>[0]);
    expect(retained).toBe(2);
    expect(db.disconnect).toHaveBeenCalled();
    expect(db.disconnectAndClear).not.toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });

  it('does not destroy data if the pending-write check fails', async () => {
    const db = database(0);
    db.getAll.mockRejectedValue(new Error('Storage unavailable'));
    await expect(clearPowerSyncDatabase(db as unknown as Parameters<typeof clearPowerSyncDatabase>[0])).rejects.toThrow('Storage unavailable');
    expect(db.disconnectAndClear).not.toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });
});

// Polyfill clearImmediate and setImmediate for JSDOM environment
if (typeof global.clearImmediate === 'undefined') {
  (global as unknown).clearImmediate = (id: unknown) => clearTimeout(id);
}
if (typeof global.setImmediate === 'undefined') {
  (global as unknown).setImmediate = (fn: () => void) => setTimeout(fn, 0);
}

// Mock fetch using jest.spyOn for better compatibility with JSDOM
let mockFetch: jest.SpyInstance;

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

describe('PowerSync session ownership', () => {
  const instances: Array<{
    filename: string;
    disconnectAndClear: jest.Mock;
    close: jest.Mock;
  }> = [];
  const credentials = () => ({ data: {
    token: 'signed-test-token', powersync_url: 'https://sync.example.com',
    expires_at: Math.floor(Date.now() / 1000) + 3600, sync_policy_version: 2,
    user_id: String(JSON.parse(localStorageStore.vitora_user || '{}').id), facility_id: 10,
  } });
  function SyncConsumer() {
    const { db, lastError } = useSyncStatus();
    return <><span data-testid="local-ready">{String(!!db)}</span><span data-testid="sync-error">{lastError}</span></>;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    instances.length = 0;
    process.env.NEXT_PUBLIC_POWERSYNC_URL = 'https://sync.example.com';
    localStorageStore = { vitora_user: JSON.stringify({ id: 1, username: 'first', permissions: [] }) };
    (apiClient.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(
      url === '/api/powersync/credentials/' ? credentials() : { data: {} }
    ));
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ user: { id: 2, username: 'second', permissions: [] } }) } as Response);
    (PowerSyncDatabase as unknown as jest.Mock).mockImplementation((options) => {
      const db = {
        filename: options.database.dbFilename,
        init: jest.fn().mockResolvedValue(undefined),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        disconnectAndClear: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getAll: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        registerListener: jest.fn(() => () => {}),
        onChange: jest.fn(() => () => {}),
        currentStatus: { hasSynced: true, connected: true, lastSyncedAt: new Date(Date.now() + 1000) },
      };
      instances.push(db);
      return db;
    });
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POWERSYNC_URL;
    mockFetch.mockRestore();
  });
  const renderSession = () => render(<AuthProvider><SyncProvider><TestAuthConsumer /><SyncConsumer /></SyncProvider></AuthProvider>);

  it('clears the first user database and opens a distinct database for the next user', async () => {
    const user = userEvent.setup();
    renderSession();
    await waitFor(() => expect(screen.getByTestId('local-ready')).toHaveTextContent('true'));
    const first = instances.find((db) => db.filename.includes('user-1'))!;
    await user.click(screen.getByText('Logout'));
    expect(screen.getByTestId('local-ready')).toHaveTextContent('false');
    await waitFor(() => expect(first.disconnectAndClear).toHaveBeenCalled());
    await user.click(screen.getByText('Login'));
    await waitFor(() => expect(screen.getByTestId('local-ready')).toHaveTextContent('true'));
    expect(instances.some((db) => db.filename.includes('user-2'))).toBe(true);
    expect(first.close).toHaveBeenCalled();
  });

  it('does not open cached records when credentials arrive after logout', async () => {
    const user = userEvent.setup();
    let resolve!: (value: ReturnType<typeof credentials>) => void;
    (apiClient.get as jest.Mock).mockImplementation((url: string) =>
      url === '/api/powersync/credentials/' ? new Promise((done) => { resolve = done; }) : Promise.resolve({ data: {} })
    );
    renderSession();
    await waitFor(() => expect(resolve).toBeDefined());
    expect(screen.getByTestId('local-ready')).toHaveTextContent('false');
    await user.click(screen.getByText('Logout'));
    resolve(credentials());
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(instances.filter((db) => db.filename.includes('policy2'))).toHaveLength(0);
  });

  it('rejects a cached profile that does not match the server-authenticated user', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(
      url === '/api/powersync/credentials/'
        ? { data: { ...credentials().data, user_id: 'different-user' } }
        : { data: {} }
    ));
    renderSession();
    await waitFor(() => expect(screen.getByTestId('sync-error')).toHaveTextContent('could not be authorized'));
    expect(screen.getByTestId('local-ready')).toHaveTextContent('false');
    expect(instances.filter((db) => db.filename.includes('policy2'))).toHaveLength(0);
  });
});

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageStore = {};
    localStorageMock.getItem.mockImplementation((key: string) => localStorageStore[key] || null);
    // Set up fetch mock before each test
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.reject(new Error('Unmocked fetch call')));
  });

  afterEach(() => {
    mockFetch.mockRestore();
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

      // Web sessions store credentials in httpOnly cookies; only the profile
      // is persisted in localStorage.
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access: 'access_token',
              refresh: 'refresh_token',
              user: mockUser,
            }),
        })
      );

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
      expect(localStorageMock.setItem).toHaveBeenCalledWith('vitora_user', JSON.stringify(mockUser));
    });

    it('should throw error on failed login', async () => {
      const user = userEvent.setup();
      // Mock fetch to return a non-ok response (the login function handles this)
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ detail: 'Invalid credentials' }),
          text: () => Promise.resolve(''),
        })
      );

      const TestWithError = () => {
        const { login } = useAuth();
        const [error, setError] = useState<string | null>(null);

        const handleLogin = async () => {
          // Login returns a result object with success: false on failure
          const result = await login('testuser', 'wrongpassword');
          if (!result.success && result.error) {
            setError(result.error);
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

      await user.click(screen.getByText('Login'));

      // Allow time for the async error handling flow
      await waitFor(
        () => {
          expect(screen.getByTestId('error')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // The error message should contain the detail from the failed response
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

    expect(() => render(<TestComponent />)).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});

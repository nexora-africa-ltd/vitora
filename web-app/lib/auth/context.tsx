'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// User type matching Django backend
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser?: boolean;
  permissions: string[];
  role?: string;  // User role (ADMIN, NURSE, DOCTOR, BILLING_CLERK, etc.)
}

// Auth tokens
export interface AuthTokens {
  access: string;
  refresh: string;
}

// Auth state
export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Auth context value
export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  verifyMFA: (mfaToken: string, options: { token?: string; backupCode?: string }) => Promise<void>;
}

// Login result type
export interface LoginResult {
  success: boolean;
  mfaRequired?: boolean;
  mfaToken?: string;
  mfaSetupRequired?: boolean;
  error?: string;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Token storage keys
const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';
const USER_KEY = 'vitora_user';
// Cookie name for middleware auth check (must match middleware.ts)
const AUTH_COOKIE_NAME = 'vitora_authenticated';

/**
 * Auth provider component
 * Manages JWT authentication state with localStorage persistence
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tokens: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Initialize from localStorage on mount
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        const userStr = localStorage.getItem(USER_KEY);

        if (accessToken && refreshToken && userStr) {
          const user = JSON.parse(userStr) as User;
          setState({
            user,
            tokens: { access: accessToken, refresh: refreshToken },
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch {
        // Clear invalid data
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Get tokens and user info
      const tokenResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088'}/api/token/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }
      );

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        return {
          success: false,
          error: error.detail || 'Login failed',
        };
      }

      const data = await tokenResponse.json();

      // Check if MFA is required
      if (data.mfa_required) {
        return {
          success: true,
          mfaRequired: true,
          mfaToken: data.mfa_token,
          mfaSetupRequired: data.mfa_setup_required,
        };
      }

      // MFA not required - proceed with normal login
      const tokens: AuthTokens = { access: data.access, refresh: data.refresh };

      // User info is now included in the token response
      const user: User = data.user || {
        id: 0,
        username: username,
        email: '',
        first_name: '',
        last_name: '',
        is_staff: false,
        permissions: [],
      };

      // Store in localStorage
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Set auth cookie for middleware (httpOnly: false so JS can read, but middleware needs it)
      document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      setState({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
      });

      return { success: true };
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed. Please try again.',
      };
    }
  }, []);

  // MFA verification function
  const verifyMFA = useCallback(async (
    mfaToken: string,
    options: { token?: string; backupCode?: string }
  ) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Import mfaApi dynamically to avoid circular imports
      const { mfaApi } = await import('@/lib/api/mfa');

      const response = await mfaApi.verifyMFA(mfaToken, options);
      const tokens: AuthTokens = { access: response.access, refresh: response.refresh };

      // User info is now included in the MFA verify response
      const user: User = {
        id: response.user.id,
        username: response.user.username,
        email: response.user.email,
        first_name: response.user.first_name,
        last_name: response.user.last_name,
        is_staff: response.user.is_staff,
        is_superuser: response.user.is_superuser,
        permissions: response.user.permissions,
        role: response.user.role ?? undefined,
      };

      // Store in localStorage
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Set auth cookie for middleware
      document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      setState({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    // Clear auth cookie
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

    setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // Refresh token function
  const refreshToken = useCallback(async () => {
    const currentRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!currentRefresh) {
      throw new Error('No refresh token');
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088'}/api/token/refresh/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: currentRefresh }),
      }
    );

    if (!response.ok) {
      logout();
      throw new Error('Token refresh failed');
    }

    const data = (await response.json()) as { access: string };
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access);

    setState((prev) => ({
      ...prev,
      tokens: prev.tokens ? { ...prev.tokens, access: data.access } : null,
    }));
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshToken,
        verifyMFA,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to get current user (SSR-safe)
 * Returns null during SSR or while loading, user object when authenticated
 * Use only in protected routes where user is guaranteed after loading
 */
export function useUser(): User | null {
  const { user, isLoading } = useAuth();
  // During SSR, return null to prevent hydration errors
  if (typeof window === 'undefined') {
    return null;
  }
  // While loading, return null
  if (isLoading) {
    return null;
  }
  return user;
}

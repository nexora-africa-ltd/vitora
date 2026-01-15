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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Token storage keys
const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';
const USER_KEY = 'vitora_user';

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
  const login = useCallback(async (username: string, password: string) => {
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
        throw new Error(error.detail || 'Login failed');
      }

      const data = await tokenResponse.json();
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
 * Hook to get current user (non-null assertion)
 * Use only in protected routes where user is guaranteed
 */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) {
    throw new Error('useUser must be used in authenticated context');
  }
  return user;
}

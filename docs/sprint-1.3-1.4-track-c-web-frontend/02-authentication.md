# Sprint 1.3-1.4 Track C: Authentication System

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P0 (Critical Path)
**Estimated Tests**: 28 tests
**Parallel Track**: 🅰️ Track A (Days 3-4)

---

## Overview

This document covers JWT authentication implementation including login/logout flows, token management, session persistence, and route protection.

---

## 1. TypeScript Types

**lib/types/auth.ts**:
```typescript
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse extends TokenPair {
  user?: User;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface DecodedToken {
  token_type: string;
  exp: number;
  iat: number;
  jti: string;
  user_id: number;
}
```

---

## 2. Token Storage

**lib/auth/storage.ts**:
```typescript
const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';
const USER_KEY = 'vitora_user';

/**
 * Token storage utilities using localStorage.
 * In production, consider httpOnly cookies for better security.
 */
export const tokenStorage = {
  /**
   * Get the access token from storage.
   */
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  /**
   * Get the refresh token from storage.
   */
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Store both tokens.
   */
  setTokens(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },

  /**
   * Clear all tokens.
   */
  clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Get stored user.
   */
  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  /**
   * Store user.
   */
  setUser(user: User): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  /**
   * Clear user.
   */
  clearUser(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(USER_KEY);
  },

  /**
   * Clear all auth data.
   */
  clearAll(): void {
    this.clearTokens();
    this.clearUser();
  },

  /**
   * Check if tokens exist.
   */
  hasTokens(): boolean {
    return !!this.getAccessToken() && !!this.getRefreshToken();
  },
};
```

**lib/auth/token-utils.ts**:
```typescript
import { DecodedToken } from '@/lib/types/auth';

/**
 * Decode a JWT token without verification (client-side only).
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired.
 */
export function isTokenExpired(token: string, bufferSeconds = 60): boolean {
  const decoded = decodeToken(token);
  if (!decoded) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime + bufferSeconds;
}

/**
 * Get time until token expires (in seconds).
 */
export function getTokenExpiryTime(token: string): number {
  const decoded = decodeToken(token);
  if (!decoded) return 0;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return Math.max(0, decoded.exp - currentTime);
}
```

---

## 3. Auth API Client

**lib/api/auth.ts**:
```typescript
import axios from 'axios';
import { LoginCredentials, LoginResponse, TokenPair, User } from '@/lib/types/auth';
import { API_BASE_URL } from '@/lib/utils/constants';

const authClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authApi = {
  /**
   * Login with username and password.
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await authClient.post<TokenPair>('/api/token/', credentials);
    return response.data;
  },

  /**
   * Refresh the access token.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const response = await authClient.post<TokenPair>('/api/token/refresh/', {
      refresh: refreshToken,
    });
    return {
      access: response.data.access,
      refresh: refreshToken, // Keep the same refresh token
    };
  },

  /**
   * Verify a token is valid.
   */
  async verify(token: string): Promise<boolean> {
    try {
      await authClient.post('/api/token/verify/', { token });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get the current user's profile.
   * Note: This would need to be implemented on the backend.
   * For now, we decode user info from the JWT.
   */
  async getCurrentUser(accessToken: string): Promise<User | null> {
    try {
      const response = await authClient.get<User>('/api/users/me/', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data;
    } catch {
      return null;
    }
  },
};
```

---

## 4. Auth Zustand Store

**lib/stores/auth-store.ts**:
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, LoginCredentials, AuthState } from '@/lib/types/auth';
import { authApi } from '@/lib/api/auth';
import { tokenStorage } from '@/lib/auth/storage';
import { isTokenExpired } from '@/lib/auth/token-utils';

interface AuthStore extends AuthState {
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
  restoreSession: () => Promise<void>;
  setUser: (user: User | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Login action
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(credentials);
          tokenStorage.setTokens(response.access, response.refresh);
          
          // For now, create a basic user from the token
          // In production, fetch full user profile
          const user: User = {
            id: 0,
            username: credentials.username,
            email: '',
            first_name: '',
            last_name: '',
            is_staff: false,
            is_superuser: false,
          };
          
          tokenStorage.setUser(user);
          set({ user, isAuthenticated: true, isLoading: false, error: null });
        } catch (error: any) {
          const message = error.response?.data?.detail || 'Login failed. Please check your credentials.';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      // Logout action
      logout: () => {
        tokenStorage.clearAll();
        set({ user: null, isAuthenticated: false, error: null });
      },

      // Refresh session
      refreshSession: async () => {
        const refreshToken = tokenStorage.getRefreshToken();
        if (!refreshToken) return false;

        try {
          const tokens = await authApi.refresh(refreshToken);
          tokenStorage.setTokens(tokens.access, tokens.refresh);
          return true;
        } catch {
          get().logout();
          return false;
        }
      },

      // Restore session on app load
      restoreSession: async () => {
        set({ isLoading: true });
        
        const accessToken = tokenStorage.getAccessToken();
        const refreshToken = tokenStorage.getRefreshToken();
        const user = tokenStorage.getUser();

        if (!accessToken || !refreshToken || !user) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        // Check if access token is expired
        if (isTokenExpired(accessToken)) {
          // Try to refresh
          const success = await get().refreshSession();
          if (!success) {
            set({ isLoading: false, isAuthenticated: false });
            return;
          }
        }

        set({ user, isAuthenticated: true, isLoading: false });
      },

      // Set user
      setUser: (user: User | null) => {
        if (user) {
          tokenStorage.setUser(user);
        } else {
          tokenStorage.clearUser();
        }
        set({ user });
      },

      // Error handling
      setError: (error: string | null) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'vitora-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
);
```

---

## 5. Auth Context & Provider

**lib/auth/context.tsx**:
```typescript
'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { User, LoginCredentials } from '@/lib/types/auth';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    restoreSession,
    clearError,
  } = useAuthStore();

  // Restore session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Set up token refresh interval
  useEffect(() => {
    if (!isAuthenticated) return;

    // Refresh token every 25 minutes (token expires in 30 minutes)
    const interval = setInterval(
      () => {
        useAuthStore.getState().refreshSession();
      },
      25 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

---

## 6. Auth Guard Component

**lib/auth/guard.tsx**:
```typescript
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * Auth guard component that protects routes.
 * 
 * @param requireAuth - If true, redirect unauthenticated users to login
 * @param redirectTo - Custom redirect path
 */
export function AuthGuard({
  children,
  requireAuth = true,
  redirectTo = '/login',
}: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !isAuthenticated) {
      // Store the current path to redirect back after login
      const returnUrl = encodeURIComponent(pathname);
      router.push(`${redirectTo}?returnUrl=${returnUrl}`);
    }
  }, [isAuthenticated, isLoading, requireAuth, router, pathname, redirectTo]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If auth required and not authenticated, don't render children
  if (requireAuth && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook to check if user has required role.
 */
export function useRequireRole(allowedRoles: string[]) {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Add role checking logic here when RBAC is implemented
    // For now, all authenticated users pass
  }, [isAuthenticated, user, router, allowedRoles]);
}
```

---

## 7. Login Page

**app/(auth)/layout.tsx**:
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100 dark:from-gray-900 dark:to-gray-800 p-4">
      {children}
    </div>
  );
}
```

**app/(auth)/login/page.tsx**:
```typescript
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/';
  const { login, error, clearError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    clearError();
    
    try {
      await login(data);
      router.push(decodeURIComponent(returnUrl));
    } catch {
      // Error is handled by the auth store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">V</span>
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Welcome to Vitora</CardTitle>
        <CardDescription>
          Enter your credentials to access the HMIS
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              autoComplete="username"
              disabled={isSubmitting}
              {...register('username')}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={isSubmitting}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>
        
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Sign In
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
```

---

## 8. Logout Handler

**lib/auth/hooks.ts**:
```typescript
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Hook for handling logout with navigation.
 */
export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  return useCallback(() => {
    logout();
    router.push('/login');
  }, [logout, router]);
}

/**
 * Hook for getting the current user.
 */
export function useUser() {
  return useAuthStore((state) => state.user);
}

/**
 * Hook for checking authentication status.
 */
export function useIsAuthenticated() {
  return useAuthStore((state) => state.isAuthenticated);
}
```

---

## 9. Test Coverage

### 9.1 Token Storage Tests (6 tests)

**__tests__/lib/auth/storage.test.ts**:
```typescript
import { tokenStorage } from '@/lib/auth/storage';

describe('Token Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store and retrieve access token', () => {
    tokenStorage.setTokens('access123', 'refresh123');
    expect(tokenStorage.getAccessToken()).toBe('access123');
  });

  it('should store and retrieve refresh token', () => {
    tokenStorage.setTokens('access123', 'refresh123');
    expect(tokenStorage.getRefreshToken()).toBe('refresh123');
  });

  it('should clear all tokens', () => {
    tokenStorage.setTokens('access123', 'refresh123');
    tokenStorage.clearTokens();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('should store and retrieve user', () => {
    const user = { id: 1, username: 'test', email: 'test@example.com' };
    tokenStorage.setUser(user as any);
    expect(tokenStorage.getUser()).toEqual(user);
  });

  it('should clear all auth data', () => {
    tokenStorage.setTokens('access', 'refresh');
    tokenStorage.setUser({ id: 1 } as any);
    tokenStorage.clearAll();
    expect(tokenStorage.hasTokens()).toBe(false);
    expect(tokenStorage.getUser()).toBeNull();
  });

  it('should check if tokens exist', () => {
    expect(tokenStorage.hasTokens()).toBe(false);
    tokenStorage.setTokens('access', 'refresh');
    expect(tokenStorage.hasTokens()).toBe(true);
  });
});
```

### 9.2 Token Utils Tests (4 tests)

**__tests__/lib/auth/token-utils.test.ts**:
```typescript
import { decodeToken, isTokenExpired, getTokenExpiryTime } from '@/lib/auth/token-utils';

describe('Token Utils', () => {
  // Create a test token (header.payload.signature)
  const createTestToken = (exp: number) => {
    const payload = { exp, iat: Date.now() / 1000, user_id: 1, token_type: 'access', jti: 'test' };
    const base64 = btoa(JSON.stringify(payload));
    return `header.${base64}.signature`;
  };

  it('should decode a valid JWT token', () => {
    const token = createTestToken(Date.now() / 1000 + 3600);
    const decoded = decodeToken(token);
    expect(decoded).toBeDefined();
    expect(decoded?.user_id).toBe(1);
  });

  it('should return null for invalid token', () => {
    const decoded = decodeToken('invalid-token');
    expect(decoded).toBeNull();
  });

  it('should detect expired token', () => {
    const expiredToken = createTestToken(Date.now() / 1000 - 3600);
    expect(isTokenExpired(expiredToken)).toBe(true);
  });

  it('should detect valid token', () => {
    const validToken = createTestToken(Date.now() / 1000 + 3600);
    expect(isTokenExpired(validToken)).toBe(false);
  });
});
```

### 9.3 Auth Store Tests (8 tests)

**__tests__/lib/stores/auth-store.test.ts**:
```typescript
import { useAuthStore } from '@/lib/stores/auth-store';
import { authApi } from '@/lib/api/auth';

jest.mock('@/lib/api/auth');

describe('Auth Store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should have initial unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('should login successfully', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({
      access: 'access-token',
      refresh: 'refresh-token',
    });

    await useAuthStore.getState().login({ username: 'test', password: 'pass' });
    
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.error).toBeNull();
  });

  it('should handle login failure', async () => {
    (authApi.login as jest.Mock).mockRejectedValue({
      response: { data: { detail: 'Invalid credentials' } },
    });

    await expect(
      useAuthStore.getState().login({ username: 'test', password: 'wrong' })
    ).rejects.toBeDefined();
    
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Invalid credentials');
  });

  it('should logout and clear state', () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 1 } as any });
    useAuthStore.getState().logout();
    
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('should refresh session successfully', async () => {
    localStorage.setItem('vitora_refresh_token', 'refresh-token');
    (authApi.refresh as jest.Mock).mockResolvedValue({
      access: 'new-access',
      refresh: 'refresh-token',
    });

    const result = await useAuthStore.getState().refreshSession();
    expect(result).toBe(true);
  });

  it('should handle refresh failure', async () => {
    localStorage.setItem('vitora_refresh_token', 'invalid-token');
    (authApi.refresh as jest.Mock).mockRejectedValue(new Error('Invalid'));

    const result = await useAuthStore.getState().refreshSession();
    expect(result).toBe(false);
  });

  it('should set and clear errors', () => {
    useAuthStore.getState().setError('Test error');
    expect(useAuthStore.getState().error).toBe('Test error');
    
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('should restore session from storage', async () => {
    // Setup valid tokens in storage
    localStorage.setItem('vitora_access_token', 'valid-access');
    localStorage.setItem('vitora_refresh_token', 'valid-refresh');
    localStorage.setItem('vitora_user', JSON.stringify({ id: 1, username: 'test' }));

    await useAuthStore.getState().restoreSession();
    
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.username).toBe('test');
  });
});
```

### 9.4 Login Page Tests (6 tests)

**__tests__/app/auth/login.test.tsx**:
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/(auth)/login/page';
import { AuthProvider } from '@/lib/auth/context';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}));

const renderLoginPage = () => {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
};

describe('Login Page', () => {
  it('should render login form', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should show validation errors for empty fields', async () => {
    renderLoginPage();
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await userEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('should enable submit button when form is valid', async () => {
    renderLoginPage();
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    await userEvent.type(usernameInput, 'testuser');
    await userEvent.type(passwordInput, 'password123');
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('should show loading state during submission', async () => {
    renderLoginPage();
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await userEvent.type(usernameInput, 'testuser');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.click(submitButton);
    
    // Loading state shown briefly
    expect(screen.queryByText(/signing in/i)).toBeInTheDocument();
  });

  it('should display Vitora branding', () => {
    renderLoginPage();
    expect(screen.getByText(/welcome to vitora/i)).toBeInTheDocument();
    expect(screen.getByText(/hmis/i)).toBeInTheDocument();
  });

  it('should have accessible form labels', () => {
    renderLoginPage();
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    expect(usernameInput).toHaveAttribute('type', 'text');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
```

### 9.5 Auth Guard Tests (4 tests)

**__tests__/lib/auth/guard.test.tsx**:
```typescript
import { render, screen } from '@testing-library/react';
import { AuthGuard } from '@/lib/auth/guard';
import { useAuthStore } from '@/lib/stores/auth-store';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/dashboard',
}));

describe('Auth Guard', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should show loading spinner while checking auth', () => {
    useAuthStore.setState({ isLoading: true });
    
    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );
    
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    
    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );
    
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should not render children when not authenticated', () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    
    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );
    
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should allow unauthenticated access when requireAuth is false', () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    
    render(
      <AuthGuard requireAuth={false}>
        <div>Public Content</div>
      </AuthGuard>
    );
    
    expect(screen.getByText('Public Content')).toBeInTheDocument();
  });
});
```

---

## 10. Checklist

### Day 3: Auth Foundation
- [ ] Create auth TypeScript types
- [ ] Implement token storage utilities
- [ ] Implement token decode/expiry utilities
- [ ] Create auth API client
- [ ] Write 10 auth utility tests

### Day 4: Auth Flow
- [ ] Implement auth Zustand store
- [ ] Create AuthProvider and context
- [ ] Implement AuthGuard component
- [ ] Create login page
- [ ] Add logout functionality
- [ ] Write 18 auth flow tests

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Token storage utilities | 📋 |
| Token decode/expiry utils | 📋 |
| Auth API client | 📋 |
| Auth Zustand store | 📋 |
| AuthProvider context | 📋 |
| AuthGuard component | 📋 |
| Login page | 📋 |
| Logout handler | 📋 |
| 28 auth tests passing | 📋 |

---

**Previous**: [01-setup-infrastructure.md](./01-setup-infrastructure.md)
**Next**: [03-layout-navigation.md](./03-layout-navigation.md)

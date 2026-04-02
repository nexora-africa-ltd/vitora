'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// Facility modules matching backend Facility.modules property
export interface FacilityModules {
  outpatient: boolean;
  inpatient: boolean;
  emergency: boolean;
  pharmacy: boolean;
  laboratory: boolean;
  imaging: boolean;
  theatre: boolean;
  dialysis: boolean;
  icu: boolean;
  maternity: boolean;
  mortuary: boolean;
  blood_bank: boolean;
}

// User's facility info included in auth response
export interface UserFacility {
  id: number;
  mfl_code: string;
  name: string;
  level: string;
  modules: FacilityModules;
  sha_contracted: boolean;
}

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
  role_category?: string;  // Role category (CLINICAL, ADMINISTRATIVE, etc.)
  facility?: UserFacility | null;  // Primary facility with module capabilities
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
  updateUserFacility: (facility: UserFacility | null) => void;
}

// Login result type
export interface LoginResult {
  success: boolean;
  mfaRequired?: boolean;
  mfaToken?: string;
  mfaSetupRequired?: boolean;
  mfaGraceDeadline?: string;    // ISO 8601 — when MFA setup grace period expires
  mfaGraceExpired?: boolean;    // true if grace period already passed
  mustChangePassword?: boolean;
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
// Idle timer activity key (must match use-idle-timer.ts)
const IDLE_ACTIVITY_KEY = 'vitora_last_activity';
// MFA grace period deadline (ISO 8601)
const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';

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

  const syncUserFromBackend = useCallback(async (fallbackUser: User): Promise<User> => {
    try {
      const { apiClient } = await import('@/lib/api/client');
      const response = await apiClient.get('/api/staff/me/');
      const userInfo = response.data?.user_info;

      if (!userInfo || typeof userInfo !== 'object') {
        return fallbackUser;
      }

      const syncedUser: User = {
        id: typeof userInfo.id === 'number' ? userInfo.id : fallbackUser.id,
        username: typeof userInfo.username === 'string' ? userInfo.username : fallbackUser.username,
        email: typeof userInfo.email === 'string' ? userInfo.email : fallbackUser.email,
        first_name: typeof userInfo.first_name === 'string' ? userInfo.first_name : fallbackUser.first_name,
        last_name: typeof userInfo.last_name === 'string' ? userInfo.last_name : fallbackUser.last_name,
        is_staff: typeof userInfo.is_staff === 'boolean' ? userInfo.is_staff : fallbackUser.is_staff,
        is_superuser: typeof userInfo.is_superuser === 'boolean' ? userInfo.is_superuser : fallbackUser.is_superuser,
        permissions: Array.isArray(userInfo.permissions)
          ? userInfo.permissions.filter((permission: unknown): permission is string => typeof permission === 'string')
          : fallbackUser.permissions,
        role: typeof userInfo.role === 'string' ? userInfo.role : fallbackUser.role,
        role_category: typeof userInfo.role_category === 'string' ? userInfo.role_category : fallbackUser.role_category,
        facility: userInfo.facility && typeof userInfo.facility === 'object'
          ? userInfo.facility as UserFacility
          : null,
      };

      localStorage.setItem(USER_KEY, JSON.stringify(syncedUser));
      return syncedUser;
    } catch {
      return fallbackUser;
    }
  }, []);

  // Initialize from localStorage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        const userStr = localStorage.getItem(USER_KEY);

        if (accessToken && refreshToken && userStr) {
          const storedUser = JSON.parse(userStr) as User;
          setState({
            user: storedUser,
            tokens: { access: accessToken, refresh: refreshToken },
            isAuthenticated: true,
            isLoading: false,
          });

          const syncedUser = await syncUserFromBackend(storedUser);
          if (JSON.stringify(syncedUser) !== JSON.stringify(storedUser)) {
            setState((prev) => ({
              ...prev,
              user: syncedUser,
            }));
          }
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

    void initializeAuth();
  }, [syncUserFromBackend]);

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

      // MFA setup required but tokens still issued (grace period)
      if (data.mfa_setup_required && data.mfa_grace_deadline) {
        // Persist grace deadline so the banner can read it
        localStorage.setItem(MFA_GRACE_KEY, data.mfa_grace_deadline);
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
        facility: null,
      };

      // Store in localStorage
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Reset idle timer activity to prevent immediate logout after re-login
      localStorage.setItem(IDLE_ACTIVITY_KEY, Date.now().toString());

      // Set auth cookie for middleware (httpOnly: false so JS can read, but middleware needs it)
      document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      setState({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
      });

      return {
        success: true,
        mustChangePassword: !!data.must_change_password,
        mfaSetupRequired: !!data.mfa_setup_required,
        mfaGraceDeadline: data.mfa_grace_deadline || undefined,
        mfaGraceExpired: !!data.mfa_grace_expired,
      };
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
        role_category: response.user.role_category ?? undefined,
        facility: response.user.facility ?? null,
      };

      // Store in localStorage
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Reset idle timer activity to prevent immediate logout after re-login
      // This is critical: if user was idle and logged out, the old activity timestamp
      // would cause the idle timer to immediately trigger logout again
      localStorage.setItem(IDLE_ACTIVITY_KEY, Date.now().toString());

      // Debug logging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.debug('[Auth Debug] MFA verify - tokens stored:', {
          accessTokenLength: tokens.access.length,
          hasRefreshToken: !!tokens.refresh,
          username: user.username,
        });
        // Verify storage worked
        const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        console.debug('[Auth Debug] Storage verification:', {
          tokenStored: !!storedToken,
          tokenMatch: storedToken === tokens.access,
        });
      }

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
    // Debug logging (development only)
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Auth Debug] Logout - clearing tokens');
    }

    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MFA_GRACE_KEY);

    // Clear auth cookie
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

    // Clear React Query cache to prevent stale auth errors on re-login
    // This is done via dynamic import to avoid circular dependencies
    import('@tanstack/react-query').then(({ QueryClient }) => {
      // Note: This creates a new client just to signal intent; actual cache
      // clearing happens when page reloads due to logout redirect
      if (process.env.NODE_ENV === 'development') {
        console.debug('[Auth Debug] React state cleared, page will reload');
      }
    }).catch(() => { /* ignore */ });

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

  const updateUserFacility = useCallback((facility: UserFacility | null) => {
    setState((prev) => {
      if (!prev.user) {
        return prev;
      }

      const nextUser = { ...prev.user, facility };
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));

      return {
        ...prev,
        user: nextUser,
      };
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshToken,
        verifyMFA,
        updateUserFacility,
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

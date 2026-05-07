'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { clearAllDrafts } from '@/lib/hooks/use-draft-save';
import type { OrgMembership } from '@/lib/types/membership';

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
  inventory: boolean;
  lis_standalone: boolean;
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
  role_display?: string;  // Human-readable role name (e.g. "Nurse", "Clinical Officer")
  role_category?: string;  // Role category (CLINICAL, ADMINISTRATIVE, etc.)
  phone_number?: string | null;  // From staff profile
  facility?: UserFacility | null;  // Primary facility with module capabilities
  onboarding_complete?: boolean;  // Whether org has completed onboarding
  memberships?: OrgMembership[];  // All active org memberships for multi-org users
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
  availableMethods?: string[];  // e.g. ['totp', 'webauthn', 'backup_code']
  error?: string;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Token storage keys — tokens are now in httpOnly cookies (not in localStorage)
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
        role_display: typeof userInfo.role_display === 'string' ? userInfo.role_display : fallbackUser.role_display,
        role_category: typeof userInfo.role_category === 'string' ? userInfo.role_category : fallbackUser.role_category,
        phone_number: typeof userInfo.phone_number === 'string' ? userInfo.phone_number : fallbackUser.phone_number,
        facility: userInfo.facility && typeof userInfo.facility === 'object'
          ? userInfo.facility as UserFacility
          : null,
        onboarding_complete: typeof userInfo.onboarding_complete === 'boolean' ? userInfo.onboarding_complete : undefined,
        memberships: Array.isArray(userInfo.memberships) ? userInfo.memberships as OrgMembership[] : undefined,
      };

      localStorage.setItem(USER_KEY, JSON.stringify(syncedUser));
      return syncedUser;
    } catch (error) {
      // Re-throw 401 errors so the caller can clear auth state
      // (the httpOnly cookies are expired/missing)
      const { AxiosError } = await import('axios');
      if (error instanceof AxiosError && error.response?.status === 401) {
        throw error;
      }
      return fallbackUser;
    }
  }, []);

  // Initialize from localStorage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const userStr = localStorage.getItem(USER_KEY);

        if (userStr) {
          const storedUser = JSON.parse(userStr) as User;
          setState({
            user: storedUser,
            tokens: null, // Tokens are in httpOnly cookies
            isAuthenticated: true,
            isLoading: false,
          });

          // Verify auth is still valid by syncing from backend
          // (if the cookie has expired, this will fail and we'll clear state)
          try {
            const syncedUser = await syncUserFromBackend(storedUser);
            if (JSON.stringify(syncedUser) !== JSON.stringify(storedUser)) {
              setState((prev) => ({
                ...prev,
                user: syncedUser,
              }));
            }
          } catch {
            // Auth cookie expired — clear state + middleware cookie
            localStorage.removeItem(USER_KEY);
            document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            setState({
              user: null,
              tokens: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch {
        localStorage.removeItem(USER_KEY);
        document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    void initializeAuth();
  }, [syncUserFromBackend]);

  // Login function — uses cookie-based auth endpoint
  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';
      const tokenResponse = await fetch(
        `${apiUrl}/api/auth/login/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',  // Receive httpOnly cookies
          body: JSON.stringify({ username, password }),
        }
      );

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        return {
          success: false,
          error: error.detail || error.error || 'Login failed',
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
          availableMethods: data.available_methods || ['totp', 'backup_code'],
        };
      }

      // MFA setup required but tokens still issued (grace period)
      if (data.mfa_setup_required && data.mfa_grace_deadline) {
        localStorage.setItem(MFA_GRACE_KEY, data.mfa_grace_deadline);
      }

      // User info from response (tokens are in httpOnly cookies, not in body)
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

      // Store user profile (non-sensitive) in localStorage
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Reset idle timer
      localStorage.setItem(IDLE_ACTIVITY_KEY, Date.now().toString());

      // Set auth cookie for middleware
      document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      setState({
        user,
        tokens: null,  // Tokens are in httpOnly cookies
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

  // MFA verification function — uses cookie-based endpoint
  const verifyMFA = useCallback(async (
    mfaToken: string,
    options: { token?: string; backupCode?: string }
  ) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';
      const response = await fetch(
        `${apiUrl}/api/auth/mfa-verify/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',  // Receive httpOnly cookies
          body: JSON.stringify({
            mfa_token: mfaToken,
            ...(options.token && { token: options.token }),
            ...(options.backupCode && { backup_code: options.backupCode }),
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || 'MFA verification failed');
      }

      const data = await response.json();

      // User info from response (tokens are in httpOnly cookies)
      const user: User = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        first_name: data.user.first_name,
        last_name: data.user.last_name,
        is_staff: data.user.is_staff,
        is_superuser: data.user.is_superuser,
        permissions: data.user.permissions,
        role: data.user.role ?? undefined,
        role_display: data.user.role_display ?? undefined,
        role_category: data.user.role_category ?? undefined,
        phone_number: data.user.phone_number ?? undefined,
        facility: data.user.facility ?? null,
        memberships: Array.isArray(data.user.memberships) ? data.user.memberships : undefined,
      };

      // Store user profile (non-sensitive)
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Reset idle timer
      localStorage.setItem(IDLE_ACTIVITY_KEY, Date.now().toString());

      // Set auth cookie for middleware
      document.cookie = `${AUTH_COOKIE_NAME}=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      setState({
        user,
        tokens: null,  // Tokens are in httpOnly cookies
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  // Logout function — clears httpOnly cookies via backend + local state
  const logout = useCallback(() => {
    // Clear httpOnly cookies server-side (fire-and-forget)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';
    fetch(`${apiUrl}/api/auth/logout/`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => { /* ignore — local cleanup still happens */ });

    // Clear local data
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MFA_GRACE_KEY);

    // Clear clinical form drafts to prevent data leaking on shared workstations
    clearAllDrafts();

    // Clear auth cookie for middleware
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

    setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // Refresh token function — uses cookie-based refresh
  const refreshToken = useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';
    const response = await fetch(
      `${apiUrl}/api/auth/refresh/`,
      {
        method: 'POST',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      logout();
      throw new Error('Token refresh failed');
    }
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

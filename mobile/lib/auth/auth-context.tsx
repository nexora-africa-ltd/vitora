import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { loginWithPassword } from '@/lib/api/auth';
import { subscribeToAuthInvalidation } from '@/lib/auth/session-events';
import { clearStoredAuthSession, getStoredTokens, getStoredUser, persistAuthSession } from '@/lib/auth/token-storage';
import { getApiBaseUrl, getApprovedApiEnvironments, getSelectedApiEnvironmentIdSync, initializeApiBaseUrl, setApiBaseUrl, setApiEnvironment, supportsCustomApiUrl, type ApiEnvironmentOption } from '@/lib/config/api-config';
import { clearOfflineDatabase } from '@/lib/db';
import { queryClient } from '@/lib/query/client';
import type { AuthTokens, AuthUser } from '@/lib/types/auth';

type AuthContextValue = {
  apiBaseUrl: string;
  apiEnvironmentOptions: ApiEnvironmentOption[];
  isAuthenticated: boolean;
  isHydrating: boolean;
  selectedApiEnvironmentId: string | null;
  supportsCustomApiUrl: boolean;
  tokens: AuthTokens | null;
  user: AuthUser | null;
  updateApiEnvironment: (environmentId: string) => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; mfaRequired?: boolean }>;
  logout: () => Promise<void>;
  updateApiBaseUrl: (value: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [apiBaseUrl, setApiBaseUrlState] = useState('');
  const [selectedApiEnvironmentId, setSelectedApiEnvironmentId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const apiEnvironmentOptions = useMemo(() => getApprovedApiEnvironments(), []);
  const allowsCustomApiUrl = useMemo(() => supportsCustomApiUrl(), []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const [baseUrl, storedTokens, storedUser] = await Promise.all([
        initializeApiBaseUrl(),
        getStoredTokens(),
        getStoredUser(),
      ]);

      if (!active) {
        return;
      }

      setApiBaseUrlState(baseUrl);
      setSelectedApiEnvironmentId(getSelectedApiEnvironmentIdSync());
      setTokens(storedTokens);
      setUser(storedTokens && storedUser ? storedUser : null);
      setIsHydrating(false);
    }

    void bootstrap();

    const unsubscribe = subscribeToAuthInvalidation(() => {
      void logoutInternal();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function logoutInternal() {
    await clearStoredAuthSession();
    await clearOfflineDatabase();
    queryClient.clear();
    setTokens(null);
    setUser(null);
  }

  async function login(username: string, password: string) {
    try {
      const response = await loginWithPassword(username, password);

      if (response.mfa_required) {
        return {
          success: false,
          mfaRequired: true,
          error: 'This account requires MFA verification. Complete sign-in from the web app until mobile MFA is added.',
        };
      }

      if (!response.access || !response.refresh || !response.user) {
        return {
          success: false,
          error: 'The server returned an incomplete login response.',
        };
      }

      const nextTokens = { access: response.access, refresh: response.refresh };
      await persistAuthSession(nextTokens, response.user);
      queryClient.clear();
      setTokens(nextTokens);
      setUser(response.user);
      setApiBaseUrlState(await getApiBaseUrl());
      setSelectedApiEnvironmentId(getSelectedApiEnvironmentIdSync());
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to sign in.',
      };
    }
  }

  async function logout() {
    await logoutInternal();
  }

  async function updateApiBaseUrl(value: string) {
    const nextUrl = await setApiBaseUrl(value);
    setApiBaseUrlState(nextUrl);
    setSelectedApiEnvironmentId(getSelectedApiEnvironmentIdSync());
    queryClient.clear();
  }

  async function updateApiEnvironment(environmentId: string) {
    const nextUrl = await setApiEnvironment(environmentId);
    setApiBaseUrlState(nextUrl);
    setSelectedApiEnvironmentId(getSelectedApiEnvironmentIdSync());
    queryClient.clear();
  }

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      apiBaseUrl,
      apiEnvironmentOptions,
      isAuthenticated: Boolean(tokens && user),
      isHydrating,
      selectedApiEnvironmentId,
      supportsCustomApiUrl: allowsCustomApiUrl,
      tokens,
      user,
      updateApiEnvironment,
      login,
      logout,
      updateApiBaseUrl,
    }),
    [allowsCustomApiUrl, apiBaseUrl, apiEnvironmentOptions, isHydrating, selectedApiEnvironmentId, tokens, user]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
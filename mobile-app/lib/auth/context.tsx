/**
 * Authentication Context
 * 
 * Provides authentication state and methods to the entire app via React Context.
 * Handles session restoration, login, logout, and token refresh.
 * 
 * Features:
 * - Automatic session restoration on app start
 * - Login with username/password
 * - Logout with secure data cleanup
 * - Token refresh for expired access tokens
 * - Loading states during authentication operations
 * 
 * Usage:
 * ```tsx
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <YourApp />
 *     </AuthProvider>
 *   );
 * }
 * 
 * function LoginScreen() {
 *   const { login, isLoading } = useAuth();
 *   // ...
 * }
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as storage from './storage';
import * as authApi from '../api/auth';
import { UserData } from './storage';

/**
 * Authentication context state
 */
interface AuthContextState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserData | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

/**
 * Create authentication context
 */
const AuthContext = createContext<AuthContextState | undefined>(undefined);

/**
 * Authentication Provider Props
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication Provider Component
 * 
 * Wraps the app and provides authentication state and methods.
 * Automatically restores session on mount.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);

  /**
   * Restore session on app start
   * Checks if tokens exist and loads user data
   */
  const restoreSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const authenticated = await storage.isAuthenticated();
      
      if (authenticated) {
        const userData = await storage.getUser();
        setUser(userData);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Restore session on mount
   */
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  /**
   * Login with username and password
   * Stores tokens and user data in secure storage
   */
  const login = useCallback(async (username: string, password: string) => {
    try {
      setIsLoading(true);
      console.log('[Auth] Attempting login for:', username);
      const response = await authApi.login(username, password);
      
      console.log('[Auth] Login successful, storing tokens...');
      // Store tokens and user data
      await storage.setTokens(response.access, response.refresh);
      await storage.setUser(response.user);
      
      // Verify tokens were stored
      const storedToken = await storage.getAccessToken();
      console.log('[Auth] Token stored successfully:', !!storedToken);
      
      // Update state
      setUser(response.user);
      setIsAuthenticated(true);
      console.log('[Auth] Authentication state updated');
    } catch (error) {
      console.error('[Auth] Login failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Logout and clear all stored data
   * Removes tokens and user data from secure storage
   */
  const logout = useCallback(async () => {
    try {
      await storage.clearAll();
    } catch (error) {
      console.error('Failed to clear storage during logout:', error);
    } finally {
      // Always clear auth state even if storage fails
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  /**
   * Refresh session using refresh token
   * Updates access and refresh tokens
   * Logs out if refresh fails (token expired)
   */
  const refreshSession = useCallback(async () => {
    try {
      const refreshToken = await storage.getRefreshToken();
      
      if (!refreshToken) {
        // No refresh token, logout
        await logout();
        return;
      }
      
      const response = await authApi.refresh(refreshToken);
      await storage.setTokens(response.access, response.refresh);
    } catch (error) {
      console.error('Failed to refresh session:', error);
      // Refresh failed, logout
      await logout();
    }
  }, [logout]);

  const value: AuthContextState = {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth Hook
 * 
 * Access authentication state and methods from any component.
 * Must be used within an AuthProvider.
 * 
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextState {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

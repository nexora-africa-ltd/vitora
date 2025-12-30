/**
 * @jest-environment jsdom
 */

/**
 * Auth Context Tests
 * 
 * Tests for authentication context and login flow.
 * Following TDD RED-GREEN-REFACTOR approach.
 * 
 * Requirements:
 * - Restore session on app start
 * - Login with username/password
 * - Logout and clear data
 * - Refresh session with refresh token
 * - Provide authentication state to components
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../lib/auth/context';
import * as storage from '../../lib/auth/storage';
import * as authApi from '../../lib/api/auth';

// Mock dependencies
jest.mock('../../lib/auth/storage');
jest.mock('../../lib/api/auth');

const mockStorage = storage as jest.Mocked<typeof storage>;
const mockAuthApi = authApi as jest.Mocked<typeof authApi>;

describe('Auth Context Tests', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.isAuthenticated.mockResolvedValue(false);
    mockStorage.getUser.mockResolvedValue(null);
  });

  describe('Session Restoration', () => {
    test('should restore session on mount if tokens exist', async () => {
      const mockUser = {
        id: '123',
        username: 'drsmith',
        email: 'drsmith@hospital.ke',
        firstName: 'John',
        lastName: 'Smith',
        role: 'doctor',
      };

      mockStorage.isAuthenticated.mockResolvedValue(true);
      mockStorage.getUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);

      // Wait for restoration
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
    });

    test('should set isAuthenticated to false if no tokens exist', async () => {
      mockStorage.isAuthenticated.mockResolvedValue(false);
      mockStorage.getUser.mockResolvedValue(null);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    test('should handle restoration errors gracefully', async () => {
      mockStorage.isAuthenticated.mockRejectedValue(new Error('Storage error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('Login Flow', () => {
    test('should login with valid credentials', async () => {
      const mockLoginResponse = {
        access: 'access_token_xyz',
        refresh: 'refresh_token_abc',
        user: {
          id: '456',
          username: 'nursejane',
          email: 'nursejane@hospital.ke',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'nurse',
        },
      };

      mockAuthApi.login.mockResolvedValue(mockLoginResponse);
      mockStorage.setTokens.mockResolvedValue(undefined);
      mockStorage.setUser.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login('nursejane', 'password123');
      });

      expect(mockAuthApi.login).toHaveBeenCalledWith('nursejane', 'password123');
      expect(mockStorage.setTokens).toHaveBeenCalledWith(
        mockLoginResponse.access,
        mockLoginResponse.refresh
      );
      expect(mockStorage.setUser).toHaveBeenCalledWith(mockLoginResponse.user);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockLoginResponse.user);
    });

    test('should throw error on login with invalid credentials', async () => {
      const loginError = new Error('Invalid credentials');
      mockAuthApi.login.mockRejectedValue(loginError);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.login('wronguser', 'wrongpass');
        });
      }).rejects.toThrow('Invalid credentials');

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    test('should set loading state during login', async () => {
      const mockLoginResponse = {
        access: 'token1',
        refresh: 'token2',
        user: {
          id: '789',
          username: 'testuser',
          email: 'test@hospital.ke',
          firstName: 'Test',
          lastName: 'User',
          role: 'doctor',
        },
      };

      mockAuthApi.login.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockLoginResponse), 100))
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let loginPromise: Promise<void>;
      act(() => {
        loginPromise = result.current.login('testuser', 'password');
      });

      // Should be loading during login
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        await loginPromise!;
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('Logout Flow', () => {
    test('should logout and clear all data', async () => {
      // Setup authenticated state
      const mockUser = {
        id: '123',
        username: 'drsmith',
        email: 'drsmith@hospital.ke',
        firstName: 'John',
        lastName: 'Smith',
        role: 'doctor',
      };

      mockStorage.isAuthenticated.mockResolvedValue(true);
      mockStorage.getUser.mockResolvedValue(mockUser);
      mockStorage.clearAll.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockStorage.clearAll).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    test('should handle logout errors gracefully', async () => {
      mockStorage.isAuthenticated.mockResolvedValue(true);
      mockStorage.getUser.mockResolvedValue({
        id: '123',
        username: 'test',
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'doctor',
      });
      mockStorage.clearAll.mockRejectedValue(new Error('Storage error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Should still clear auth state even if storage fails
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('Session Refresh', () => {
    test('should refresh tokens using refresh token', async () => {
      const mockRefreshResponse = {
        access: 'new_access_token',
        refresh: 'new_refresh_token',
      };

      mockStorage.getRefreshToken.mockResolvedValue('old_refresh_token');
      mockAuthApi.refresh.mockResolvedValue(mockRefreshResponse);
      mockStorage.setTokens.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(mockAuthApi.refresh).toHaveBeenCalledWith('old_refresh_token');
      expect(mockStorage.setTokens).toHaveBeenCalledWith(
        mockRefreshResponse.access,
        mockRefreshResponse.refresh
      );
    });

    test('should logout if refresh fails', async () => {
      mockStorage.getRefreshToken.mockResolvedValue('old_refresh_token');
      mockAuthApi.refresh.mockRejectedValue(new Error('Refresh token expired'));
      mockStorage.clearAll.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(mockStorage.clearAll).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(false);
    });

    test('should handle missing refresh token', async () => {
      mockStorage.getRefreshToken.mockResolvedValue(null);
      mockStorage.clearAll.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(mockAuthApi.refresh).not.toHaveBeenCalled();
      expect(mockStorage.clearAll).toHaveBeenCalled();
    });
  });

  describe('useAuth Hook', () => {
    test('should throw error if used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });

    test('should provide auth state to components', async () => {
      mockStorage.isAuthenticated.mockResolvedValue(false);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty('isAuthenticated');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('user');
      expect(result.current).toHaveProperty('login');
      expect(result.current).toHaveProperty('logout');
      expect(result.current).toHaveProperty('refreshSession');
    });
  });
});

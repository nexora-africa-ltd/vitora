/**
 * Secure Storage Tests
 * 
 * Tests for token and user data storage using expo-secure-store.
 * Following TDD RED-GREEN-REFACTOR approach.
 * 
 * Requirements:
 * - Store access and refresh tokens securely
 * - Store user profile data
 * - Persist across app restarts
 * - Clear all data on logout
 * - Check authentication status
 */

import * as SecureStore from 'expo-secure-store';
import {
  setTokens,
  getAccessToken,
  getRefreshToken,
  setUser,
  getUser,
  clearAll,
  isAuthenticated,
} from '../../lib/auth/storage';

// Mock expo-secure-store
jest.mock('expo-secure-store');

describe('Secure Storage Tests', () => {
  const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Token Storage', () => {
    test('should store access and refresh tokens', async () => {
      const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_access';
      const refreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_refresh';

      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await setTokens(accessToken, refreshToken);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'access_token',
        accessToken
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'refresh_token',
        refreshToken
      );
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledTimes(2);
    });

    test('should retrieve stored access token', async () => {
      const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access';
      mockSecureStore.getItemAsync.mockResolvedValue(mockAccessToken);

      const token = await getAccessToken();

      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('access_token');
      expect(token).toBe(mockAccessToken);
    });

    test('should retrieve stored refresh token', async () => {
      const mockRefreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh';
      mockSecureStore.getItemAsync.mockResolvedValue(mockRefreshToken);

      const token = await getRefreshToken();

      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('refresh_token');
      expect(token).toBe(mockRefreshToken);
    });

    test('should return null when no tokens are stored', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const accessToken = await getAccessToken();
      const refreshToken = await getRefreshToken();

      expect(accessToken).toBeNull();
      expect(refreshToken).toBeNull();
    });
  });

  describe('User Data Storage', () => {
    test('should store user profile data', async () => {
      const userData = {
        id: '123',
        username: 'drsmith',
        email: 'drsmith@hospital.ke',
        firstName: 'John',
        lastName: 'Smith',
        role: 'doctor',
      };

      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await setUser(userData);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'user_data',
        JSON.stringify(userData)
      );
    });

    test('should retrieve stored user data', async () => {
      const userData = {
        id: '456',
        username: 'nursejane',
        email: 'nursejane@hospital.ke',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'nurse',
      };

      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(userData));

      const retrievedUser = await getUser();

      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('user_data');
      expect(retrievedUser).toEqual(userData);
    });

    test('should return null when no user data is stored', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const user = await getUser();

      expect(user).toBeNull();
    });

    test('should handle invalid JSON when retrieving user data', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('invalid-json{');

      const user = await getUser();

      expect(user).toBeNull();
    });
  });

  describe('Authentication Status', () => {
    test('should return true when both tokens exist', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce('access_token_value')
        .mockResolvedValueOnce('refresh_token_value');

      const authenticated = await isAuthenticated();

      expect(authenticated).toBe(true);
    });

    test('should return false when access token is missing', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('refresh_token_value');

      const authenticated = await isAuthenticated();

      expect(authenticated).toBe(false);
    });

    test('should return false when refresh token is missing', async () => {
      mockSecureStore.getItemAsync
        .mockResolvedValueOnce('access_token_value')
        .mockResolvedValueOnce(null);

      const authenticated = await isAuthenticated();

      expect(authenticated).toBe(false);
    });

    test('should return false when both tokens are missing', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const authenticated = await isAuthenticated();

      expect(authenticated).toBe(false);
    });
  });

  describe('Clear All Data', () => {
    test('should clear all stored tokens and user data', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await clearAll();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('user_data');
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledTimes(3);
    });

    test('should verify authentication status is false after clearing', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      await clearAll();
      const authenticated = await isAuthenticated();

      expect(authenticated).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle SecureStore errors gracefully when setting tokens', async () => {
      mockSecureStore.setItemAsync.mockRejectedValue(
        new Error('SecureStore not available')
      );

      await expect(setTokens('token1', 'token2')).rejects.toThrow(
        'SecureStore not available'
      );
    });

    test('should handle SecureStore errors gracefully when getting tokens', async () => {
      mockSecureStore.getItemAsync.mockRejectedValue(
        new Error('SecureStore read error')
      );

      await expect(getAccessToken()).rejects.toThrow('SecureStore read error');
    });

    test('should handle SecureStore errors gracefully when clearing data', async () => {
      mockSecureStore.deleteItemAsync.mockRejectedValue(
        new Error('SecureStore delete error')
      );

      await expect(clearAll()).rejects.toThrow('SecureStore delete error');
    });
  });
});

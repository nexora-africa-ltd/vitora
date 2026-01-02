/**
 * TDD Tests for Token Storage utilities
 * Tests localStorage-based token and user storage
 */

import { tokenStorage } from '@/lib/auth/storage';

describe('tokenStorage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('getAccessToken', () => {
    it('should return access token from localStorage', () => {
      localStorage.setItem('vitora_access_token', 'test-access-token');
      
      const token = tokenStorage.getAccessToken();
      
      expect(token).toBe('test-access-token');
    });

    it('should return null if no access token', () => {
      const token = tokenStorage.getAccessToken();
      
      expect(token).toBeNull();
    });
  });

  describe('getRefreshToken', () => {
    it('should return refresh token from localStorage', () => {
      localStorage.setItem('vitora_refresh_token', 'test-refresh-token');
      
      const token = tokenStorage.getRefreshToken();
      
      expect(token).toBe('test-refresh-token');
    });

    it('should return null if no refresh token', () => {
      const token = tokenStorage.getRefreshToken();
      
      expect(token).toBeNull();
    });
  });

  describe('setTokens', () => {
    it('should store both access and refresh tokens', () => {
      tokenStorage.setTokens('new-access', 'new-refresh');
      
      expect(localStorage.getItem('vitora_access_token')).toBe('new-access');
      expect(localStorage.getItem('vitora_refresh_token')).toBe('new-refresh');
    });
  });

  describe('getUser', () => {
    it('should return parsed user data from localStorage', () => {
      const userData = { id: 1, username: 'testuser', email: 'test@example.com' };
      localStorage.setItem('vitora_user', JSON.stringify(userData));
      
      const user = tokenStorage.getUser();
      
      expect(user).toEqual(userData);
    });

    it('should return null if no user data stored', () => {
      const user = tokenStorage.getUser();
      
      expect(user).toBeNull();
    });
  });

  describe('setUser', () => {
    it('should store user data as JSON string', () => {
      const userData = { id: 1, username: 'testuser' };
      
      tokenStorage.setUser(userData);
      
      expect(localStorage.getItem('vitora_user')).toBe(JSON.stringify(userData));
    });
  });

  describe('clearAll', () => {
    it('should remove all stored tokens and user data', () => {
      localStorage.setItem('vitora_access_token', 'token');
      localStorage.setItem('vitora_refresh_token', 'refresh');
      localStorage.setItem('vitora_user', '{}');
      
      tokenStorage.clearAll();
      
      expect(localStorage.getItem('vitora_access_token')).toBeNull();
      expect(localStorage.getItem('vitora_refresh_token')).toBeNull();
      expect(localStorage.getItem('vitora_user')).toBeNull();
    });
  });
});

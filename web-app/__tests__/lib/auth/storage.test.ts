/**
 * TDD Tests for Token Storage utilities
 * Tests localStorage-based token and user storage
 */

import { tokenStorage, registerAuthCleanup, waitForAuthCleanup } from '@/lib/auth/storage';

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

  describe('setCloudAccessToken', () => {
    it('stores only the cloud access token and notifies cloud-session listeners', () => {
      const listener = jest.fn();
      window.addEventListener('vitora:cloud-session-changed', listener);

      tokenStorage.setCloudAccessToken('cloud-access');

      expect(localStorage.getItem('vitora_cloud_access_token')).toBe('cloud-access');
      expect(localStorage.getItem('vitora_cloud_refresh_token')).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('vitora:cloud-session-changed', listener);
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
    it('starts cleanup synchronously and waits before another session can initialize', async () => {
      let finish!: () => void;
      const cleanup = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      const unsubscribe = registerAuthCleanup(cleanup);
      tokenStorage.clearAll();
      expect(cleanup).toHaveBeenCalledTimes(1);
      let completed = false;
      const waiting = waitForAuthCleanup().then(() => {
        completed = true;
      });
      await Promise.resolve();
      expect(completed).toBe(false);
      finish();
      await waiting;
      expect(completed).toBe(true);
      unsubscribe();
    });

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

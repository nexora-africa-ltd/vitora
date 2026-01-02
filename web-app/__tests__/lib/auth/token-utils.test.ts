/**
 * TDD Tests for Token Utilities
 * Tests JWT decoding and validation functions
 */

import { decodeToken, isTokenExpired, getTokenExpiration, getUserIdFromToken } from '@/lib/auth/token-utils';

// Helper to create a valid JWT-like token
function createMockToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = btoa(JSON.stringify(payload));
  const signature = 'fake-signature';
  return `${header}.${payloadStr}.${signature}`;
}

describe('Token Utilities', () => {
  describe('decodeToken', () => {
    it('should decode a valid JWT token', () => {
      const payload = {
        token_type: 'access',
        exp: 1735689600,
        iat: 1735603200,
        jti: 'unique-id-123',
        user_id: 42,
      };
      const token = createMockToken(payload);

      const decoded = decodeToken(token);

      expect(decoded).toEqual(payload);
    });

    it('should return null for invalid token format (not 3 parts)', () => {
      const invalidToken = 'invalid.token';

      const decoded = decodeToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should return null for malformed base64 payload', () => {
      const invalidToken = 'header.!!!invalid-base64!!!.signature';

      const decoded = decodeToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeToken('');

      expect(decoded).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const token = createMockToken({ exp: futureExp, user_id: 1 });

      const expired = isTokenExpired(token);

      expect(expired).toBe(false);
    });

    it('should return true for expired token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const token = createMockToken({ exp: pastExp, user_id: 1 });

      const expired = isTokenExpired(token);

      expect(expired).toBe(true);
    });

    it('should account for buffer seconds', () => {
      const soonExp = Math.floor(Date.now() / 1000) + 30; // 30 seconds from now
      const token = createMockToken({ exp: soonExp, user_id: 1 });

      // Without buffer - not expired
      expect(isTokenExpired(token, 0)).toBe(false);

      // With 60 second buffer - considered expired
      expect(isTokenExpired(token, 60)).toBe(true);
    });

    it('should return true for invalid token', () => {
      const expired = isTokenExpired('invalid-token');

      expect(expired).toBe(true);
    });

    it('should return true for token without exp claim', () => {
      const token = createMockToken({ user_id: 1 }); // No exp

      const expired = isTokenExpired(token);

      expect(expired).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return Date object for valid token', () => {
      const expTimestamp = 1735689600; // Unix timestamp
      const token = createMockToken({ exp: expTimestamp, user_id: 1 });

      const expiration = getTokenExpiration(token);

      expect(expiration).toBeInstanceOf(Date);
      expect(expiration?.getTime()).toBe(expTimestamp * 1000);
    });

    it('should return null for invalid token', () => {
      const expiration = getTokenExpiration('invalid-token');

      expect(expiration).toBeNull();
    });

    it('should return null for token without exp', () => {
      const token = createMockToken({ user_id: 1 });

      const expiration = getTokenExpiration(token);

      expect(expiration).toBeNull();
    });
  });

  describe('getUserIdFromToken', () => {
    it('should extract user_id from valid token', () => {
      const token = createMockToken({ exp: 999999999, user_id: 42 });

      const userId = getUserIdFromToken(token);

      expect(userId).toBe(42);
    });

    it('should return null for invalid token', () => {
      const userId = getUserIdFromToken('invalid-token');

      expect(userId).toBeNull();
    });

    it('should return null for token without user_id', () => {
      const token = createMockToken({ exp: 999999999 });

      const userId = getUserIdFromToken(token);

      expect(userId).toBeNull();
    });
  });
});

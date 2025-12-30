/**
 * Auth API Tests
 * 
 * Tests for authentication API client methods.
 * Following TDD RED-GREEN-REFACTOR approach.
 * 
 * Requirements:
 * - Login with username/password
 * - Refresh access token
 * - Verify token validity
 */

import axios from 'axios';
import { login, refresh, verifyToken } from '../../lib/api/auth';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Auth API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Login', () => {
    test('should send login request with credentials', async () => {
      const mockResponse = {
        data: {
          access: 'access_token_xyz',
          refresh: 'refresh_token_abc',
          user: {
            id: '123',
            username: 'drsmith',
            email: 'drsmith@hospital.ke',
            first_name: 'John',
            last_name: 'Smith',
            role: 'doctor',
          },
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await login('drsmith', 'password123');

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/token/', {
        username: 'drsmith',
        password: 'password123',
      });
      expect(result).toEqual({
        access: mockResponse.data.access,
        refresh: mockResponse.data.refresh,
        user: {
          id: mockResponse.data.user.id,
          username: mockResponse.data.user.username,
          email: mockResponse.data.user.email,
          firstName: mockResponse.data.user.first_name,
          lastName: mockResponse.data.user.last_name,
          role: mockResponse.data.user.role,
        },
      });
    });

    test('should throw error on invalid credentials', async () => {
      const errorResponse = new Error('Request failed with status code 401');
      
      mockedAxios.post.mockRejectedValue(errorResponse);

      await expect(login('wronguser', 'wrongpass')).rejects.toThrow();
    });

    test('should throw error on network failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(login('user', 'pass')).rejects.toThrow('Network error');
    });
  });

  describe('Refresh Token', () => {
    test('should send refresh token request', async () => {
      const mockResponse = {
        data: {
          access: 'new_access_token',
          refresh: 'new_refresh_token',
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await refresh('old_refresh_token');

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/token/refresh/', {
        refresh: 'old_refresh_token',
      });
      expect(result).toEqual({
        access: mockResponse.data.access,
        refresh: mockResponse.data.refresh,
      });
    });

    test('should throw error on expired refresh token', async () => {
      const errorResponse = new Error('Request failed with status code 401');

      mockedAxios.post.mockRejectedValue(errorResponse);

      await expect(refresh('expired_token')).rejects.toThrow();
    });

    test('should throw error on invalid refresh token format', async () => {
      const errorResponse = new Error('Request failed with status code 400');

      mockedAxios.post.mockRejectedValue(errorResponse);

      await expect(refresh('')).rejects.toThrow();
    });
  });

  describe('Verify Token', () => {
    test('should verify valid token', async () => {
      const mockResponse = {
        data: {},
        status: 200,
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await verifyToken('valid_token');

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/token/verify/', {
        token: 'valid_token',
      });
      expect(result).toBe(true);
    });

    test('should return false for invalid token', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: {
            detail: 'Token is invalid or expired',
          },
        },
      };

      mockedAxios.post.mockRejectedValue(errorResponse);

      const result = await verifyToken('invalid_token');

      expect(result).toBe(false);
    });

    test('should return false on network error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await verifyToken('some_token');

      expect(result).toBe(false);
    });
  });
});

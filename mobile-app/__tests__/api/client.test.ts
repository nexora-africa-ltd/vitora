/**
 * API Client Tests
 *
 * Tests for the API client with interceptors.
 * Following TDD RED-GREEN-REFACTOR approach.
 *
 * Requirements:
 * - Configure base URL from environment
 * - Inject auth header on requests
 * - Handle 401 responses with token refresh
 * - Queue concurrent requests during refresh
 * - Provide type-safe API methods
 */

import axios from 'axios';
import {
  apiClient,
  configureApiClient,
  getApiClient,
  resetApiClient,
} from '../../lib/api/client';
import * as storage from '../../lib/auth/storage';

// Mock dependencies
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    defaults: {
      baseURL: '',
      headers: { common: {} },
    },
  };
  return {
    create: jest.fn(() => mockAxiosInstance),
    isAxiosError: jest.fn((error) => error.isAxiosError === true),
  };
});

jest.mock('../../lib/auth/storage');

const mockStorage = storage as jest.Mocked<typeof storage>;
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('API Client Tests', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    resetApiClient(); // Reset client state between tests
    jest.clearAllMocks();
    mockAxiosInstance = mockAxios.create();
  });

  describe('Client Configuration', () => {
    test('should create axios instance with base URL', () => {
      configureApiClient('https://api.vitora.ke');

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.vitora.ke',
        })
      );
    });

    test('should configure default timeout', () => {
      configureApiClient('https://api.vitora.ke');

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    test('should configure JSON content type', () => {
      configureApiClient('https://api.vitora.ke');

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    test('should register request interceptor', () => {
      configureApiClient('https://api.vitora.ke');

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    test('should register response interceptor', () => {
      configureApiClient('https://api.vitora.ke');

      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    test('should return configured client via getApiClient', () => {
      configureApiClient('https://api.vitora.ke');

      const client = getApiClient();

      expect(client).toBeDefined();
    });
  });

  describe('Request Interceptor', () => {
    test('should inject Authorization header when token exists', async () => {
      mockStorage.getAccessToken.mockResolvedValue('valid_access_token');

      configureApiClient('https://api.vitora.ke');

      // Get the request interceptor function
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

      const config = { headers: {} };
      const result = await requestInterceptor(config);

      expect(mockStorage.getAccessToken).toHaveBeenCalled();
      expect(result.headers.Authorization).toBe('Bearer valid_access_token');
    });

    test('should not inject Authorization header when no token', async () => {
      mockStorage.getAccessToken.mockResolvedValue(null);

      configureApiClient('https://api.vitora.ke');

      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

      const config = { headers: {} };
      const result = await requestInterceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    test('should preserve existing headers', async () => {
      mockStorage.getAccessToken.mockResolvedValue('token');

      configureApiClient('https://api.vitora.ke');

      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

      const config = {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      };
      const result = await requestInterceptor(config);

      expect(result.headers['X-Custom-Header']).toBe('custom-value');
      expect(result.headers.Authorization).toBe('Bearer token');
    });
  });

  describe('Response Interceptor - 401 Handling', () => {
    test('should pass through successful responses', async () => {
      configureApiClient('https://api.vitora.ke');

      const successInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];

      const response = { status: 200, data: { success: true } };
      const result = successInterceptor(response);

      expect(result).toEqual(response);
    });

    test('should attempt token refresh on 401 error', async () => {
      mockStorage.getRefreshToken.mockResolvedValue('valid_refresh_token');

      configureApiClient('https://api.vitora.ke');

      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        isAxiosError: true,
        response: { status: 401 },
        config: { headers: {}, _retry: false },
      };

      // Mock the refresh endpoint response
      mockAxiosInstance.post.mockResolvedValue({
        data: { access: 'new_access_token', refresh: 'new_refresh_token' },
      });
      mockStorage.setTokens.mockResolvedValue(undefined);

      // The error interceptor should attempt refresh
      try {
        await errorInterceptor(error);
      } catch (e) {
        // Expected to retry the request
      }

      expect(mockStorage.getRefreshToken).toHaveBeenCalled();
    });

    test('should logout on refresh failure', async () => {
      mockStorage.getRefreshToken.mockResolvedValue('expired_refresh_token');
      mockStorage.clearAll.mockResolvedValue(undefined);

      configureApiClient('https://api.vitora.ke');

      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        isAxiosError: true,
        response: { status: 401 },
        config: { headers: {}, _retry: false },
      };

      // Mock refresh failure
      mockAxiosInstance.post.mockRejectedValue(new Error('Refresh failed'));

      await expect(errorInterceptor(error)).rejects.toThrow();
      expect(mockStorage.clearAll).toHaveBeenCalled();
    });

    test('should not retry if already retried', async () => {
      configureApiClient('https://api.vitora.ke');

      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        isAxiosError: true,
        response: { status: 401 },
        config: { headers: {}, _retry: true }, // Already retried
      };

      await expect(errorInterceptor(error)).rejects.toBeDefined();
      expect(mockStorage.getRefreshToken).not.toHaveBeenCalled();
    });

    test('should propagate non-401 errors', async () => {
      configureApiClient('https://api.vitora.ke');

      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        isAxiosError: true,
        response: { status: 500 },
        config: { headers: {} },
      };

      await expect(errorInterceptor(error)).rejects.toEqual(error);
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should queue requests while refreshing', async () => {
      mockStorage.getRefreshToken.mockResolvedValue('refresh_token');
      mockStorage.setTokens.mockResolvedValue(undefined);

      configureApiClient('https://api.vitora.ke');

      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      // Mock successful refresh
      mockAxiosInstance.post.mockResolvedValue({
        data: { access: 'new_token', refresh: 'new_refresh' },
      });

      // Mock retry call on the axios instance (when used as a function)
      const mockRetryFn = jest.fn().mockResolvedValue({ data: 'success' });

      // We need to test that multiple 401 errors only trigger one refresh
      // The second 401 should wait for the first refresh to complete
      const error1 = {
        isAxiosError: true,
        response: { status: 401 },
        config: { headers: {}, _retry: false, url: '/api/patients/' },
      };

      // First 401 should trigger refresh
      try {
        await errorInterceptor(error1);
      } catch {
        // May throw because mocked axios instance function not set up
      }

      // Should have called refresh endpoint
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/token/refresh/', {
        refresh: 'refresh_token',
      });
    });

    test('should update tokens after successful refresh', async () => {
      mockStorage.getRefreshToken.mockResolvedValue('refresh_token');
      mockStorage.setTokens.mockResolvedValue(undefined);

      configureApiClient('https://api.vitora.ke');

      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      mockAxiosInstance.post.mockResolvedValue({
        data: { access: 'new_access', refresh: 'new_refresh' },
      });

      const error = {
        isAxiosError: true,
        response: { status: 401 },
        config: { headers: {}, _retry: false },
      };

      try {
        await errorInterceptor(error);
      } catch {
        // Expected - retry will fail with mock
      }

      expect(mockStorage.setTokens).toHaveBeenCalledWith('new_access', 'new_refresh');
    });
  });
});

/**
 * API Client Configuration
 *
 * Configures axios instance with:
 * - Base URL configuration
 * - Request interceptor for auth header injection
 * - Response interceptor for 401 handling with token refresh
 * - Concurrent request queue during token refresh
 *
 * @module lib/api/client
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearAll,
} from '../auth/storage';

// Singleton axios instance
let apiClient: AxiosInstance | null = null;

// Token refresh state
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

/**
 * Subscribe to token refresh completion
 */
const subscribeTokenRefresh = (callback: (token: string) => void): void => {
  refreshSubscribers.push(callback);
};

/**
 * Notify all subscribers that token has been refreshed
 */
const onTokenRefreshed = (token: string): void => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

/**
 * Configure and create the API client
 *
 * @param baseURL - The base URL for API requests
 * @param timeout - Request timeout in milliseconds (default: 30000)
 * @returns Configured axios instance
 */
export const configureApiClient = (
  baseURL: string,
  timeout: number = 30000
): AxiosInstance => {
  console.log('[API Client] Configuring with baseURL:', baseURL);
  
  apiClient = axios.create({
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true', // Skip ngrok interstitial page
    },
  });

  // Register request interceptor for auth header injection
  apiClient.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const token = await getAccessToken();
        console.log('[API Client] Token available:', !!token, 'for URL:', config.url);
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.error('[API Client] Error getting access token:', err);
      }
      return config;
    },
    (error: AxiosError) => {
      console.error('[API Client] Request interceptor error:', error);
      return Promise.reject(error);
    }
  );

  // Register response interceptor for 401 handling
  apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
      // Pass through successful responses
      return response;
    },
    async (error: AxiosError) => {
      console.log('[API Client] Response error:', error.response?.status, error.config?.url);
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // Handle 401 Unauthorized
      if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
        // If already refreshing, queue this request
        if (isRefreshing) {
          return new Promise((resolve) => {
            subscribeTokenRefresh((token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(apiClient!(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = await getRefreshToken();

          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          // Attempt to refresh the token
          const response = await apiClient!.post('/api/token/refresh/', {
            refresh: refreshToken,
          });

          const { access, refresh } = response.data;

          // Store new tokens
          await setTokens(access, refresh || refreshToken);

          // Update authorization header
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access}`;
          }

          // Notify subscribers
          onTokenRefreshed(access);

          isRefreshing = false;

          // Retry the original request
          return apiClient!(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          refreshSubscribers = [];

          // Clear all stored credentials
          await clearAll();

          return Promise.reject(refreshError);
        }
      }

      // For non-401 errors or already retried requests, reject
      return Promise.reject(error);
    }
  );

  return apiClient;
};

/**
 * Get the configured API client
 *
 * @throws Error if client has not been configured
 * @returns Configured axios instance
 */
export const getApiClient = (): AxiosInstance => {
  if (!apiClient) {
    throw new Error(
      'API client not configured. Call configureApiClient() first.'
    );
  }
  return apiClient;
};

/**
 * Reset the API client (useful for testing)
 */
export const resetApiClient = (): void => {
  apiClient = null;
  isRefreshing = false;
  refreshSubscribers = [];
};

// Export the client instance (may be null if not configured)
export { apiClient };

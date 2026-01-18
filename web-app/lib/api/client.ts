import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '@/lib/auth/storage';
import { isTokenExpired } from '@/lib/auth/token-utils';
import { API_BASE_URL } from '@/lib/utils/constants';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request queue for token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

/**
 * Request interceptor - adds auth token to requests.
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();

    if (token) {
      // Check if token needs refresh
      if (isTokenExpired(token, 60)) {
        // Token expires within 60 seconds, try to refresh
        const newToken = await refreshTokenIfNeeded();
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
        }
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor - handles auth errors and token refresh.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Wait for token refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject: (err: Error) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshTokenIfNeeded();
        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } else {
          // Refresh failed, redirect to login
          handleAuthError();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        handleAuthError();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Refresh the access token.
 */
async function refreshTokenIfNeeded(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
      refresh: refreshToken,
    });

    const newAccessToken = response.data.access;
    tokenStorage.setTokens(newAccessToken, refreshToken);
    return newAccessToken;
  } catch {
    tokenStorage.clearAll();
    return null;
  }
}

/**
 * Handle authentication errors.
 */
function handleAuthError(): void {
  tokenStorage.clearAll();
  // Redirect to login (only in browser)
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * API Error type for consistent error handling.
 */
export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: Record<string, string[]>;
}

/**
 * Transform Axios errors to a consistent format.
 */
export function transformAxiosError(error: AxiosError): ApiError {
  if (error.response) {
    const data = error.response.data as any;
    return {
      message: data?.detail || data?.message || 'An error occurred',
      status: error.response.status,
      code: data?.code,
      details: data?.errors || data,
    };
  }

  if (error.request) {
    return {
      message: 'Network error. Please check your connection.',
      status: 0,
      code: 'NETWORK_ERROR',
    };
  }

  return {
    message: error.message || 'An unexpected error occurred',
    status: 0,
    code: 'UNKNOWN_ERROR',
  };
}

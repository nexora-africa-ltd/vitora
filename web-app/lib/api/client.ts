import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '@/lib/auth/storage';
import { isTokenExpired } from '@/lib/auth/token-utils';
import { API_BASE_URL } from '@/lib/utils/constants';

/**
 * Get the API base URL.
 * Used for constructing full URLs for resources like DICOM WADO.
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

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

    // Debug logging for auth issues (development only)
    if (process.env.NODE_ENV === 'development' && !token) {
      console.debug('[Auth Debug] No access token found for request:', config.url);
    }

    if (token) {
      // Check if token needs refresh
      if (isTokenExpired(token, 60)) {
        // Token expires within 60 seconds, try to refresh
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Auth Debug] Token expiring soon, refreshing for:', config.url);
        }
        const newToken = await refreshTokenIfNeeded();
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
        } else if (process.env.NODE_ENV === 'development') {
          console.debug('[Auth Debug] Token refresh failed, no auth header added');
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
    // Extract message from various DRF response formats:
    // - {"detail": "..."} - Standard DRF error
    // - {"message": "..."} - Custom message format
    // - {"error": "..."} - Alternative error format
    // - {"non_field_errors": ["..."]} - DRF validation errors
    const message = 
      data?.detail || 
      data?.message || 
      data?.error ||
      (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join('. ') : null) ||
      'An error occurred';
    return {
      message,
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

/**
 * Extract user-friendly error message from API error response.
 * Handles Django REST Framework error format: {"field": ["error message"]}
 */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    
    // Handle DRF validation errors: {"code": ["drug with this code already exists."]}
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // First, check for top-level error message fields (most common)
      // Priority: detail > error > message
      if (typeof data.detail === 'string') {
        return data.detail;
      }
      if (typeof data.error === 'string') {
        return data.error;
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
      
      // Then handle field-level validation errors
      const messages: string[] = [];
      
      for (const [field, errors] of Object.entries(data)) {
        // Skip already-checked top-level string fields
        if (['detail', 'error', 'message', 'code'].includes(field) && typeof errors === 'string') {
          continue;
        }
        
        if (Array.isArray(errors)) {
          errors.forEach(err => {
            if (typeof err === 'string') {
              // Special case: unique constraint on identification
              if (field === 'non_field_errors' && err.includes('identification_type, identification_number must make a unique set')) {
                messages.push('A patient with this ID number already exists in the system.');
              } else if (field === 'non_field_errors') {
                // Don't prefix non_field_errors with field name
                messages.push(err);
              } else {
                // Format: "Code: drug with this code already exists"
                const fieldName = field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
                messages.push(`${fieldName}: ${err}`);
              }
            }
          });
        } else if (typeof errors === 'string') {
          const fieldName = field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
          messages.push(`${fieldName}: ${errors}`);
        }
      }
      
      if (messages.length > 0) {
        return messages.join('. ');
      }
    }
    
    // Fallback to status text
    if (error.response?.statusText) {
      return `${error.response.status}: ${error.response.statusText}`;
    }
    
    return error.message || 'An error occurred';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}

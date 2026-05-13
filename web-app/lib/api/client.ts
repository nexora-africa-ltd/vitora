import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '@/lib/auth/storage';
import { API_BASE_URL } from '@/lib/utils/constants';

/**
 * Get the API base URL.
 * Used for constructing full URLs for resources like DICOM WADO.
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

// ---------------------------------------------------------------------------
// Facility & Organization scoping — set by providers, read by request interceptor
// ---------------------------------------------------------------------------
let _activeFacilityId: number | null = null;
let _activeOrganizationId: number | null = null;

// Simple event emitter for facility changes (consumed by SyncProvider to
// reconnect PowerSync with credentials scoped to the new facility).
type FacilityChangeListener = (facilityId: number | null) => void;
const _facilityChangeListeners = new Set<FacilityChangeListener>();

/** Subscribe to facility ID changes. Returns an unsubscribe function. */
export function onFacilityChange(listener: FacilityChangeListener): () => void {
  _facilityChangeListeners.add(listener);
  return () => { _facilityChangeListeners.delete(listener); };
}

/** Called by FacilityProvider when the active facility changes. */
export function setActiveFacilityId(id: number | null): void {
  const prev = _activeFacilityId;
  _activeFacilityId = id;
  if (id !== prev) {
    _facilityChangeListeners.forEach(fn => fn(id));
  }
}

/** Get the current active facility ID (for external use). */
export function getActiveFacilityId(): number | null {
  return _activeFacilityId;
}

/** Called by FacilityProvider when the active organization changes. */
export function setActiveOrganizationId(id: number | null): void {
  _activeOrganizationId = id;
}

/** Get the current active organization ID (for external use). */
export function getActiveOrganizationId(): number | null {
  return _activeOrganizationId;
}

// Create axios instance — uses httpOnly cookies for auth (withCredentials)
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,  // Send httpOnly auth cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
  xsrfCookieName: 'csrftoken',   // Django's CSRF cookie name
  xsrfHeaderName: 'X-CSRFToken', // Header Django expects
});

// Request queue for token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

/**
 * Request interceptor — attaches facility & organization scoping headers.
 * Auth is handled automatically by httpOnly cookies (withCredentials).
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Attach facility ID header for multi-facility data scoping
    if (_activeFacilityId != null) {
      config.headers['X-Facility-Id'] = String(_activeFacilityId);
    }
    // Attach organization ID header for multi-org data scoping
    if (_activeOrganizationId != null) {
      config.headers['X-Organization-Id'] = String(_activeOrganizationId);
    }
    // Identify desktop app to the backend (analytics + debugging)
    if (typeof window !== 'undefined' && window.__TAURI__) {
      config.headers['X-Vitora-Client'] = 'desktop/0.1.0';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor — handles auth errors and cookie-based token refresh.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 403 with mfa_setup_required — grace period expired
    if (error.response?.status === 403) {
      const data = error.response.data as Record<string, unknown> | undefined;
      if (data && data.code === 'mfa_setup_required') {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/settings')) {
          window.location.href = '/settings?tab=security&reason=mfa_required';
        }
        return Promise.reject(error);
      }
      if (data && data.code === 'onboarding_required') {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/onboarding')) {
          window.location.href = '/onboarding';
        }
        return Promise.reject(error);
      }
    }

    // Handle 401 Unauthorized — try cookie-based refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: () => resolve(apiClient(originalRequest)),
            reject: (err: Error) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshed = await refreshViaCookie();
        if (refreshed) {
          processQueue(null);
          return apiClient(originalRequest);
        } else {
          handleAuthError();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError as Error);
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
 * Refresh access token via httpOnly cookie.
 * The refresh token is in a cookie; the backend reads it and sets a new access cookie.
 */
async function refreshViaCookie(): Promise<boolean> {
  try {
    await axios.post(`${API_BASE_URL}/api/auth/refresh/`, {}, { withCredentials: true });
    return true;
  } catch {
    tokenStorage.clearAll();
    return false;
  }
}

// Guard against multiple simultaneous auth error redirects
let isRedirectingToLogin = false;

/**
 * Handle authentication errors.
 */
function handleAuthError(): void {
  tokenStorage.clearAll();
  // Redirect to login (only once, only in browser) — preserve current path
  if (typeof window !== 'undefined' && !isRedirectingToLogin) {
    isRedirectingToLogin = true;
    const currentPath = window.location.pathname + window.location.search;
    const loginUrl = new URL('/login', window.location.origin);
    if (currentPath && currentPath !== '/' && currentPath !== '/login') {
      loginUrl.searchParams.set('callbackUrl', currentPath);
    }
    window.location.href = loginUrl.toString();
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

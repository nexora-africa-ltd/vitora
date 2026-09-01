import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '@/lib/auth/storage';
import { isDesktop, getApiUrl } from '@/lib/desktop';
import { API_BASE_URL } from '@/lib/utils/constants';
import { toast } from 'sonner';

/**
 * Get the API base URL.
 * Used for constructing full URLs for resources like DICOM WADO.
 */
export function getApiBaseUrl(): string {
  return _desktopApiUrl || API_BASE_URL;
}

// ---------------------------------------------------------------------------
// Desktop dynamic API URL — resolved from Tauri config at runtime
// ---------------------------------------------------------------------------
let _desktopApiUrl: string | null = null;
let _desktopApiUrlPromise: Promise<string> | null = null;

/**
 * Initialize the desktop API URL from Tauri config.
 * Call this early in the app lifecycle (e.g., in a provider).
 * Returns the resolved URL or falls back to API_BASE_URL.
 */
export async function initDesktopApiUrl(): Promise<string> {
  if (!isDesktop()) return API_BASE_URL;
  if (_desktopApiUrl) return _desktopApiUrl;
  if (!_desktopApiUrlPromise) {
    _desktopApiUrlPromise = getApiUrl().then((url) => {
      _desktopApiUrl = url;
      // Update the axios instance default for any requests that bypass the interceptor
      apiClient.defaults.baseURL = url;
      return url;
    });
  }
  return _desktopApiUrlPromise;
}

/** Get the resolved desktop API URL (sync, returns null if not yet initialized). */
export function getDesktopApiUrl(): string | null {
  return _desktopApiUrl;
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
  return () => {
    _facilityChangeListeners.delete(listener);
  };
}

/** Called by FacilityProvider when the active facility changes. */
export function setActiveFacilityId(id: number | null): void {
  const prev = _activeFacilityId;
  _activeFacilityId = id;
  if (id !== prev) {
    _facilityChangeListeners.forEach((fn) => fn(id));
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
  withCredentials: true, // Send httpOnly auth cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
  xsrfCookieName: 'csrftoken', // Django's CSRF cookie name
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
 * In web mode: auth via httpOnly cookies (withCredentials).
 * In desktop mode: auth via Authorization Bearer header (cookies don't work cross-origin over HTTP).
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // In desktop mode, ensure we have the hub URL before making requests
    if (isDesktop()) {
      if (!_desktopApiUrl && _desktopApiUrlPromise) {
        await _desktopApiUrlPromise;
      }
      if (_desktopApiUrl) {
        config.baseURL = _desktopApiUrl;
      }
      // Desktop: attach Bearer token (httpOnly cookies don't work cross-origin HTTP)
      const accessToken = tokenStorage.getAccessToken();
      if (accessToken) {
        config.headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }
    // Attach facility ID header for multi-facility data scoping
    if (_activeFacilityId != null) {
      config.headers['X-Facility-Id'] = String(_activeFacilityId);
    }
    // Attach organization ID header for multi-org data scoping
    if (_activeOrganizationId != null) {
      config.headers['X-Organization-Id'] = String(_activeOrganizationId);
    }
    // Identify desktop app to the backend (analytics + debugging)
    if (isDesktop()) {
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
        if (typeof window !== 'undefined') {
          // Dispatch event so MFAEnforcementOverlay can block all access
          window.dispatchEvent(new CustomEvent('vitora:mfa-enforcement'));
        }
        return Promise.reject(error);
      }
      if (data && data.code === 'onboarding_required') {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/onboarding')) {
          window.location.href = '/onboarding';
        }
        return Promise.reject(error);
      }
      if (data && data.code === 'license_expired') {
        // Emit a custom event so the LicenseProvider can update degraded state
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vitora:license-expired'));
        }
        return Promise.reject(error);
      }
      // Hub license guard codes — redirect to activate page instead of logging out
      if (
        data &&
        (data.code === 'hub_not_activated' ||
          data.code === 'hub_license_invalid' ||
          data.code === 'hub_license_locked')
      ) {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/activate')) {
          window.location.href = '/activate';
        }
        return Promise.reject(error);
      }
      // Hub read-only mode — allow through but emit event for UI feedback
      if (data && data.code === 'hub_license_read_only') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vitora:license-read-only'));
        }
        return Promise.reject(error);
      }
      if (data && data.code === 'permission_denied') {
        notifyPermissionDenied(error);
        return Promise.reject(error);
      }
    }

    // Handle 401 Unauthorized — try cookie-based refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // On the change-password page the session is restricted —
      // don't redirect to /login, just reject silently.
      if (typeof window !== 'undefined' && window.location.pathname === '/change-password') {
        return Promise.reject(error);
      }

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
 * Refresh access token.
 * Web mode: via httpOnly cookie (backend reads refresh cookie, sets new access cookie).
 * Desktop mode: via POST /api/token/refresh/ with refresh token in body.
 */
async function refreshViaCookie(): Promise<boolean> {
  try {
    const baseUrl = _desktopApiUrl || API_BASE_URL;

    if (isDesktop()) {
      // Desktop: use token-based refresh (cookies don't work cross-origin HTTP)
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) return false;
      const resp = await axios.post(
        `${baseUrl}/api/token/refresh/`,
        { refresh: refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (resp.data?.access) {
        tokenStorage.setTokens(resp.data.access, refreshToken);
        return true;
      }
      return false;
    }

    // Web: cookie-based refresh
    await axios.post(`${baseUrl}/api/auth/refresh/`, {}, { withCredentials: true });
    return true;
  } catch {
    tokenStorage.clearAll();
    return false;
  }
}

// Guard against multiple simultaneous auth error redirects
let isRedirectingToLogin = false;
let lastPermissionToastKey = '';
let lastPermissionToastAt = 0;

function notifyPermissionDenied(error: AxiosError): void {
  if (typeof window === 'undefined') return;
  const data = (error.response?.data ?? {}) as Record<string, unknown>;
  const code = String(data.code ?? 'permission_denied');
  const detail = String(data.detail ?? 'You do not have permission to perform this action.');
  const requiredPermission = String(data.required_permission ?? '').trim();
  const key = `${code}|${detail}|${requiredPermission}`;
  const now = Date.now();
  if (key === lastPermissionToastKey && now - lastPermissionToastAt < 2500) return;
  lastPermissionToastKey = key;
  lastPermissionToastAt = now;

  toast.error('Permission denied', {
    description: requiredPermission ? `${detail} Required: ${requiredPermission}.` : detail,
  });
}

/**
 * Handle authentication errors.
 */
function handleAuthError(): void {
  tokenStorage.clearAll();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    toast.error('Session expired', {
      description: 'Please sign in again to continue.',
    });
  }
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
    const data = error.response.data as {
      detail?: string;
      message?: string;
      error?: string;
      non_field_errors?: string[];
      code?: string;
      errors?: Record<string, string[]>;
      [key: string]: unknown;
    };
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
      details: data?.errors,
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
          errors.forEach((err) => {
            if (typeof err === 'string') {
              // Special case: unique constraint on identification
              if (
                field === 'non_field_errors' &&
                err.includes('identification_type, identification_number must make a unique set')
              ) {
                messages.push('A patient with this ID number already exists in the system.');
              } else if (
                field === 'non_field_errors' &&
                err.includes('patient, plan, member_number must make a unique set')
              ) {
                messages.push(
                  'This patient is already enrolled on the selected plan with this member number.'
                );
              } else if (field === 'non_field_errors') {
                // Don't prefix non_field_errors with field name
                messages.push(err);
              } else {
                // Format: "Code: drug with this code already exists"
                const fieldName = field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
                messages.push(`${fieldName}: ${err}`);
              }
            }
          });
        } else if (typeof errors === 'string') {
          const fieldName = field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
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

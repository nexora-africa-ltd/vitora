const USER_KEY = 'vitora_user';
const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';
const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';
const CLOUD_ACCESS_TOKEN_KEY = 'vitora_cloud_access_token';
const CLOUD_REFRESH_TOKEN_KEY = 'vitora_cloud_refresh_token';
const CLOUD_FACILITY_ID_KEY = 'vitora_cloud_facility_id';
const CLOUD_AUTO_LOGIN_CONSENT_KEY = 'vitora_cloud_auto_login_consent';

const authCleanups = new Set<() => void | Promise<void>>();
let cleanupPending: Promise<void> = Promise.resolve();
let authEpoch = 0;

export function getAuthEpoch(): number { return authEpoch; }

/** Register storage/cache cleanup without coupling authentication to its consumers. */
export function registerAuthCleanup(cleanup: () => void | Promise<void>): () => void {
  authCleanups.add(cleanup);
  return () => { authCleanups.delete(cleanup); };
}

/** A new session must not race a previous session's asynchronous data cleanup. */
export function waitForAuthCleanup(): Promise<void> {
  return cleanupPending;
}

/**
 * Auth storage utilities.
 *
 * In web mode: tokens are stored in httpOnly cookies (set by the backend,
 * inaccessible to JavaScript). Only user profile data (non-sensitive) is
 * kept in localStorage for UI display.
 *
 * In desktop mode: tokens are stored in localStorage because cross-origin
 * httpOnly cookies don't work over HTTP LAN (SameSite restrictions).
 */
export const tokenStorage = {
  /**
   * Check if the user is authenticated.
   * Since tokens are in httpOnly cookies, we infer auth status from the
   * presence of saved user data.
   */
  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(USER_KEY) !== null;
  },

  /**
   * Get stored access token (desktop mode only — web uses httpOnly cookies).
   */
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  /**
   * Get stored refresh token (desktop mode only — web uses httpOnly cookies).
   */
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Store JWT tokens (desktop mode only — web uses httpOnly cookies).
   */
  setTokens(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },

  /** Get the desktop-only access token for cloud-authoritative workflows. */
  getCloudAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CLOUD_ACCESS_TOKEN_KEY);
  },

  /** Get the desktop-only refresh token for cloud-authoritative workflows. */
  getCloudRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CLOUD_REFRESH_TOKEN_KEY);
  },

  /** Store a separate cloud session without replacing the local hub session. */
  setCloudTokens(access: string, refresh: string, facilityId?: number | null): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CLOUD_ACCESS_TOKEN_KEY, access);
    localStorage.setItem(CLOUD_REFRESH_TOKEN_KEY, refresh);
    if (facilityId != null) localStorage.setItem(CLOUD_FACILITY_ID_KEY, String(facilityId));
    window.dispatchEvent(new Event('vitora:cloud-session-changed'));
  },

  /** Return the facility identifier issued by the cloud authentication response. */
  getCloudFacilityId(): number | null {
    if (typeof window === 'undefined') return null;
    const value = localStorage.getItem(CLOUD_FACILITY_ID_KEY);
    return value && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  },

  hasCloudAutoLoginConsent(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(CLOUD_AUTO_LOGIN_CONSENT_KEY) === 'true';
  },

  setCloudAutoLoginConsent(consented: boolean): void {
    if (typeof window === 'undefined') return;
    if (consented) localStorage.setItem(CLOUD_AUTO_LOGIN_CONSENT_KEY, 'true');
    else localStorage.removeItem(CLOUD_AUTO_LOGIN_CONSENT_KEY);
  },

  /** Clear cloud credentials while keeping the local hub session available offline. */
  clearCloudTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(CLOUD_ACCESS_TOKEN_KEY);
    localStorage.removeItem(CLOUD_REFRESH_TOKEN_KEY);
    localStorage.removeItem(CLOUD_FACILITY_ID_KEY);
    window.dispatchEvent(new Event('vitora:cloud-session-changed'));
  },

  /**
   * Get the stored user profile data.
   */
  getUser<T = unknown>(): T | null {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_KEY);
    return user ? (JSON.parse(user) as T) : null;
  },

  /**
   * Store user profile data (non-sensitive: name, role, permissions).
   */
  setUser<T>(user: T): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  /**
   * Clear all stored user data.
   * Note: httpOnly cookies are cleared by calling POST /api/auth/logout/
   */
  clearAll(serverLogout?: Promise<unknown>): void {
    if (typeof window === 'undefined') return;
    authEpoch += 1;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MFA_GRACE_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(CLOUD_ACCESS_TOKEN_KEY);
    localStorage.removeItem(CLOUD_REFRESH_TOKEN_KEY);
    localStorage.removeItem(CLOUD_FACILITY_ID_KEY);
    // Clear the middleware auth cookie to prevent redirect loops
    document.cookie = 'vitora_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const jobs = Array.from(authCleanups, (cleanup) => {
      try { return Promise.resolve(cleanup()); }
      catch (error) { return Promise.reject(error); }
    });
    cleanupPending = Promise.all([cleanupPending, serverLogout, ...jobs]).then(() => undefined);
    // Preserve rejection for the next session (fail closed), while handling the
    // fire-and-forget logout call. Never log clinical data or credentials here.
    void cleanupPending.catch(() => console.error('Session data cleanup failed; reload required.'));
    window.dispatchEvent(new Event('vitora:auth-cleared'));
  },
};

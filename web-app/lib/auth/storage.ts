const USER_KEY = 'vitora_user';
const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';
const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';

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

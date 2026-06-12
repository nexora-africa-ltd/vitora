const USER_KEY = 'vitora_user';
const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';
const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';

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
  getUser(): any | null {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  /**
   * Store user profile data (non-sensitive: name, role, permissions).
   */
  setUser(user: any): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  /**
   * Clear all stored user data.
   * Note: httpOnly cookies are cleared by calling POST /api/auth/logout/
   */
  clearAll(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MFA_GRACE_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    // Clear the middleware auth cookie to prevent redirect loops
    document.cookie = 'vitora_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  },
};

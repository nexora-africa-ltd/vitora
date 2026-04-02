const ACCESS_TOKEN_KEY = 'vitora_access_token';
const REFRESH_TOKEN_KEY = 'vitora_refresh_token';
const USER_KEY = 'vitora_user';
const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';

/**
 * Token storage utilities using localStorage.
 * In production, consider httpOnly cookies for better security.
 */
export const tokenStorage = {
  /**
   * Get the access token from storage.
   */
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  /**
   * Get the refresh token from storage.
   */
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Store both tokens.
   */
  setTokens(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },

  /**
   * Get the stored user data.
   */
  getUser(): any | null {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  /**
   * Store user data.
   */
  setUser(user: any): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  /**
   * Clear all stored tokens and user data.
   */
  clearAll(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MFA_GRACE_KEY);
  },
};

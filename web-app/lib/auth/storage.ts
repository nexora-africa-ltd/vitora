const USER_KEY = 'vitora_user';
const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';

/**
 * Auth storage utilities.
 *
 * Tokens are stored in httpOnly cookies (set by the backend, inaccessible
 * to JavaScript). Only user profile data (non-sensitive) is kept in
 * localStorage for UI display.
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
   * @deprecated Tokens are now in httpOnly cookies — use isAuthenticated() instead.
   * Kept for backward compatibility during migration. Always returns null.
   */
  getAccessToken(): string | null {
    return null;
  },

  /**
   * @deprecated Tokens are now in httpOnly cookies. Always returns null.
   */
  getRefreshToken(): string | null {
    return null;
  },

  /**
   * @deprecated Tokens are now set via httpOnly cookies by the backend.
   * This is a no-op kept for backward compatibility during migration.
   */
  setTokens(_access: string, _refresh: string): void {
    // No-op: tokens are managed via httpOnly cookies
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
  },
};

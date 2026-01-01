interface DecodedToken {
  token_type: string;
  exp: number;
  iat: number;
  jti: string;
  user_id: number;
}

/**
 * Decode a JWT token without verification.
 * @param token JWT token string
 * @returns Decoded token payload or null if invalid
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired.
 * @param token JWT token string
 * @param bufferSeconds Buffer time before expiry (default: 0)
 * @returns true if token is expired or will expire within buffer seconds
 */
export function isTokenExpired(token: string, bufferSeconds = 0): boolean {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;

  const expirationTime = decoded.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  const bufferTime = bufferSeconds * 1000;

  return currentTime + bufferTime >= expirationTime;
}

/**
 * Get the expiration time of a token.
 * @param token JWT token string
 * @returns Expiration time as Date object or null if invalid
 */
export function getTokenExpiration(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return null;

  return new Date(decoded.exp * 1000);
}

/**
 * Get the user ID from a token.
 * @param token JWT token string
 * @returns User ID or null if invalid
 */
export function getUserIdFromToken(token: string): number | null {
  const decoded = decodeToken(token);
  return decoded?.user_id || null;
}

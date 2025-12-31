/**
 * Secure Storage Module
 * 
 * Provides secure storage for JWT tokens and user profile data using expo-secure-store.
 * Data is encrypted and persists across app restarts.
 * 
 * Security Features:
 * - AES-256 encryption via iOS Keychain / Android Keystore
 * - Tokens are never stored in AsyncStorage or plain text
 * - Automatic cleanup on logout
 * 
 * Storage Keys:
 * - access_token: JWT access token (short-lived)
 * - refresh_token: JWT refresh token (long-lived)
 * - user_data: User profile (JSON string)
 */

import * as SecureStore from 'expo-secure-store';

// Storage keys
const KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
} as const;

/**
 * User profile data structure
 */
export interface UserData {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

/**
 * Store access and refresh tokens securely
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 */
export async function setTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  console.log('[Storage] Storing tokens...');
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken);
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken);
  console.log('[Storage] Tokens stored successfully');
}

/**
 * Retrieve stored access token
 * @returns Access token or null if not found
 */
export async function getAccessToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  console.log('[Storage] getAccessToken:', token ? 'found' : 'not found');
  return token;
}

/**
 * Retrieve stored refresh token
 * @returns Refresh token or null if not found
 */
export async function getRefreshToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

/**
 * Store user profile data securely
 * @param user - User profile object
 */
export async function setUser(user: UserData): Promise<void> {
  const userData = JSON.stringify(user);
  await SecureStore.setItemAsync(KEYS.USER_DATA, userData);
}

/**
 * Retrieve stored user profile data
 * @returns User profile object or null if not found
 */
export async function getUser(): Promise<UserData | null> {
  try {
    const userData = await SecureStore.getItemAsync(KEYS.USER_DATA);
    if (!userData) {
      return null;
    }
    return JSON.parse(userData) as UserData;
  } catch (error) {
    // Handle JSON parse errors gracefully
    console.error('Failed to parse user data:', error);
    return null;
  }
}

/**
 * Check if user is authenticated (has valid tokens)
 * @returns True if both access and refresh tokens exist
 */
export async function isAuthenticated(): Promise<boolean> {
  const [accessToken, refreshToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);

  return accessToken !== null && refreshToken !== null;
}

/**
 * Clear all stored tokens and user data (logout)
 */
export async function clearAll(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(KEYS.USER_DATA);
}

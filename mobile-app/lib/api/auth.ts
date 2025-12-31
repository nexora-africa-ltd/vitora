/**
 * Authentication API Client
 * 
 * Provides methods for authentication with the Django backend:
 * - Login with username/password
 * - Refresh access token
 * - Verify token validity
 * 
 * Backend Endpoints (from Phase 0):
 * - POST /api/token/ - Login (returns access + refresh tokens)
 * - POST /api/token/refresh/ - Refresh access token
 * - POST /api/token/verify/ - Verify token validity
 */

import axios from 'axios';
import { UserData } from '../auth/storage';
import { API_CONFIG, API_ENDPOINTS } from '../../constants/config';

/**
 * Login response from backend
 */
interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  };
}

/**
 * Refresh token response from backend
 */
interface RefreshResponse {
  access: string;
  refresh: string;
}

/**
 * Login with username and password
 * @param username - User's username
 * @param password - User's password
 * @returns Access token, refresh token, and user data
 * @throws Error if login fails
 */
export async function login(
  username: string,
  password: string
): Promise<{
  access: string;
  refresh: string;
  user: UserData;
}> {
  // Use axios directly with full URL and ngrok header for login
  // (login happens before apiClient is configured with auth token)
  const response = await axios.post<LoginResponse>(
    `${API_CONFIG.BASE_URL}${API_ENDPOINTS.LOGIN}`,
    { username, password },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      timeout: API_CONFIG.TIMEOUT,
    }
  );

  // Transform backend response to match our UserData interface
  return {
    access: response.data.access,
    refresh: response.data.refresh,
    user: {
      id: response.data.user?.id || '1',
      username: response.data.user?.username || username,
      email: response.data.user?.email || '',
      firstName: response.data.user?.first_name || '',
      lastName: response.data.user?.last_name || '',
      role: response.data.user?.role || 'user',
    },
  };
}

/**
 * Refresh access token using refresh token
 * @param refreshToken - Refresh token
 * @returns New access token and refresh token
 * @throws Error if refresh fails
 */
export async function refresh(refreshToken: string): Promise<{
  access: string;
  refresh: string;
}> {
  const response = await axios.post<RefreshResponse>(
    `${API_CONFIG.BASE_URL}${API_ENDPOINTS.REFRESH}`,
    { refresh: refreshToken },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      timeout: API_CONFIG.TIMEOUT,
    }
  );

  return {
    access: response.data.access,
    refresh: response.data.refresh,
  };
}

/**
 * Verify if a token is valid
 * @param token - Access token to verify
 * @returns True if token is valid, false otherwise
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    await axios.post(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.VERIFY}`,
      { token },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        timeout: API_CONFIG.TIMEOUT,
      }
    );
    return true;
  } catch {
    return false;
  }
}

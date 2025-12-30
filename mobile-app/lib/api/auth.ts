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
  try {
    const response = await axios.post<LoginResponse>('/api/token/', {
      username,
      password,
    });

    // Transform backend response to match our UserData interface
    return {
      access: response.data.access,
      refresh: response.data.refresh,
      user: {
        id: response.data.user.id,
        username: response.data.user.username,
        email: response.data.user.email,
        firstName: response.data.user.first_name,
        lastName: response.data.user.last_name,
        role: response.data.user.role,
      },
    };
  } catch (error) {
    // Re-throw axios errors
    throw error;
  }
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
  try {
    const response = await axios.post<RefreshResponse>('/api/token/refresh/', {
      refresh: refreshToken,
    });

    return {
      access: response.data.access,
      refresh: response.data.refresh,
    };
  } catch (error) {
    // Re-throw axios errors
    throw error;
  }
}

/**
 * Verify if a token is valid
 * @param token - Access token to verify
 * @returns True if token is valid, false otherwise
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    await axios.post('/api/token/verify/', {
      token,
    });
    return true;
  } catch (error) {
    return false;
  }
}

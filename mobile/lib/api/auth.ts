import axios from 'axios';

import { getApiBaseUrl } from '@/lib/config/api-config';
import { LoginResponseSchema, RefreshResponseSchema } from '@/lib/schemas/auth.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { LoginResponse } from '@/lib/types/auth';

export async function loginWithPassword(username: string, password: string): Promise<LoginResponse> {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await axios.post(`${apiBaseUrl}/api/token/`, { username, password }, {
    headers: { 'Content-Type': 'application/json' },
  });

  return parseResponse(LoginResponseSchema, response.data, { context: 'auth.login' });
}

export async function refreshAccessToken(refresh: string): Promise<string> {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await axios.post(`${apiBaseUrl}/api/token/refresh/`, { refresh }, {
    headers: { 'Content-Type': 'application/json' },
  });

  const parsed = parseResponse(RefreshResponseSchema, response.data, { context: 'auth.refresh' });
  return parsed.access;
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import { deleteSensitiveValue, getSensitiveJsonValue, getSensitiveValue, setSensitiveJsonValue, setSensitiveValue } from '@/lib/storage/secure-storage';
import type { AuthTokens, AuthUser } from '@/lib/types/auth';

const ACCESS_TOKEN_KEY = 'vitora.mobile.access-token';
const REFRESH_TOKEN_KEY = 'vitora.mobile.refresh-token';
const USER_KEY = 'vitora.mobile.user';

export async function persistAuthSession(tokens: AuthTokens, user: AuthUser): Promise<void> {
  await Promise.all([
    setSensitiveValue(ACCESS_TOKEN_KEY, tokens.access),
    setSensitiveValue(REFRESH_TOKEN_KEY, tokens.refresh),
    setSensitiveJsonValue(USER_KEY, user),
  ]);
}

export async function getStoredTokens(): Promise<AuthTokens | null> {
  const [access, refresh] = await Promise.all([
    getSensitiveValue(ACCESS_TOKEN_KEY),
    getSensitiveValue(REFRESH_TOKEN_KEY),
  ]);

  if (!access || !refresh) {
    return null;
  }

  return { access, refresh };
}

export async function getStoredUser(): Promise<AuthUser | null> {
  return getSensitiveJsonValue<AuthUser>(USER_KEY);
}

export async function updateStoredAccessToken(accessToken: string): Promise<void> {
  await setSensitiveValue(ACCESS_TOKEN_KEY, accessToken);
}

export async function clearStoredAuthSession(): Promise<void> {
  await Promise.all([
    deleteSensitiveValue(ACCESS_TOKEN_KEY),
    deleteSensitiveValue(REFRESH_TOKEN_KEY),
    deleteSensitiveValue(USER_KEY),
  ]);
}

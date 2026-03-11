import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { AuthTokens, AuthUser } from '@/lib/types/auth';

const ACCESS_TOKEN_KEY = 'vitora.mobile.access-token';
const REFRESH_TOKEN_KEY = 'vitora.mobile.refresh-token';
const USER_KEY = 'vitora.mobile.user';

async function secureStoreIsUsable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function setSensitiveValue(key: string, value: string): Promise<void> {
  if (await secureStoreIsUsable()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  await AsyncStorage.setItem(key, value);
}

async function getSensitiveValue(key: string): Promise<string | null> {
  if (await secureStoreIsUsable()) {
    return SecureStore.getItemAsync(key);
  }

  return AsyncStorage.getItem(key);
}

async function deleteSensitiveValue(key: string): Promise<void> {
  if (await secureStoreIsUsable()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }

  await AsyncStorage.removeItem(key);
}

export async function persistAuthSession(tokens: AuthTokens, user: AuthUser): Promise<void> {
  await Promise.all([
    setSensitiveValue(ACCESS_TOKEN_KEY, tokens.access),
    setSensitiveValue(REFRESH_TOKEN_KEY, tokens.refresh),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
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
  const rawUser = await AsyncStorage.getItem(USER_KEY);

  if (!rawUser) {
    return null;
  }

  return JSON.parse(rawUser) as AuthUser;
}

export async function updateStoredAccessToken(accessToken: string): Promise<void> {
  await setSensitiveValue(ACCESS_TOKEN_KEY, accessToken);
}

export async function clearStoredAuthSession(): Promise<void> {
  await Promise.all([
    deleteSensitiveValue(ACCESS_TOKEN_KEY),
    deleteSensitiveValue(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}
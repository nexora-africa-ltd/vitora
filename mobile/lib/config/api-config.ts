import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_URL_KEY = 'vitora.mobile.api-url';

let currentApiBaseUrl = defaultApiBaseUrl();
let initialized = false;

function defaultApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:9088' : 'http://127.0.0.1:9088';
}

export function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export async function initializeApiBaseUrl(): Promise<string> {
  const storedValue = await AsyncStorage.getItem(API_URL_KEY);
  currentApiBaseUrl = storedValue ? normalizeApiUrl(storedValue) : defaultApiBaseUrl();
  initialized = true;
  return currentApiBaseUrl;
}

export async function getApiBaseUrl(): Promise<string> {
  if (!initialized) {
    return initializeApiBaseUrl();
  }

  return currentApiBaseUrl;
}

export function getApiBaseUrlSync(): string {
  return currentApiBaseUrl;
}

export async function setApiBaseUrl(nextUrl: string): Promise<string> {
  const normalized = normalizeApiUrl(nextUrl);
  await AsyncStorage.setItem(API_URL_KEY, normalized);
  currentApiBaseUrl = normalized;
  initialized = true;
  return normalized;
}
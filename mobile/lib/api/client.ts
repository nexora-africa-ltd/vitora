import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { notifyAuthInvalidation } from '@/lib/auth/session-events';
import { clearStoredAuthSession, getStoredTokens, updateStoredAccessToken } from '@/lib/auth/token-storage';
import { getApiBaseUrl } from '@/lib/config/api-config';
import { refreshAccessToken } from './auth';

type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}

export const apiClient: AxiosInstance = axios.create({
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: Error) => void }> = [];

function processQueue(error: Error | null, token: string | null = null) {
  failedQueue.forEach((entry) => {
    if (error) {
      entry.reject(error);
    } else if (token) {
      entry.resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.request.use(async (config) => {
  const nextConfig = config;
  nextConfig.baseURL = await getApiBaseUrl();

  const tokens = await getStoredTokens();
  if (tokens?.access) {
    nextConfig.headers.Authorization = `Bearer ${tokens.access}`;
  }

  return nextConfig;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    const tokens = await getStoredTokens();
    if (!tokens?.refresh) {
      await clearStoredAuthSession();
      notifyAuthInvalidation();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const nextAccessToken = await refreshAccessToken(tokens.refresh);
      await updateStoredAccessToken(nextAccessToken);
      processQueue(null, nextAccessToken);
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);
      await clearStoredAuthSession();
      notifyAuthInvalidation();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    return {
      message:
        (error.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
        (error.response?.data as { detail?: string; message?: string } | undefined)?.message ||
        error.message,
      status: error.response?.status ?? 0,
      details: error.response?.data,
    };
  }

  if (error instanceof Error) {
    return { message: error.message, status: 0 };
  }

  return { message: 'Unexpected error', status: 0 };
}
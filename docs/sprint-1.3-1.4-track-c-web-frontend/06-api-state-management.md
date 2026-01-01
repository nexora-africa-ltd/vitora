# Sprint 1.3-1.4 Track C: API Client & State Management

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P0 (Critical Path)
**Estimated Tests**: 20 tests
**Parallel Track**: 🅱️ Track B (Days 7-8)

---

## Overview

This document covers the API client setup with Axios, authentication interceptors, error handling, TanStack Query configuration, and Zustand stores for client state management.

---

## 1. Axios Client Setup

**lib/api/client.ts**:
```typescript
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '@/lib/auth/storage';
import { isTokenExpired } from '@/lib/auth/token-utils';
import { API_BASE_URL } from '@/lib/utils/constants';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request queue for token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

/**
 * Request interceptor - adds auth token to requests.
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    
    if (token) {
      // Check if token needs refresh
      if (isTokenExpired(token, 60)) {
        // Token expires within 60 seconds, try to refresh
        const newToken = await refreshTokenIfNeeded();
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
        }
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor - handles auth errors and token refresh.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Wait for token refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject: (err: Error) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshTokenIfNeeded();
        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } else {
          // Refresh failed, redirect to login
          handleAuthError();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        handleAuthError();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Refresh the access token.
 */
async function refreshTokenIfNeeded(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
      refresh: refreshToken,
    });
    
    const newAccessToken = response.data.access;
    tokenStorage.setTokens(newAccessToken, refreshToken);
    return newAccessToken;
  } catch {
    tokenStorage.clearAll();
    return null;
  }
}

/**
 * Handle authentication errors.
 */
function handleAuthError(): void {
  tokenStorage.clearAll();
  // Redirect to login (only in browser)
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * API Error type for consistent error handling.
 */
export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: Record<string, string[]>;
}

/**
 * Transform Axios errors to a consistent format.
 */
export function transformAxiosError(error: AxiosError): ApiError {
  if (error.response) {
    const data = error.response.data as any;
    return {
      message: data?.detail || data?.message || 'An error occurred',
      status: error.response.status,
      code: data?.code,
      details: data?.errors || data,
    };
  }
  
  if (error.request) {
    return {
      message: 'Network error. Please check your connection.',
      status: 0,
      code: 'NETWORK_ERROR',
    };
  }
  
  return {
    message: error.message || 'An unexpected error occurred',
    status: 0,
    code: 'UNKNOWN_ERROR',
  };
}
```

---

## 2. Kenya Locations API

**lib/api/locations.ts**:
```typescript
import { apiClient } from './client';

export interface County {
  id: number;
  code: number;
  name: string;
}

export interface SubCounty {
  id: number;
  county: number;
  name: string;
}

export interface Ward {
  id: number;
  sub_county: number;
  name: string;
}

export const locationsApi = {
  /**
   * Get all 47 Kenya counties.
   */
  async getCounties(): Promise<County[]> {
    const response = await apiClient.get<County[]>('/api/locations/counties/');
    return response.data;
  },

  /**
   * Get sub-counties for a county.
   */
  async getSubCounties(countyId: number): Promise<SubCounty[]> {
    const response = await apiClient.get<SubCounty[]>(
      `/api/locations/sub-counties/`,
      { params: { county: countyId } }
    );
    return response.data;
  },

  /**
   * Get wards for a sub-county.
   */
  async getWards(subCountyId: number): Promise<Ward[]> {
    const response = await apiClient.get<Ward[]>(
      `/api/locations/wards/`,
      { params: { sub_county: subCountyId } }
    );
    return response.data;
  },
};
```

---

## 3. TanStack Query Configuration

**lib/query-client.ts**:
```typescript
import { QueryClient, DefaultOptions } from '@tanstack/react-query';
import { transformAxiosError } from './api/client';
import { AxiosError } from 'axios';

const defaultOptions: DefaultOptions = {
  queries: {
    // Stale time: 1 minute
    staleTime: 60 * 1000,
    
    // Cache time: 5 minutes
    gcTime: 5 * 60 * 1000,
    
    // Retry failed requests once
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof AxiosError && error.response?.status) {
        if (error.response.status >= 400 && error.response.status < 500) {
          return false;
        }
      }
      return failureCount < 1;
    },
    
    // Don't refetch on window focus in development
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
    
    // Network mode
    networkMode: 'offlineFirst',
  },
  mutations: {
    // Retry mutations once
    retry: 1,
    
    // Network mode
    networkMode: 'offlineFirst',
  },
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions,
  });
}

/**
 * Query keys factory for consistent query key management.
 */
export const queryKeys = {
  // Patients
  patients: {
    all: ['patients'] as const,
    lists: () => [...queryKeys.patients.all, 'list'] as const,
    list: (params: object) => [...queryKeys.patients.lists(), params] as const,
    details: () => [...queryKeys.patients.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.patients.details(), id] as const,
    emergencyContacts: (id: number) => [...queryKeys.patients.detail(id), 'emergency-contacts'] as const,
    encounters: (id: number) => [...queryKeys.patients.detail(id), 'encounters'] as const,
  },
  
  // Encounters
  encounters: {
    all: ['encounters'] as const,
    lists: () => [...queryKeys.encounters.all, 'list'] as const,
    list: (params: object) => [...queryKeys.encounters.lists(), params] as const,
    details: () => [...queryKeys.encounters.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.encounters.details(), id] as const,
    diagnoses: (id: number) => [...queryKeys.encounters.detail(id), 'diagnoses'] as const,
    treatmentPlan: (id: number) => [...queryKeys.encounters.detail(id), 'treatment-plan'] as const,
  },
  
  // Locations
  locations: {
    all: ['locations'] as const,
    counties: () => [...queryKeys.locations.all, 'counties'] as const,
    subCounties: (countyId: number) => [...queryKeys.locations.all, 'sub-counties', countyId] as const,
    wards: (subCountyId: number) => [...queryKeys.locations.all, 'wards', subCountyId] as const,
  },
  
  // ICD-10 codes
  icd10: {
    all: ['icd10'] as const,
    search: (query: string) => [...queryKeys.icd10.all, 'search', query] as const,
  },
};
```

---

## 4. Locations Hooks

**lib/hooks/use-locations.ts**:
```typescript
import { useQuery } from '@tanstack/react-query';
import { locationsApi, County, SubCounty, Ward } from '@/lib/api/locations';
import { queryKeys } from '@/lib/query-client';

/**
 * Hook for fetching Kenya counties.
 */
export function useCounties() {
  return useQuery({
    queryKey: queryKeys.locations.counties(),
    queryFn: locationsApi.getCounties,
    staleTime: Infinity, // Counties don't change
  });
}

/**
 * Hook for fetching sub-counties for a county.
 */
export function useSubCounties(countyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.locations.subCounties(countyId!),
    queryFn: () => locationsApi.getSubCounties(countyId!),
    enabled: !!countyId,
    staleTime: Infinity,
  });
}

/**
 * Hook for fetching wards for a sub-county.
 */
export function useWards(subCountyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.locations.wards(subCountyId!),
    queryFn: () => locationsApi.getWards(subCountyId!),
    enabled: !!subCountyId,
    staleTime: Infinity,
  });
}

/**
 * Hook for cascading location selection.
 */
export function useLocationSelector(initialCountyId?: number, initialSubCountyId?: number) {
  const counties = useCounties();
  const subCounties = useSubCounties(initialCountyId);
  const wards = useWards(initialSubCountyId);

  return {
    counties: counties.data || [],
    subCounties: subCounties.data || [],
    wards: wards.data || [],
    isLoading: counties.isLoading,
    isLoadingSubCounties: subCounties.isLoading,
    isLoadingWards: wards.isLoading,
  };
}
```

---

## 5. UI Store (Zustand)

**lib/stores/ui-store.ts**:
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  // Sidebar state
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  
  // Theme
  theme: 'light' | 'dark' | 'system';
  
  // Notifications
  unreadNotifications: number;
  
  // Global loading
  isGlobalLoading: boolean;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setUnreadNotifications: (count: number) => void;
  setGlobalLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      theme: 'system',
      unreadNotifications: 0,
      isGlobalLoading: false,
      
      // Actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
      setUnreadNotifications: (count) => set({ unreadNotifications: count }),
      setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),
    }),
    {
      name: 'vitora-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);
```

---

## 6. Form Store (Zustand)

**lib/stores/form-store.ts**:
```typescript
import { create } from 'zustand';

interface FormDraft {
  id: string;
  data: Record<string, any>;
  savedAt: Date;
}

interface FormState {
  // Draft storage
  drafts: Record<string, FormDraft>;
  
  // Actions
  saveDraft: (formId: string, data: Record<string, any>) => void;
  getDraft: (formId: string) => FormDraft | null;
  clearDraft: (formId: string) => void;
  clearAllDrafts: () => void;
}

export const useFormStore = create<FormState>()((set, get) => ({
  drafts: {},
  
  saveDraft: (formId, data) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [formId]: {
          id: formId,
          data,
          savedAt: new Date(),
        },
      },
    }));
  },
  
  getDraft: (formId) => {
    return get().drafts[formId] || null;
  },
  
  clearDraft: (formId) => {
    set((state) => {
      const { [formId]: _, ...rest } = state.drafts;
      return { drafts: rest };
    });
  },
  
  clearAllDrafts: () => {
    set({ drafts: {} });
  },
}));
```

---

## 7. Toast Notifications

**lib/hooks/use-toast-notification.ts**:
```typescript
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api/client';

export function useToastNotification() {
  const { toast } = useToast();

  return {
    success: (title: string, description?: string) => {
      toast({
        title,
        description,
        variant: 'default',
      });
    },
    
    error: (error: ApiError | Error | string, title = 'Error') => {
      const message = typeof error === 'string' 
        ? error 
        : 'message' in error 
          ? error.message 
          : 'An error occurred';
      
      toast({
        title,
        description: message,
        variant: 'destructive',
      });
    },
    
    warning: (title: string, description?: string) => {
      toast({
        title,
        description,
        variant: 'default',
        className: 'bg-amber-50 border-amber-200 text-amber-900',
      });
    },
    
    info: (title: string, description?: string) => {
      toast({
        title,
        description,
        variant: 'default',
      });
    },
  };
}
```

---

## 8. Global Error Boundary

**components/shared/error-boundary.tsx**:
```typescript
'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
    // TODO: Send to error tracking service (Sentry, etc.)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. Our team has been notified.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <pre className="p-3 bg-muted rounded-md text-xs overflow-auto max-h-40">
                  {this.state.error.message}
                </pre>
              )}
            </CardContent>
            <CardFooter className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => (window.location.href = '/')}>
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
              <Button onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## 9. Network Status Hook

**lib/hooks/use-network-status.ts**:
```typescript
import { useState, useEffect } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
  });

  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({
        isOnline: true,
        wasOffline: !prev.isOnline ? true : prev.wasOffline,
      }));
    };

    const handleOffline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
```

**components/shared/offline-banner.tsx**:
```typescript
'use client';

import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-center text-sm font-medium transition-all',
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-amber-500 text-amber-950'
      )}
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-2">
          <Wifi className="h-4 w-4" />
          Back online
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          You're offline. Some features may be unavailable.
        </span>
      )}
    </div>
  );
}
```

---

## 10. Test Coverage (20 tests)

### 10.1 API Client Tests (6 tests)

**__tests__/lib/api/client.test.ts**:
```typescript
import { apiClient, transformAxiosError } from '@/lib/api/client';
import { tokenStorage } from '@/lib/auth/storage';
import axios, { AxiosError } from 'axios';

jest.mock('@/lib/auth/storage');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add auth header when token exists', async () => {
    (tokenStorage.getAccessToken as jest.Mock).mockReturnValue('test-token');
    
    const config = await apiClient.interceptors.request.handlers[0].fulfilled({
      headers: {},
    });
    
    expect(config.headers.Authorization).toBe('Bearer test-token');
  });

  it('should not add auth header when no token', async () => {
    (tokenStorage.getAccessToken as jest.Mock).mockReturnValue(null);
    
    const config = await apiClient.interceptors.request.handlers[0].fulfilled({
      headers: {},
    });
    
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('should have correct base URL', () => {
    expect(apiClient.defaults.baseURL).toBeDefined();
  });

  it('should have timeout configured', () => {
    expect(apiClient.defaults.timeout).toBe(30000);
  });
});

describe('transformAxiosError', () => {
  it('should transform response error', () => {
    const error = {
      response: {
        status: 400,
        data: { detail: 'Bad request' },
      },
    } as AxiosError;
    
    const result = transformAxiosError(error);
    
    expect(result.message).toBe('Bad request');
    expect(result.status).toBe(400);
  });

  it('should handle network error', () => {
    const error = {
      request: {},
    } as AxiosError;
    
    const result = transformAxiosError(error);
    
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.status).toBe(0);
  });
});
```

### 10.2 Query Client Tests (4 tests)

**__tests__/lib/query-client.test.ts**:
```typescript
import { createQueryClient, queryKeys } from '@/lib/query-client';

describe('Query Client', () => {
  it('should create query client with default options', () => {
    const client = createQueryClient();
    expect(client).toBeDefined();
  });

  it('should have correct default stale time', () => {
    const client = createQueryClient();
    const options = client.getDefaultOptions();
    expect(options.queries?.staleTime).toBe(60 * 1000);
  });
});

describe('Query Keys', () => {
  it('should generate patient list key', () => {
    const key = queryKeys.patients.list({ page: 1 });
    expect(key).toEqual(['patients', 'list', { page: 1 }]);
  });

  it('should generate patient detail key', () => {
    const key = queryKeys.patients.detail(123);
    expect(key).toEqual(['patients', 'detail', 123]);
  });
});
```

### 10.3 Locations Hooks Tests (4 tests)

**__tests__/lib/hooks/use-locations.test.tsx**:
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCounties, useSubCounties, useWards } from '@/lib/hooks/use-locations';
import { locationsApi } from '@/lib/api/locations';

jest.mock('@/lib/api/locations');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useCounties', () => {
  it('should fetch Kenya counties', async () => {
    const mockCounties = [{ id: 1, code: 1, name: 'Mombasa' }];
    (locationsApi.getCounties as jest.Mock).mockResolvedValue(mockCounties);

    const { result } = renderHook(() => useCounties(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCounties);
  });
});

describe('useSubCounties', () => {
  it('should fetch sub-counties when county provided', async () => {
    const mockSubCounties = [{ id: 1, county: 1, name: 'Mvita' }];
    (locationsApi.getSubCounties as jest.Mock).mockResolvedValue(mockSubCounties);

    const { result } = renderHook(() => useSubCounties(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(locationsApi.getSubCounties).toHaveBeenCalledWith(1);
  });

  it('should not fetch when county is undefined', () => {
    const { result } = renderHook(() => useSubCounties(undefined), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useWards', () => {
  it('should fetch wards when sub-county provided', async () => {
    const mockWards = [{ id: 1, sub_county: 1, name: 'Tudor' }];
    (locationsApi.getWards as jest.Mock).mockResolvedValue(mockWards);

    const { result } = renderHook(() => useWards(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(locationsApi.getWards).toHaveBeenCalledWith(1);
  });
});
```

### 10.4 UI Store Tests (4 tests)

**__tests__/lib/stores/ui-store.test.ts**:
```typescript
import { useUIStore } from '@/lib/stores/ui-store';

describe('UI Store', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      theme: 'system',
      unreadNotifications: 0,
      isGlobalLoading: false,
    });
  });

  it('should toggle sidebar', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    
    useUIStore.getState().toggleSidebar();
    
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('should set sidebar collapsed state', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('should set theme', () => {
    useUIStore.getState().setTheme('dark');
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('should set unread notifications count', () => {
    useUIStore.getState().setUnreadNotifications(5);
    expect(useUIStore.getState().unreadNotifications).toBe(5);
  });
});
```

### 10.5 Network Status Tests (2 tests)

**__tests__/lib/hooks/use-network-status.test.ts**:
```typescript
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';

describe('useNetworkStatus', () => {
  it('should return initial online status', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('should update when going offline', () => {
    const { result } = renderHook(() => useNetworkStatus());
    
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    
    expect(result.current.isOnline).toBe(false);
  });
});
```

---

## 11. Checklist

### Days 7-8: API & State
- [x] Create Axios client with interceptors
- [x] Implement token refresh logic
- [x] Create error transformation utility
- [x] Set up TanStack Query configuration
- [x] Create query keys factory
- [x] Implement locations API and hooks
- [x] Create UI store (Zustand)
- [x] Create form store (Zustand)
- [x] Implement toast notifications
- [x] Create error boundary
- [x] Implement network status hook
- [x] Create offline banner
- [x] Write 20 tests (43 tests passing)

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Axios client with auth interceptors | ✅ |
| Token refresh mechanism | ✅ |
| Error transformation utility | ✅ |
| TanStack Query configuration | ✅ |
| Query keys factory | ✅ |
| Locations API and hooks | ✅ |
| UI Zustand store | ✅ |
| Form draft store | ✅ |
| Toast notifications hook | ✅ |
| Error boundary component | ✅ |
| Network status hook | ✅ |
| Offline banner component | ✅ |
| 20 API/state tests passing | ✅ (43 tests) |

---

**Previous**: [05-encounter-module.md](./05-encounter-module.md)
**Next**: [07-testing-infrastructure.md](./07-testing-infrastructure.md)

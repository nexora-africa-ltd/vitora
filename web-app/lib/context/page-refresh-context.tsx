/**
 * Page Refresh Context
 *
 * Provides global page refresh functionality and tracks last fetch time.
 * Works with React Query to invalidate queries and track data freshness.
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface PageRefreshContextValue {
  /** Timestamp of last successful data fetch */
  lastFetchTime: Date | null;
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  /** Trigger a page refresh (invalidates all active queries) */
  refresh: () => Promise<void>;
  /** Report that data was fetched (called by queries) */
  reportFetch: () => void;
  /** Monotonically increasing key that changes on each refresh (used by offline queries) */
  refreshKey: number;
}

const PageRefreshContext = createContext<PageRefreshContextValue | null>(null);

export function PageRefreshProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize from cached queries and listen to React Query events
  useEffect(() => {
    // Initialize lastFetchTime from existing cached queries on mount
    const initializeFromCache = () => {
      const queries = queryClient.getQueryCache().getAll();
      const latestUpdate = queries
        .filter(q => q.state.status === 'success' && q.state.dataUpdatedAt)
        .map(q => q.state.dataUpdatedAt)
        .sort((a, b) => b - a)[0];

      if (latestUpdate) {
        setLastFetchTime(new Date(latestUpdate));
      }
    };

    initializeFromCache();

    // Subscribe to query cache updates
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Track when queries successfully fetch
      if (event?.type === 'updated' && event.query.state.status === 'success') {
        setLastFetchTime(new Date());
      }
    });

    return () => unsubscribe();
  }, [queryClient]);

  const reportFetch = useCallback(() => {
    setLastFetchTime(new Date());
  }, []);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);

    try {
      // Invalidate all active queries - this triggers refetch for queries with active observers
      await queryClient.invalidateQueries();
      // Bump refreshKey to trigger PowerSync/offline query re-execution
      setRefreshKey(k => k + 1);
      setLastFetchTime(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, isRefreshing]);

  const value = useMemo<PageRefreshContextValue>(() => ({
    lastFetchTime,
    isRefreshing,
    refresh,
    reportFetch,
    refreshKey,
  }), [lastFetchTime, isRefreshing, refresh, reportFetch, refreshKey]);

  return (
    <PageRefreshContext.Provider value={value}>
      {children}
    </PageRefreshContext.Provider>
  );
}

export function usePageRefresh(): PageRefreshContextValue {
  const context = useContext(PageRefreshContext);
  if (!context) {
    // Return a default value for components outside the provider
    return {
      lastFetchTime: null,
      isRefreshing: false,
      refresh: async () => {},
      reportFetch: () => {},
      refreshKey: 0,
    };
  }
  return context;
}

/**
 * Format the last fetch time for display
 */
export function formatLastFetch(date: Date | null): string {
  if (!date) return 'Not yet';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours === 1) return '1 hr ago';
  if (hours < 24) return `${hours} hrs ago`;

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format the last fetch time in short form for compact displays
 */
export function formatLastFetchShort(date: Date | null): string {
  if (!date) return '—';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

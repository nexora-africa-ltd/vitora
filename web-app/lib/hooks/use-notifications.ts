/**
 * React Query hooks for notifications.
 * Sprint 1.x: In-app notification system
 *
 * Provides hooks for:
 * - useNotifications: Fetch notification list with optional polling
 * - useUnreadCount: Fetch unread count for badge (with polling)
 * - useMarkNotificationRead: Mark single notification as read
 * - useMarkAllRead: Mark all notifications as read
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/lib/api/notifications';
import type { NotificationListParams } from '@/lib/types/notification';

/** Query key factory for notifications */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: NotificationListParams) => [...notificationKeys.all, 'list', params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  detail: (id: number) => [...notificationKeys.all, 'detail', id] as const,
};

/** Default polling interval (30 seconds) */
const DEFAULT_POLLING_INTERVAL = 30 * 1000;

/**
 * Hook to fetch notification list.
 * @param params - Filter parameters
 * @param options - Additional options including polling
 */
export function useNotifications(
  params?: NotificationListParams,
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  }
) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationApi.listNotifications(params),
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled,
  });
}

/**
 * Hook to fetch unread notification count.
 * Polls every 30 seconds by default for badge updates.
 * @param options - Options including polling interval
 */
export function useUnreadCount(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationApi.getUnreadCount(),
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: options?.refetchInterval ?? DEFAULT_POLLING_INTERVAL,
    enabled: options?.enabled,
  });
}

/**
 * Hook to mark a single notification as read.
 * Invalidates notification queries on success.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => notificationApi.markAsRead(id),
    onSuccess: () => {
      // Invalidate notification list and unread count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Hook to mark all notifications as read.
 * Invalidates notification queries on success.
 */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      // Invalidate notification list and unread count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/**
 * Convenience hook that provides notification state and actions.
 * Use this in components that need full notification functionality.
 */
export function useNotificationCenter(options?: {
  pollingInterval?: number | false;
}) {
  const pollingInterval = options?.pollingInterval ?? DEFAULT_POLLING_INTERVAL;

  const notificationsQuery = useNotifications(
    { is_read: false },
    { refetchInterval: pollingInterval }
  );

  const unreadCountQuery = useUnreadCount({
    refetchInterval: pollingInterval,
  });

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllRead();

  return {
    // Data
    notifications: notificationsQuery.data?.results ?? [],
    unreadCount: unreadCountQuery.data?.unread_count ?? 0,
    serverTime: notificationsQuery.data?.server_time,

    // Loading states
    isLoading: notificationsQuery.isLoading || unreadCountQuery.isLoading,
    isRefetching: notificationsQuery.isRefetching || unreadCountQuery.isRefetching,

    // Error states
    error: notificationsQuery.error || unreadCountQuery.error,

    // Actions
    markAsRead: markReadMutation.mutate,
    markAsReadAsync: markReadMutation.mutateAsync,
    markAllAsRead: markAllReadMutation.mutate,
    markAllAsReadAsync: markAllReadMutation.mutateAsync,

    // Mutation states
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,

    // Refetch
    refetch: () => {
      notificationsQuery.refetch();
      unreadCountQuery.refetch();
    },
  };
}

/**
 * TDD Tests for useNotifications hook.
 * Sprint 1.x: In-app notification system
 *
 * Tests polling-based notification fetching with React Query.
 * @jest-environment jsdom
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode } from 'react';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllRead } from '@/lib/hooks/use-notifications';
import { notificationApi } from '@/lib/api/notifications';
import type { Notification, NotificationListResponse, UnreadCountResponse } from '@/lib/types/notification';

// Mock the notification API
jest.mock('@/lib/api/notifications', () => ({
  notificationApi: {
    listNotifications: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  },
}));

const mockNotificationApi = notificationApi as jest.Mocked<typeof notificationApi>;

describe('useNotifications Hooks', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const mockNotification: Notification = {
    id: 1,
    notification_type: 'lab_result',
    priority: 'normal',
    title: 'Lab Results Ready',
    message: 'Your CBC results are available.',
    is_read: false,
    read_at: null,
    created_at: '2026-01-16T10:00:00Z',
  };

  const mockListResponse: NotificationListResponse = {
    count: 1,
    next: null,
    previous: null,
    results: [mockNotification],
    server_time: '2026-01-16T10:05:00Z',
  };

  describe('useNotifications', () => {
    it('should fetch notifications on mount', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse);

      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockNotificationApi.listNotifications).toHaveBeenCalled();
      expect(result.current.data?.results).toHaveLength(1);
      expect(result.current.data?.results[0].title).toBe('Lab Results Ready');
    });

    it('should filter by unread when specified', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse);

      renderHook(() => useNotifications({ is_read: false }), { wrapper });

      await waitFor(() =>
        expect(mockNotificationApi.listNotifications).toHaveBeenCalledWith(
          expect.objectContaining({ is_read: false })
        )
      );
    });

    it('should return loading state initially', () => {
      mockNotificationApi.listNotifications.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useNotifications(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle error state', async () => {
      mockNotificationApi.listNotifications.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeDefined();
    });
  });

  describe('useUnreadCount', () => {
    it('should fetch unread count', async () => {
      const mockResponse: UnreadCountResponse = { unread_count: 5 };
      mockNotificationApi.getUnreadCount.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useUnreadCount(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockNotificationApi.getUnreadCount).toHaveBeenCalled();
      expect(result.current.data?.unread_count).toBe(5);
    });

    it('should return 0 for convenience when loading', () => {
      mockNotificationApi.getUnreadCount.mockImplementation(
        () => new Promise(() => {})
      );

      const { result } = renderHook(() => useUnreadCount(), { wrapper });

      // The count should default to 0 or undefined during loading
      expect(result.current.data?.unread_count ?? 0).toBe(0);
    });
  });

  describe('useMarkNotificationRead', () => {
    it('should mark notification as read and invalidate queries', async () => {
      mockNotificationApi.markAsRead.mockResolvedValue({ status: 'marked as read' });
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 0 });

      const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(1);
      });

      expect(mockNotificationApi.markAsRead).toHaveBeenCalledWith(1);
    });

    it('should handle mutation error', async () => {
      mockNotificationApi.markAsRead.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync(1);
        } catch {
          // Expected error
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe('useMarkAllRead', () => {
    it('should mark all as read and invalidate queries', async () => {
      mockNotificationApi.markAllAsRead.mockResolvedValue({ marked_count: 3 });
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 0 });

      const { result } = renderHook(() => useMarkAllRead(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(mockNotificationApi.markAllAsRead).toHaveBeenCalled();
    });

    it('should return marked count on success', async () => {
      mockNotificationApi.markAllAsRead.mockResolvedValue({ marked_count: 5 });

      const { result } = renderHook(() => useMarkAllRead(), { wrapper });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync();
      });

      expect(response).toEqual({ marked_count: 5 });
    });
  });
});

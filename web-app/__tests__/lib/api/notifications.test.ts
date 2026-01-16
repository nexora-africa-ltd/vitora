/**
 * TDD Tests for Notification API client.
 * Sprint 1.x: In-app notification system
 *
 * RED phase: Write tests before implementation.
 */

import { notificationApi } from '@/lib/api/notifications';
import { apiClient } from '@/lib/api/client';
import type { Notification, NotificationListResponse, UnreadCountResponse } from '@/lib/types/notification';

// Mock the API client
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Notification API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockNotification: Notification = {
    id: 1,
    notification_type: 'lab_result',
    priority: 'normal',
    title: 'Lab Results Ready',
    message: 'Your CBC results are available.',
    related_model: 'LabOrder',
    related_id: 123,
    action_url: '/laboratory/orders/123',
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

  describe('listNotifications', () => {
    it('should fetch notifications list', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockListResponse });

      const result = await notificationApi.listNotifications();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/notifications/', {
        params: undefined,
      });
      expect(result).toEqual(mockListResponse);
    });

    it('should fetch with filter params', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockListResponse });

      await notificationApi.listNotifications({
        is_read: false,
        notification_type: 'lab_result',
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/notifications/', {
        params: { is_read: false, notification_type: 'lab_result' },
      });
    });

    it('should support polling with created_after param', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockListResponse });
      const timestamp = '2026-01-16T09:00:00Z';

      await notificationApi.listNotifications({ created_after: timestamp });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/notifications/', {
        params: { created_after: timestamp },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should fetch unread count', async () => {
      const mockResponse: UnreadCountResponse = { unread_count: 5 };
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await notificationApi.getUnreadCount();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/notifications/unread_count/');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('markAsRead', () => {
    it('should mark single notification as read', async () => {
      mockApiClient.post.mockResolvedValue({ data: { status: 'marked as read' } });

      const result = await notificationApi.markAsRead(1);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/notifications/1/mark_read/');
      expect(result).toEqual({ status: 'marked as read' });
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockApiClient.post.mockResolvedValue({ data: { marked_count: 3 } });

      const result = await notificationApi.markAllAsRead();

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/notifications/mark_all_read/');
      expect(result).toEqual({ marked_count: 3 });
    });
  });
});

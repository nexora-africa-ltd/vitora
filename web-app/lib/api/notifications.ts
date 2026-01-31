/**
 * Notification API client.
 * Sprint 1.x: In-app notification system
 *
 * Provides methods to interact with the notification REST API:
 * - List notifications (with filters)
 * - Get unread count (for badge)
 * - Mark as read (single or all)
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  NotificationSchema,
  NotificationListResponseSchema,
  UnreadCountResponseSchema,
  MarkReadResponseSchema,
  MarkAllReadResponseSchema,
} from '@/lib/schemas/core.schema';
import type {
  Notification,
  NotificationListResponse,
  NotificationListParams,
  UnreadCountResponse,
  MarkReadResponse,
  MarkAllReadResponse,
} from '@/lib/types/notification';

export const notificationApi = {
  /**
   * Get paginated list of notifications for the current user.
   * Supports filtering by type, read status, and created_after (for polling).
   */
  async listNotifications(params?: NotificationListParams): Promise<NotificationListResponse> {
    const response = await apiClient.get<NotificationListResponse>('/api/notifications/', {
      params,
    });
    return parseResponse(NotificationListResponseSchema, response.data, { context: 'notificationApi.listNotifications' });
  },

  /**
   * Get the count of unread notifications.
   * Used for the badge in the header.
   */
  async getUnreadCount(): Promise<UnreadCountResponse> {
    const response = await apiClient.get<UnreadCountResponse>('/api/notifications/unread_count/');
    return parseResponse(UnreadCountResponseSchema, response.data, { context: 'notificationApi.getUnreadCount' });
  },

  /**
   * Mark a single notification as read.
   * @param id - The notification ID
   */
  async markAsRead(id: number): Promise<MarkReadResponse> {
    const response = await apiClient.post<MarkReadResponse>(`/api/notifications/${id}/mark_read/`);
    return parseResponse(MarkReadResponseSchema, response.data, { context: 'notificationApi.markAsRead' });
  },

  /**
   * Mark all unread notifications as read.
   * Returns the count of notifications that were marked.
   */
  async markAllAsRead(): Promise<MarkAllReadResponse> {
    const response = await apiClient.post<MarkAllReadResponse>('/api/notifications/mark_all_read/');
    return parseResponse(MarkAllReadResponseSchema, response.data, { context: 'notificationApi.markAllAsRead' });
  },

  /**
   * Get a single notification by ID.
   * @param id - The notification ID
   */
  async getNotification(id: number): Promise<Notification> {
    const response = await apiClient.get<Notification>(`/api/notifications/${id}/`);
    return parseResponse(NotificationSchema, response.data, { context: 'notificationApi.getNotification' });
  },
};

export default notificationApi;

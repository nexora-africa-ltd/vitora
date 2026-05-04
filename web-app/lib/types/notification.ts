/**
 * Notification types for the frontend.
 * Sprint 1.x: In-app notification system
 */

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationType =
  | 'lab_result'
  | 'appointment'
  | 'prescription'
  | 'low_stock'
  | 'critical_vital'
  | 'system'
  | string;

export interface Notification {
  id: number;
  notification_type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  related_model?: string | null;
  related_id?: number | null;
  action_url?: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Notification[];
  server_time: string;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface MarkReadResponse {
  status: string;
}

export interface MarkAllReadResponse {
  marked_count: number;
}

export interface NotificationListParams {
  notification_type?: NotificationType;
  priority?: NotificationPriority;
  is_read?: boolean;
  created_after?: string;
  page?: number;
  page_size?: number;
}

/**
 * TDD Tests for NotificationPanel component.
 * Sprint 1.x: In-app notification system
 *
 * Tests the notification dropdown panel in the header.
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { notificationApi } from '@/lib/api/notifications';
import type { Notification, NotificationListResponse } from '@/lib/types/notification';

// Mock the notification API
jest.mock('@/lib/api/notifications', () => ({
  notificationApi: {
    listNotifications: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  },
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock the ScrollArea to avoid Radix React 19 issues
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'scroll-area' }, children),
}));

// Import after mocks
import { NotificationPanel } from '@/components/notifications/notification-panel';

const mockNotificationApi = notificationApi as jest.Mocked<typeof notificationApi>;

describe('NotificationPanel Component', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

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

  const createMockNotification = (overrides: Partial<Notification> = {}): Notification => ({
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
    ...overrides,
  });

  const mockListResponse = (
    notifications: Notification[] = [createMockNotification()]
  ): NotificationListResponse => ({
    count: notifications.length,
    next: null,
    previous: null,
    results: notifications,
    server_time: '2026-01-16T10:05:00Z',
  });

  describe('Rendering', () => {
    it('should render the notification bell icon', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse([]));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 0 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    });

    it('should show unread count badge when there are unread notifications', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse());
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 5 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('should hide badge when unread count is 0', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse([]));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 0 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
      });
    });
  });

  describe('Dropdown Behavior', () => {
    it('should open dropdown when bell icon is clicked', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse());
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 1 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await userEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
    });

    it('should display notification list when opened', async () => {
      const notifications = [
        createMockNotification({ id: 1, title: 'Lab Results Ready' }),
        createMockNotification({ id: 2, title: 'Appointment Reminder', notification_type: 'appointment' }),
      ];
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse(notifications));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 2 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        expect(screen.getByText('Lab Results Ready')).toBeInTheDocument();
        expect(screen.getByText('Appointment Reminder')).toBeInTheDocument();
      });
    });

    it('should show empty state when no notifications', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse([]));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 0 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
        expect(screen.getByText(/no new notifications/i)).toBeInTheDocument();
      });
    });
  });

  describe('Mark as Read', () => {
    it('should mark notification as read when clicked', async () => {
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse());
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 1 });
      mockNotificationApi.markAsRead.mockResolvedValue({ status: 'marked as read' });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        expect(screen.getByText('Lab Results Ready')).toBeInTheDocument();
      });

      // Click the notification item (or mark read button)
      const notificationItem = screen.getByText('Lab Results Ready').closest('[data-testid="notification-item"]');
      if (notificationItem) {
        await userEvent.click(notificationItem);
      }

      await waitFor(() => {
        expect(mockNotificationApi.markAsRead).toHaveBeenCalledWith(1);
      });
    });

    it('should have mark all as read button', async () => {
      const notifications = [
        createMockNotification({ id: 1 }),
        createMockNotification({ id: 2 }),
      ];
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse(notifications));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 2 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark all as read/i })).toBeInTheDocument();
      });
    });

    it('should call markAllAsRead when mark all button is clicked', async () => {
      const notifications = [
        createMockNotification({ id: 1 }),
        createMockNotification({ id: 2 }),
      ];
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse(notifications));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 2 });
      mockNotificationApi.markAllAsRead.mockResolvedValue({ marked_count: 2 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark all as read/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }));

      await waitFor(() => {
        expect(mockNotificationApi.markAllAsRead).toHaveBeenCalled();
      });
    });
  });

  describe('Priority Styling', () => {
    it('should highlight critical priority notifications', async () => {
      const criticalNotification = createMockNotification({
        priority: 'critical',
        title: 'Critical Alert',
      });
      mockNotificationApi.listNotifications.mockResolvedValue(mockListResponse([criticalNotification]));
      mockNotificationApi.getUnreadCount.mockResolvedValue({ unread_count: 1 });

      render(<NotificationPanel />, { wrapper: Wrapper });

      await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        const notificationItem = screen.getByText('Critical Alert').closest('[data-testid="notification-item"]');
        expect(notificationItem).toHaveAttribute('data-priority', 'critical');
      });
    });
  });
});

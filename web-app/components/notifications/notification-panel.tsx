/**
 * NotificationPanel Component
 * Sprint 1.x: In-app notification system
 *
 * Dropdown panel showing user notifications in the header.
 * Features:
 * - Bell icon with unread badge
 * - Dropdown list of recent notifications
 * - Mark as read (individual and all)
 * - Priority-based styling
 * - Click to navigate to related resource
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/lib/hooks/use-notifications';
import type { Notification, NotificationPriority } from '@/lib/types/notification';

/** Get icon color based on notification type */
function getNotificationIcon(type: string): string {
  switch (type) {
    case 'lab_result':
      return 'text-blue-500';
    case 'appointment':
      return 'text-green-500';
    case 'prescription':
      return 'text-purple-500';
    case 'low_stock':
      return 'text-amber-500';
    case 'critical_vital':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

/** Get border color based on priority */
function getPriorityStyles(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return 'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20';
    case 'high':
      return 'border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20';
    case 'normal':
      return '';
    case 'low':
      return 'opacity-75';
    default:
      return '';
  }
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onClick: () => void;
}

function NotificationItem({ notification, onMarkRead, onClick }: NotificationItemProps) {
  const priorityStyles = getPriorityStyles(notification.priority);
  const iconColor = getNotificationIcon(notification.notification_type);

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkRead(notification.id);
    }
    onClick();
  };

  return (
    <div
      data-testid="notification-item"
      data-priority={notification.priority}
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer transition-colors',
        'hover:bg-muted/50',
        priorityStyles,
        notification.is_read && 'opacity-60'
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className={cn('mt-0.5', iconColor)}>
        <Bell className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium truncate',
          !notification.is_read && 'font-semibold'
        )}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
      {!notification.is_read && (
        <div className="w-2 h-2 rounded-full bg-primary mt-2" />
      )}
    </div>
  );
}

export function NotificationPanel() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // Queries
  const { data: notificationsData, isLoading: isLoadingNotifications } = useNotifications(
    undefined,
    { enabled: isOpen, refetchInterval: false }
  );
  const { data: unreadCountData } = useUnreadCount();

  // Mutations
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllRead();

  const notifications = notificationsData?.results ?? [];
  const unreadCount = unreadCountData?.unread_count ?? 0;

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.action_url) {
      router.push(notification.action_url);
      setIsOpen(false);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              data-testid="unread-badge"
              className={cn(
                'absolute -top-1 -right-1 flex items-center justify-center',
                'min-w-[18px] h-[18px] px-1 rounded-full',
                'bg-destructive text-destructive-foreground',
                'text-[10px] font-medium'
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs"
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
              aria-label="Mark all as read"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" />
              )}
              Mark all as read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[300px]">
          {isLoadingNotifications ? (
            <div
              data-testid="notification-loading"
              className="flex items-center justify-center py-8"
              role="status"
            >
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
              <p className="text-xs text-muted-foreground">
                You&apos;re all caught up!
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onClick={() => handleNotificationClick(notification)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full justify-center text-xs"
                onClick={() => {
                  router.push('/notifications');
                  setIsOpen(false);
                }}
              >
                View all notifications
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationPanel;

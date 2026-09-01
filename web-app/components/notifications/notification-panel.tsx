/**
 * NotificationPanel Component
 * Sprint 1.x: In-app notification system
 *
 * Popover panel showing user notifications in the header.
 * Features:
 * - Bell icon with unread badge
 * - Popover list of recent notifications
 * - Mark as read (individual and all)
 * - Priority-based styling
 * - Click to navigate to related resource
 * - "View all" opens full-screen notification center
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  Loader2,
  X,
  AlertTriangle,
  FlaskConical,
  Calendar,
  Pill,
  Activity,
  Info,
  CreditCard,
  Shield,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
  useExpandableScreen,
} from '@/components/ui/expandable-screen';
import { cn } from '@/lib/utils';
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/lib/hooks/use-notifications';
import { useNotificationSocket } from '@/lib/hooks/use-websocket';
import type { Notification, NotificationPriority } from '@/lib/types/notification';
import { PushNotificationToggle } from './push-notification-toggle';

/** Get icon component based on notification type */
function getNotificationIconComponent(type: string) {
  switch (type) {
    case 'lab_result':
      return FlaskConical;
    case 'appointment':
      return Calendar;
    case 'prescription':
      return Pill;
    case 'low_stock':
      return AlertTriangle;
    case 'critical_vital':
      return Activity;
    case 'billing':
    case 'invoice_overdue':
    case 'payment_received':
      return CreditCard;
    case 'sha_claim':
    case 'sha_claim_approved':
    case 'sha_claim_rejected':
    case 'sha_claim_paid':
      return Shield;
    default:
      return Info;
  }
}

/** Get icon color based on notification type */
function getNotificationIconColor(type: string): string {
  switch (type) {
    case 'lab_result':
      return 'text-blue-500';
    case 'appointment':
      return 'text-green-500';
    case 'billing':
    case 'invoice_overdue':
    case 'payment_received':
      return 'text-emerald-500';
    case 'sha_claim':
    case 'sha_claim_approved':
    case 'sha_claim_paid':
      return 'text-blue-600';
    case 'sha_claim_rejected':
      return 'text-red-500';
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

function getPriorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-500';
    case 'high':
      return 'bg-amber-500';
    case 'normal':
      return 'bg-cyan-500';
    case 'low':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onClick: () => void;
}

/** Compact notification item for popover */
function NotificationItem({ notification, onMarkRead, onClick }: NotificationItemProps) {
  const priorityStyles = getPriorityStyles(notification.priority);
  const iconColor = getNotificationIconColor(notification.notification_type);

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
        'flex cursor-pointer items-start gap-3 p-3 transition-colors',
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
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', !notification.is_read && 'font-semibold')}>
          {notification.title}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
      {!notification.is_read && (
        <div className="mt-2 h-2 w-2 scale-110 animate-pulse rounded-full bg-cyan-500 transition" />
      )}
    </div>
  );
}

/** Full notification item for expanded view */
function ExpandedNotificationItem({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onNavigate: (url: string) => void;
}) {
  const Icon = getNotificationIconComponent(notification.notification_type);

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-start gap-4 rounded-xl p-4 transition-all duration-200',
        'border border-white/10 hover:bg-white/10',
        notification.is_read && 'opacity-60'
      )}
      onClick={() => {
        if (!notification.is_read) onMarkRead(notification.id);
        if (notification.action_url) onNavigate(notification.action_url);
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          notification.is_read ? 'bg-background/10' : getPriorityColor(notification.priority)
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5',
            notification.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground'
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                'truncate font-medium text-muted-foreground',
                !notification.is_read && 'font-semibold'
              )}
            >
              {notification.title}
            </p>
            <p className="line-clamp-2 text-sm text-muted-foreground/70">{notification.message}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!notification.is_read && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            )}
            <Badge
              variant="outline"
              className="border-background/20 bg-background/10 text-[10px] text-muted-foreground/80"
            >
              {notification.priority}
            </Badge>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground/50">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export function NotificationPanel() {
  const router = useRouter();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Real-time WebSocket — invalidates queries on new notifications
  useNotificationSocket();

  // Queries - enable when either popover or expanded view is open
  const { data: notificationsData, isLoading: isLoadingNotifications } = useNotifications(
    undefined,
    { enabled: isPopoverOpen || isExpanded, refetchInterval: false }
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
      setIsPopoverOpen(false);
      setIsExpanded(false);
    }
  };

  const handleNavigate = (url: string) => {
    router.push(url);
    setIsPopoverOpen(false);
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const readNotifications = notifications.filter((n) => n.is_read);

  function ExpandedCenter() {
    const { collapse } = useExpandableScreen();

    return (
      <div className="h-full w-full overflow-hidden rounded-3xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-300 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <Bell className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-accent">Notifications</h2>
              <p className="text-sm text-accent/70">
                {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up!"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-foreground hover:bg-secondary/10 hover:text-accent"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="mr-2 h-4 w-4" />
                )}
                Mark all
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-foreground hover:bg-white/10 hover:text-primary"
              onClick={() => {
                collapse();
                setIsExpanded(false);
              }}
              aria-label="Close notifications"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="border-b border-cyan-300/60 bg-muted/30 px-6 py-3">
          <PushNotificationToggle />
        </div>

        {/* Scrollable Content */}
        <ScrollArea className="h-[calc(100%-148px)]">
          <div className="space-y-6 p-4">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
                  <Bell className="h-12 w-12 text-muted-foreground/50" />
                </div>
                <p className="text-xl font-medium text-muted-foreground">No notifications</p>
                <p className="mt-1 text-muted-foreground/60">Check back later for updates</p>
              </div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      Unread ({unreadNotifications.length})
                    </h3>
                    <div className="space-y-2">
                      {unreadNotifications.map((notification) => (
                        <ExpandedNotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onNavigate={(url) => {
                            handleNavigate(url);
                            collapse();
                            setIsExpanded(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {readNotifications.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Earlier
                    </h3>
                    <div className="space-y-2">
                      {readNotifications.map((notification) => (
                        <ExpandedNotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onNavigate={(url) => {
                            handleNavigate(url);
                            collapse();
                            setIsExpanded(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <ExpandableScreen
      layoutId="notifications-center"
      triggerRadius="16px"
      contentRadius="24px"
      onExpandChange={(expanded) => {
        setIsExpanded(expanded);
        if (expanded) setIsPopoverOpen(false);
      }}
    >
      {/* Bell Icon with Popover */}
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                data-testid="unread-badge"
                className={cn(
                  'absolute -right-1 -top-1 flex items-center justify-center',
                  'h-4 min-w-4 rounded-full px-1',
                  'bg-cyan-500 text-white',
                  'animate-pulse text-[10px] font-medium leading-none'
                )}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600">
                <Bell className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
                aria-label="Mark all as read"
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="mr-1 h-3 w-3" />
                )}
                Mark all read
              </Button>
            )}
          </div>

          {/* Push Toggle */}
          <div className="border-b px-4 py-2">
            <PushNotificationToggle />
          </div>

          {/* Notification List */}
          <ScrollArea className="h-[320px]">
            {isLoadingNotifications ? (
              <div
                data-testid="notification-loading"
                className="flex items-center justify-center py-12"
                role="status"
              >
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                  <Bell className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground">No new notifications</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.slice(0, 5).map((notification) => (
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

          {/* View All Button */}
          {notifications.length > 0 && (
            <div className="border-t bg-muted/30 p-3">
              <ExpandableScreenTrigger
                className="w-full"
                backgroundClassName="rounded-md bg-gradient-to-r from-cyan-500/10 to-cyan-400/10 border border-cyan-500/20"
              >
                <Button
                  variant="outline"
                  className="w-full justify-center border-transparent bg-transparent text-sm hover:border-cyan-500/30 hover:bg-cyan-500/20"
                  onClick={() => setIsPopoverOpen(false)}
                >
                  <Bell className="mr-2 h-4 w-4" />
                  View all notifications
                </Button>
              </ExpandableScreenTrigger>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ExpandableScreenContent
        showCloseButton={false}
        closeOnBackdropClick
        overlayClassName="items-start justify-end p-3 sm:p-4 pt-16 z-[60]"
        className="h-[calc(100vh-5rem)] w-full sm:w-[480px]"
      >
        <ExpandedCenter />
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export default NotificationPanel;

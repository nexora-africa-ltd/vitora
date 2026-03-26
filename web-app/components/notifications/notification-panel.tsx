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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import type { Notification, NotificationPriority } from '@/lib/types/notification';

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
        <p className={cn('text-sm font-medium truncate', !notification.is_read && 'font-semibold')}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
      {!notification.is_read && (
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse transition scale-110 mt-2" />
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
        'group flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200',
        'hover:bg-white/10 border border-white/10',
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
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
          notification.is_read ? 'bg-background/10' : getPriorityColor(notification.priority)
        )}
      >
        <Icon className={cn('h-5 w-5', notification.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn('font-medium text-muted-foreground truncate', !notification.is_read && 'font-semibold')}>
              {notification.title}
            </p>
            <p className="text-sm text-muted-foreground/70 line-clamp-2">{notification.message}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!notification.is_read && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
            <Badge
              variant="outline"
              className="bg-background/10 border-background/20 text-muted-foreground/80 text-[10px]"
            >
              {notification.priority}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/50 mt-2">
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
        <div className="flex items-center justify-between p-6 border-b border-cyan-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Bell className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-accent">Notifications</h2>
              <p className="text-accent/70 text-sm">
                {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up!"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-foreground hover:text-accent hover:bg-secondary/10"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4 mr-2" />
                )}
                Mark all
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground hover:text-primary hover:bg-white/10 rounded-full"
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

        {/* Scrollable Content */}
        <ScrollArea className="h-[calc(100%-88px)]">
          <div className="p-4 space-y-6">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-4">
                  <Bell className="h-12 w-12 text-muted-foreground/50" />
                </div>
                <p className="text-xl font-medium text-muted-foreground">No notifications</p>
                <p className="text-muted-foreground/60 mt-1">Check back later for updates</p>
              </div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
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
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
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
                  'bg-cyan-500 text-white',
                  'text-[10px] font-medium animate-pulse'
                )}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
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
                Mark all read
              </Button>
            )}
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
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
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
            <div className="p-3 border-t bg-muted/30">
              <ExpandableScreenTrigger
                className="w-full"
                backgroundClassName="rounded-md bg-gradient-to-r from-cyan-500/10 to-cyan-400/10 border border-cyan-500/20"
              >
                <Button
                  variant="outline"
                  className="w-full justify-center text-sm bg-transparent border-transparent hover:bg-cyan-500/20 hover:border-cyan-500/30"
                  onClick={() => setIsPopoverOpen(false)}
                >
                  <Bell className="h-4 w-4 mr-2" />
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
        overlayClassName="items-start justify-end p-3 sm:p-4 pt-16"
        className="h-[calc(100vh-5rem)] w-full sm:w-[480px]"
      >
        <ExpandedCenter />
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export default NotificationPanel;

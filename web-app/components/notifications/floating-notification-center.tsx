/**
 * Floating Notification Center
 *
 * A floating expandable notification panel that:
 * - Shows a bell icon with unread count badge
 * - Expands into a full-screen notification center
 * - Uses the ExpandableScreen component for smooth animations
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Loader2,
  X,
  AlertTriangle,
  FlaskConical,
  Calendar,
  Pill,
  Activity,
  Info,
  Filter,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from '@/components/ui/expandable-screen';
import { cn } from '@/lib/utils';
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/lib/hooks/use-notifications';
import { PushNotificationToggle } from './push-notification-toggle';
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

/** Get priority color */
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

/** Get priority badge variant */
function getPriorityBadgeVariant(
  priority: NotificationPriority
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (priority) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'default';
    case 'normal':
      return 'secondary';
    case 'low':
      return 'outline';
    default:
      return 'secondary';
  }
}

/** Notification Item in expanded view */
function NotificationItem({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onNavigate: (notification: Notification) => void;
}) {
  const Icon = getNotificationIconComponent(notification.notification_type);
  const iconColor = getNotificationIconColor(notification.notification_type);

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-start gap-4 rounded-xl p-4 transition-all duration-200',
        'border border-white/10 hover:bg-white/10',
        notification.is_read && 'opacity-60'
      )}
      onClick={() => onNavigate(notification)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(notification)}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          notification.is_read ? 'bg-white/10' : getPriorityColor(notification.priority)
        )}
      >
        <Icon className={cn('h-5 w-5', notification.is_read ? 'text-white/70' : 'text-white')} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                'truncate font-medium text-white',
                !notification.is_read && 'font-semibold'
              )}
            >
              {notification.title}
            </p>
            <p className="line-clamp-2 text-sm text-white/70">{notification.message}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!notification.is_read && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={getPriorityBadgeVariant(notification.priority)} className="text-[10px]">
            {notification.priority}
          </Badge>
          <span className="text-xs text-white/50">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>
      {!notification.is_read && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/70 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(notification.id);
          }}
          title="Mark as read"
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function FloatingNotificationCenter() {
  const router = useRouter();
  const [priorityFilter, setPriorityFilter] = useState<NotificationPriority | ''>('');

  const { data: notifications, isLoading } = useNotifications({
    priority: priorityFilter || undefined,
  });
  const { data: unreadCount } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  const handleMarkRead = (id: number) => {
    markRead.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const handleNavigate = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const unreadNotifications = notifications?.results?.filter((n) => !n.is_read) || [];
  const readNotifications = notifications?.results?.filter((n) => n.is_read) || [];
  const totalUnread = unreadCount?.unread_count ?? 0;

  return (
    <ExpandableScreen
      layoutId="notification-center"
      triggerRadius="24px"
      contentRadius="24px"
      animationDuration={0.4}
    >
      {/* Floating Bell Button Trigger */}
      <ExpandableScreenTrigger>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {totalUnread > 0 && (
            <span
              className={cn(
                'absolute -right-1 -top-1 flex items-center justify-center',
                'h-4 min-w-4 rounded-full px-1',
                'bg-destructive text-destructive-foreground',
                'text-[10px] font-medium leading-none'
              )}
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </Button>
      </ExpandableScreenTrigger>

      {/* Expanded Full-Screen Notification Center */}
      <ExpandableScreenContent
        className="bg-gradient-to-br from-cyan-600 via-cyan-700 to-cyan-800 dark:from-cyan-800 dark:via-cyan-900 dark:to-slate-900"
        showCloseButton
        closeButtonClassName="text-white/70 hover:text-white hover:bg-white/10"
      >
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-6 sm:p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <Bell className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Notifications</h2>
                  <p className="text-sm text-white/70">
                    {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up!'}
                  </p>
                </div>
              </div>
              {totalUnread > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                  className="border-0 bg-white/20 text-white hover:bg-white/30"
                >
                  {markAllRead.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="mr-2 h-4 w-4" />
                  )}
                  Mark All Read
                </Button>
              )}
            </div>

            {/* Filter & Push Toggle */}
            <div className="flex items-center gap-3">
              <Select
                value={priorityFilter}
                onValueChange={(v) => setPriorityFilter(v as NotificationPriority | '')}
              >
                <SelectTrigger className="w-[160px] border-white/20 bg-white/10 text-white">
                  <Filter className="mr-2 h-4 w-4 text-white/70" />
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Priorities</SelectItem>
                  <SelectItem value="critical">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Critical
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      High
                    </span>
                  </SelectItem>
                  <SelectItem value="normal">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-500" />
                      Normal
                    </span>
                  </SelectItem>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gray-400" />
                      Low
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <PushNotificationToggle className="border-white/20 bg-white/10 text-white hover:bg-white/20" />
            </div>
          </div>

          {/* Notifications List */}
          <ScrollArea className="-mx-2 flex-1 px-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-white/50" />
              </div>
            ) : notifications?.results?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
                  <Bell className="h-10 w-10 text-white/30" />
                </div>
                <p className="text-xl font-medium text-white">All caught up!</p>
                <p className="mt-1 text-sm text-white/60">No notifications to display</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Unread Section */}
                {unreadNotifications.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                      Unread ({unreadNotifications.length})
                    </h3>
                    <div className="space-y-2">
                      {unreadNotifications.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Read Section */}
                {readNotifications.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
                      Earlier
                    </h3>
                    <div className="space-y-2">
                      {readNotifications.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Footer hint */}
          <div className="mt-4 border-t border-white/10 pt-4 text-center">
            <p className="text-xs text-white/40">Click outside or press ESC to close</p>
          </div>
        </div>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export default FloatingNotificationCenter;

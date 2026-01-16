/**
 * Notifications Page
 * Full page view for all notifications
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Filter, Loader2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

function getPriorityBadgeVariant(priority: NotificationPriority): 'default' | 'secondary' | 'destructive' | 'outline' {
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

export default function NotificationsPage() {
  const router = useRouter();
  const [priorityFilter, setPriorityFilter] = useState<NotificationPriority | ''>('');
  const [readFilter, setReadFilter] = useState<string>('');

  const { data: notifications, isLoading, error } = useNotifications({
    priority: priorityFilter || undefined,
    is_read: readFilter === '' ? undefined : readFilter === 'read',
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

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unreadCount?.unread_count ?? 0} unread notifications`}
        actions={
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending || (unreadCount?.unread_count ?? 0) === 0}
          >
            {markAllRead.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-2" />
            )}
            Mark All Read
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as NotificationPriority | '')}>
              <SelectTrigger className="w-[180px]" aria-label="Priority">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={readFilter} onValueChange={setReadFilter}>
              <SelectTrigger className="w-[150px]" aria-label="Read status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            All Notifications
            {notifications?.results && (
              <Badge variant="secondary" className="ml-2">
                {notifications.results.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Failed to load notifications. Please try again.
            </div>
          ) : notifications?.results?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm">You&apos;re all caught up!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications?.results?.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-colors',
                    'hover:bg-muted/50 border',
                    getPriorityStyles(notification.priority),
                    notification.is_read && 'opacity-60'
                  )}
                  onClick={() => handleNotificationClick(notification)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(notification)}
                >
                  <div className={cn('mt-1', getNotificationIcon(notification.notification_type))}>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn('font-medium', !notification.is_read && 'font-semibold')}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={getPriorityBadgeVariant(notification.priority)}>
                          {notification.priority}
                        </Badge>
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkRead(notification.id);
                            }}
                            title="Mark as read"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

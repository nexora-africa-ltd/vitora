'use client';

import Link from 'next/link';
import {
  User,
  Stethoscope,
  TestTube2,
  Pill,
  CreditCard,
  LucideIcon,
  Activity,
  Calendar,
  Package,
  Shield,
  Settings,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { RecentActivity as RecentActivityType, ActivityType } from '@/lib/types/dashboard';

interface RecentActivityProps {
  activities: RecentActivityType[];
  maxHeight?: string;
}

const activityConfig: Record<ActivityType, { icon: LucideIcon; color: string; bgColor: string }> = {
  patient: {
    icon: User,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  encounter: {
    icon: Stethoscope,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  lab: {
    icon: TestTube2,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  pharmacy: {
    icon: Pill,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  billing: {
    icon: CreditCard,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
  },
  triage: {
    icon: Activity,
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  appointment: {
    icon: Calendar,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  inventory: {
    icon: Package,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  user: {
    icon: Shield,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100 dark:bg-slate-900/30',
  },
  system: {
    icon: Settings,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
  },
};

// Helper to get the href from activity (supports both old and new formats)
function getActivityHref(activity: RecentActivityType): string | undefined {
  // New format: resource.href
  if (activity.resource?.href) {
    return activity.resource.href;
  }
  // Legacy format: top-level href
  return activity.href;
}

// Helper to get user display name
function getUserDisplayName(activity: RecentActivityType): string | undefined {
  if (!activity.user) return undefined;
  // New format: user object with name
  if (typeof activity.user === 'object' && activity.user.name) {
    return activity.user.name;
  }
  // Legacy format: string
  if (typeof activity.user === 'string') {
    return activity.user;
  }
  return undefined;
}

export function RecentActivity({ activities, maxHeight = '300px' }: RecentActivityProps) {
  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">No recent activity</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ maxHeight }} className="px-6 pb-4">
          <div className="space-y-4">
            {activities.map((activity) => {
              const config = activityConfig[activity.type] ?? activityConfig.system;
              const Icon = config.icon;
              const href = getActivityHref(activity);
              const userName = getUserDisplayName(activity);

              const content = (
                <>
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      config.bgColor
                    )}
                  >
                    <Icon className={cn('h-4 w-4', config.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{activity.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{activity.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <time dateTime={activity.timestamp} className="text-xs text-muted-foreground">
                        {formatRelativeTime(activity.timestamp)}
                      </time>
                      {userName && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">{userName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </>
              );

              if (href) {
                return (
                  <Link
                    key={activity.id}
                    href={href}
                    className="-mx-2 flex cursor-pointer gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div key={activity.id} className="-mx-2 flex gap-3 rounded-lg p-2">
                  {content}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default RecentActivity;

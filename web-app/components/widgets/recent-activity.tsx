'use client';

import Link from 'next/link';
import {
  User,
  Stethoscope,
  TestTube2,
  Pill,
  CreditCard,
  LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { RecentActivity as RecentActivityType } from '@/lib/types/dashboard';

interface RecentActivityProps {
  activities: RecentActivityType[];
  maxHeight?: string;
}

const activityConfig: Record<
  RecentActivityType['type'],
  { icon: LucideIcon; color: string; bgColor: string }
> = {
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
};

export function RecentActivity({ activities, maxHeight = '300px' }: RecentActivityProps) {
  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No recent activity
          </div>
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
              const config = activityConfig[activity.type];
              const Icon = config.icon;

              const content = (
                <>
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                      config.bgColor
                    )}
                  >
                    <Icon className={cn('h-4 w-4', config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <time
                        dateTime={activity.timestamp}
                        className="text-xs text-muted-foreground"
                      >
                        {formatRelativeTime(activity.timestamp)}
                      </time>
                      {activity.user && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {activity.user}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </>
              );

              if (activity.href) {
                return (
                  <Link
                    key={activity.id}
                    href={activity.href}
                    className="flex gap-3 rounded-lg p-2 -mx-2 hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div
                  key={activity.id}
                  className="flex gap-3 rounded-lg p-2 -mx-2"
                >
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

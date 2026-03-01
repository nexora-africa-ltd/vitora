import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendIndicator } from '@/components/charts';
import { cn } from '@/lib/utils/cn';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: ReactNode;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'warning' | 'success' | 'info' | 'destructive';
  loading?: boolean;
  /** Optional link to navigate to on click */
  href?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend = 'neutral',
  variant = 'default',
  loading = false,
  href,
}: StatsCardProps) {
  const iconBgColors = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-warning/10 text-warning',
    success: 'bg-success/10 text-success',
    info: 'bg-info/10 text-info',
    destructive: 'bg-destructive/10 text-destructive',
  };

  const cardContent = (
    <Card 
      variant={href ? 'interactive' : 'elevated'} 
      className={cn('overflow-hidden h-full', href && 'cursor-pointer')}
    >
      <CardContent className="p-6 h-full flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
            <div className="mt-auto space-y-1">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className={cn('p-2.5 rounded-lg shrink-0', iconBgColors[variant])}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-1 mt-auto">
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {description && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TrendIndicator
                    value={0}
                    direction={trend}
                    showPercentage={false}
                    size="sm"
                  />
                  {typeof description === 'string' ? <span>{description}</span> : description}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="h-full block">{cardContent}</Link>;
  }

  return cardContent;
}

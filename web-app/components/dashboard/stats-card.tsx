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
  meta?: ReactNode;
  description?: ReactNode;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'warning' | 'success' | 'info' | 'destructive';
  loading?: boolean;
  /** Optional link to navigate to on click */
  href?: string;
  /** Accessible label for interactive cards */
  ariaLabel?: string;
  /** Hide the trend indicator when description is factual text instead of a delta */
  showTrendIndicator?: boolean;
  /** Additional classes for the value */
  valueClassName?: string;
}

export function StatsCard({
  title,
  value,
  meta,
  description,
  icon: Icon,
  trend = 'neutral',
  variant = 'default',
  loading = false,
  href,
  ariaLabel,
  showTrendIndicator = Boolean(description),
  valueClassName,
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
            <div className="space-y-1.5 mt-auto">
              <p className={cn('text-3xl font-bold tracking-tight tabular-nums', valueClassName)}>{value}</p>
              {meta && (
                <div className="text-sm text-muted-foreground">
                  {typeof meta === 'string' ? <span>{meta}</span> : meta}
                </div>
              )}
              {description && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {showTrendIndicator && (
                    <TrendIndicator
                      value={0}
                      direction={trend}
                      showPercentage={false}
                      size="sm"
                    />
                  )}
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
    return (
      <Link
        href={href}
        aria-label={ariaLabel ?? title}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}

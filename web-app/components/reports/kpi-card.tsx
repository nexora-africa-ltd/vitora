'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import type { KPIMetric } from '@/lib/types/dashboard';

interface KPICardProps extends KPIMetric {
  className?: string;
}

export function KPICard({
  title,
  value,
  unit,
  change,
  changeType,
  trend,
  variant = 'default',
  href,
  description,
  className,
}: KPICardProps) {
  const variantStyles = {
    default: '',
    success: 'border-green-200 dark:border-green-900',
    warning: 'border-amber-200 dark:border-amber-900',
    destructive: 'border-destructive',
  };

  const trendStyles = {
    up: changeType === 'increase' ? 'text-green-600' : 'text-destructive',
    down: changeType === 'decrease' ? 'text-green-600' : 'text-destructive',
    stable: 'text-muted-foreground',
  };

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const cardContent = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{value}</span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
        </div>

        {trend && change !== undefined && (
          <div className={cn('flex items-center gap-1 text-sm', trendStyles[trend])}>
            <TrendIcon className="h-4 w-4" />
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>

      {description && (
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card
          className={cn(
            'transition-colors cursor-pointer hover:bg-accent/50',
            variantStyles[variant],
            className
          )}
        >
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card className={cn(variantStyles[variant], className)}>
      {cardContent}
    </Card>
  );
}

export default KPICard;

'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { TrendIndicator } from '@/components/charts';
import { cn } from '@/lib/utils/cn';
import type { KPIMetric } from '@/lib/types/dashboard';

interface KPICardProps extends KPIMetric {
  className?: string;
  /** Custom class for the value number (e.g., color-coding) */
  valueClassName?: string;
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
  valueClassName,
}: KPICardProps) {
  const variantStyles = {
    default: '',
    success: 'border-success/30 dark:border-success/20',
    warning: 'border-warning/30 dark:border-warning/20',
    destructive: 'border-destructive/30',
  };

  // Value color classes based on variant (for the number itself)
  const valueColorStyles = {
    default: '',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  };

  // Determine if colors should be inverted (e.g., for costs where decrease is good)
  const invertColors = changeType === 'decrease';

  const cardContent = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className={cn("text-2xl font-bold", valueClassName || valueColorStyles[variant])}>
              {value}
            </span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
        </div>

        {trend && change !== undefined && (
          <TrendIndicator
            value={0}
            percentageChange={trend === 'up' ? change : trend === 'down' ? -change : 0}
            direction={trend === 'stable' ? 'neutral' : trend}
            invertColors={invertColors}
            size="md"
          />
        )}
      </div>

      {description && (
        <div className="mt-2 text-xs text-muted-foreground">
          {typeof description === 'string' ? <p>{description}</p> : description}
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card
          variant="interactive"
          className={cn('relative overflow-hidden min-h-[9rem]', variantStyles[variant], className)}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card className={cn('relative overflow-hidden min-h-[7rem]', variantStyles[variant], className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
      {cardContent}
    </Card>
  );
}

export default KPICard;

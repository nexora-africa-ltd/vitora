'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { TrendIndicator } from '@/components/charts';
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
    success: 'border-success/30 dark:border-success/20',
    warning: 'border-warning/30 dark:border-warning/20',
    destructive: 'border-destructive/30',
  };

  // Determine if colors should be inverted (e.g., for costs where decrease is good)
  const invertColors = changeType === 'decrease';

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
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card
          variant="interactive"
          className={cn(variantStyles[variant], className)}
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

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminStatCardProps {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  valueClassName?: string;
  eyebrow?: string;
  meta?: string;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'critical';
  className?: string;
}

export function AdminStatCard({
  title,
  value,
  description,
  icon,
  valueClassName,
  eyebrow,
  meta,
  tone = 'default',
  className,
}: AdminStatCardProps) {
  const toneVariant = {
    default: 'default',
    primary: 'primary',
    success: 'success',
    warning: 'warning',
    critical: 'critical',
  } as const;

  const iconClassName = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-500/10 text-emerald-600',
    warning: 'bg-amber-500/10 text-amber-600',
    critical: 'bg-destructive/10 text-destructive',
  } as const;

  return (
    <Card variant={toneVariant[tone]} className={cn('border-border/70', className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {meta ? (
              <Badge variant="outline" className="shrink-0">
                {meta}
              </Badge>
            ) : null}
            {icon ? (
              <div className={cn('rounded-xl p-2', iconClassName[tone])}>
                {icon}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className={cn('text-3xl font-semibold tracking-tight', valueClassName)}>{value}</div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
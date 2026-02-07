/**
 * Imaging priority badge component.
 * Displays order priority with appropriate colors.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { ImagingPriority, PRIORITY_LABELS } from '@/lib/types/imaging';
import { AlertTriangle, Clock, Zap } from 'lucide-react';

interface PriorityBadgeProps {
  priority: ImagingPriority;
  className?: string;
  showIcon?: boolean;
}

const PRIORITY_CONFIG: Record<
  ImagingPriority,
  {
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'outline'
      | 'warning';
    className: string;
    icon: React.ElementType;
  }
> = {
  ROUTINE: {
    variant: 'outline',
    className: 'border-border text-muted-foreground',
    icon: Clock,
  },
  URGENT: {
    variant: 'warning',
    className: 'font-medium',
    icon: AlertTriangle,
  },
  STAT: {
    variant: 'destructive',
    className: 'font-bold',
    icon: Zap,
  },
};

export function PriorityBadge({
  priority,
  className,
  showIcon = true,
}: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn('gap-1', config.className, className)}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export default PriorityBadge;

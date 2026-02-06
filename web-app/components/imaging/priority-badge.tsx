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
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className: string;
    icon: React.ElementType;
  }
> = {
  ROUTINE: {
    variant: 'outline',
    className: 'border-gray-300 text-gray-600',
    icon: Clock,
  },
  URGENT: {
    variant: 'secondary',
    className: 'border-orange-200 text-orange-700 bg-orange-50',
    icon: AlertTriangle,
  },
  STAT: {
    variant: 'destructive',
    className: 'border-red-300 text-red-700 bg-red-50 font-bold',
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

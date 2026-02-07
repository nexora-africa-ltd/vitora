/**
 * Imaging order status badge component.
 * Displays order status with appropriate colors.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { ImagingOrderStatus, STATUS_LABELS } from '@/lib/types/imaging';
import {
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Calendar,
  Loader2,
  Send,
} from 'lucide-react';

interface OrderStatusBadgeProps {
  status: ImagingOrderStatus;
  className?: string;
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<
  ImagingOrderStatus,
  {
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'outline'
      | 'success'
      | 'warning'
      | 'info';
    className: string;
    icon: React.ElementType;
  }
> = {
  DRAFT: {
    variant: 'outline',
    className: 'border-border text-muted-foreground',
    icon: FileText,
  },
  ORDERED: {
    variant: 'info',
    className: 'font-medium',
    icon: Send,
  },
  SCHEDULED: {
    variant: 'secondary',
    className: 'font-medium',
    icon: Calendar,
  },
  IN_PROGRESS: {
    variant: 'warning',
    className: 'font-medium',
    icon: Loader2,
  },
  COMPLETED: {
    variant: 'info',
    className: 'font-medium',
    icon: Clock,
  },
  REPORTED: {
    variant: 'success',
    className: 'font-medium',
    icon: CheckCircle2,
  },
  CANCELLED: {
    variant: 'destructive',
    className: 'font-medium',
    icon: XCircle,
  },
};

export function OrderStatusBadge({
  status,
  className,
  showIcon = true,
}: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'gap-1 font-medium',
        config.className,
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn('h-3 w-3', status === 'IN_PROGRESS' && 'animate-spin')}
        />
      )}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export default OrderStatusBadge;

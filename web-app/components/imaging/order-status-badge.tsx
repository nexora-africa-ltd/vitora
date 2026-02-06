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
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className: string;
    icon: React.ElementType;
  }
> = {
  DRAFT: {
    variant: 'outline',
    className: 'border-gray-300 text-gray-600 bg-gray-50',
    icon: FileText,
  },
  ORDERED: {
    variant: 'secondary',
    className: 'border-blue-200 text-blue-700 bg-blue-50',
    icon: Send,
  },
  SCHEDULED: {
    variant: 'secondary',
    className: 'border-purple-200 text-purple-700 bg-purple-50',
    icon: Calendar,
  },
  IN_PROGRESS: {
    variant: 'default',
    className: 'border-amber-200 text-amber-700 bg-amber-50',
    icon: Loader2,
  },
  COMPLETED: {
    variant: 'default',
    className: 'border-teal-200 text-teal-700 bg-teal-50',
    icon: Clock,
  },
  REPORTED: {
    variant: 'default',
    className: 'border-green-200 text-green-700 bg-green-50',
    icon: CheckCircle2,
  },
  CANCELLED: {
    variant: 'destructive',
    className: 'border-red-200 text-red-700 bg-red-50',
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

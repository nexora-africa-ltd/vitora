/**
 * Allied Health Priority Badge
 * Shared component for displaying priority levels
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import type { AlliedHealthPriority } from '@/lib/types/allied-health';

const priorityConfig: Record<
  AlliedHealthPriority,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  EMERGENCY: {
    label: 'Emergency',
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: AlertTriangle,
  },
  URGENT: {
    label: 'Urgent',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: AlertCircle,
  },
  ROUTINE: {
    label: 'Routine',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Clock,
  },
};

interface PriorityBadgeProps {
  priority: AlliedHealthPriority;
  showIcon?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, showIcon = false, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn(config.className, 'font-medium gap-1', className)}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

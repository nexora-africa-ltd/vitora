/**
 * Allied Health Status Badge
 * Shared component for displaying order/session statuses
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AlliedHealthOrderStatus, AlliedHealthSessionStatus } from '@/lib/types/allied-health';

// Order status colors
const orderStatusConfig: Record<AlliedHealthOrderStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  ON_HOLD: { label: 'On Hold', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800 border-green-200' },
};

// Session status colors
const sessionStatusConfig: Record<string, { label: string; className: string }> = {
  // Allied Health session statuses
  SCHEDULED: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800 border-green-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  NO_SHOW: { label: 'No Show', className: 'bg-red-100 text-red-800 border-red-200' },
  RESCHEDULED: { label: 'Rescheduled', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  // Clinic Visit statuses (for compatibility)
  REGISTERED: { label: 'Registered', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  WAITING: { label: 'Waiting', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  CALLED: { label: 'Called', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  IN_CONSULTATION: { label: 'In Consultation', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  REFERRED: { label: 'Referred', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
};

interface OrderStatusBadgeProps {
  status: AlliedHealthOrderStatus;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = orderStatusConfig[status];
  return (
    <Badge variant="outline" className={cn(config.className, 'font-medium', className)}>
      {config.label}
    </Badge>
  );
}

interface SessionStatusBadgeProps {
  status: string; // Can be AlliedHealthSessionStatus or ClinicVisit status
  className?: string;
}

export function SessionStatusBadge({ status, className }: SessionStatusBadgeProps) {
  const config = sessionStatusConfig[status] || {
    label: status.replace(/_/g, ' '),
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <Badge variant="outline" className={cn(config.className, 'font-medium', className)}>
      {config.label}
    </Badge>
  );
}

/**
 * Clinic Visit Status Badge Component
 *
 * Displays the current status of a clinic visit with appropriate styling.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import type { ClinicVisitStatus } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface ClinicVisitStatusBadgeProps {
  status: ClinicVisitStatus;
  statusDisplay?: string;
  className?: string;
}

const STATUS_STYLES: Record<ClinicVisitStatus, { className: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  REGISTERED: { className: '', variant: 'secondary' },
  WAITING: { className: '', variant: 'secondary' },
  CALLED: { className: 'bg-blue-500 hover:bg-blue-500/90', variant: 'default' },
  IN_CONSULTATION: { className: 'bg-green-500 hover:bg-green-500/90', variant: 'default' },
  COMPLETED: { className: '', variant: 'outline' },
  REFERRED: { className: 'bg-purple-500 hover:bg-purple-500/90', variant: 'default' },
  NO_SHOW: { className: 'bg-orange-500 hover:bg-orange-500/90', variant: 'default' },
  CANCELLED: { className: '', variant: 'destructive' },
};

const STATUS_LABELS: Record<ClinicVisitStatus, string> = {
  REGISTERED: 'Registered',
  WAITING: 'Waiting',
  CALLED: 'Called',
  IN_CONSULTATION: 'In Consultation',
  COMPLETED: 'Completed',
  REFERRED: 'Referred',
  NO_SHOW: 'No-Show',
  CANCELLED: 'Cancelled',
};

export function ClinicVisitStatusBadge({
  status,
  statusDisplay,
  className,
}: ClinicVisitStatusBadgeProps) {
  const config = STATUS_STYLES[status] ?? STATUS_STYLES.WAITING;
  const label = statusDisplay ?? STATUS_LABELS[status] ?? status;

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {label}
    </Badge>
  );
}

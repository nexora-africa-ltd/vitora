import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { IDSRReportStatus } from '@/lib/types/surveillance';

const STATUS_VARIANTS: Record<IDSRReportStatus, BadgeProps['variant']> = {
  DRAFT: 'secondary',
  PENDING_REVIEW: 'warning',
  APPROVED: 'info',
  SUBMITTED: 'success',
  FAILED: 'destructive',
};

const STATUS_LABELS: Record<IDSRReportStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  SUBMITTED: 'Submitted',
  FAILED: 'Failed',
};

interface IDSRStatusBadgeProps {
  status: IDSRReportStatus;
  className?: string;
  size?: BadgeProps['size'];
}

export function IDSRStatusBadge({ status, className, size }: IDSRStatusBadgeProps) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status]}
      size={size}
      className={cn('shrink-0 w-fit', className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

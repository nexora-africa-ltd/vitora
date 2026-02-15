'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, XCircle, Shield, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ValidationType, ValidationStatus } from '@/lib/types/laboratory';

interface ValidationStatusBadgeProps {
  validationType: ValidationType;
  status: ValidationStatus;
  className?: string;
  showIcon?: boolean;
}

const typeConfig: Record<ValidationType, { icon: typeof Shield; label: string; shortLabel: string }> = {
  TECHNICAL: { icon: Shield, label: 'Technical', shortLabel: 'Tech' },
  CLINICAL: { icon: Stethoscope, label: 'Clinical', shortLabel: 'Clin' },
};

const statusConfig: Record<ValidationStatus, { color: string; icon: typeof Clock }> = {
  PENDING: {
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    icon: Clock,
  },
  APPROVED: {
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
    icon: CheckCircle2,
  },
  REJECTED: {
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
    icon: XCircle,
  },
};

/**
 * Badge for displaying validation type and status.
 * Shows type icon (Shield/Stethoscope) and status indicator.
 */
export function ValidationStatusBadge({
  validationType,
  status,
  className,
  showIcon = true,
}: ValidationStatusBadgeProps) {
  const typeInfo = typeConfig[validationType];
  const statusInfo = statusConfig[status];
  const TypeIcon = typeInfo.icon;
  const StatusIcon = statusInfo.icon;

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 shrink-0 w-fit', statusInfo.color, className)}
    >
      {showIcon && <TypeIcon className="h-3 w-3" />}
      {/* Short label on mobile, full on sm+ */}
      <span className="sm:hidden">{typeInfo.shortLabel}</span>
      <span className="hidden sm:inline">{typeInfo.label}</span>
      <StatusIcon className="h-3 w-3 ml-0.5" />
    </Badge>
  );
}

interface ValidationSummaryProps {
  technicalStatus?: ValidationStatus | null;
  clinicalStatus?: ValidationStatus | null;
  className?: string;
}

/**
 * Shows combined validation status summary for a result.
 * Displays badges for technical and clinical validations.
 */
export function ValidationSummary({
  technicalStatus,
  clinicalStatus,
  className,
}: ValidationSummaryProps) {
  const isFullyValidated =
    technicalStatus === 'APPROVED' && clinicalStatus === 'APPROVED';

  if (isFullyValidated) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1 shrink-0 w-fit bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
          className
        )}
      >
        <CheckCircle2 className="h-3 w-3" />
        Fully Validated
      </Badge>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {technicalStatus && (
        <ValidationStatusBadge validationType="TECHNICAL" status={technicalStatus} />
      )}
      {clinicalStatus && (
        <ValidationStatusBadge validationType="CLINICAL" status={clinicalStatus} />
      )}
      {!technicalStatus && !clinicalStatus && (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          Awaiting Review
        </Badge>
      )}
    </div>
  );
}

export default ValidationStatusBadge;

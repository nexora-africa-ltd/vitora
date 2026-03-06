'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, FileText, PenLine, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { DiagnosticReportStatus } from '@/lib/types/laboratory';

interface ReportStatusBadgeProps {
  status: DiagnosticReportStatus;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<
  DiagnosticReportStatus,
  { label: string; color: string; icon: typeof Clock }
> = {
  DRAFT: {
    label: 'Draft',
    color:
      'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    icon: FileText,
  },
  PRELIMINARY: {
    label: 'Preliminary',
    color:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    icon: Clock,
  },
  FINAL: {
    label: 'Final',
    color:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
    icon: CheckCircle2,
  },
  AMENDED: {
    label: 'Amended',
    color:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    icon: PenLine,
  },
  CANCELLED: {
    label: 'Cancelled',
    color:
      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
    icon: XCircle,
  },
};

export function ReportStatusBadge({
  status,
  className,
  showIcon = true,
}: ReportStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 shrink-0 w-fit', config.color, className)}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

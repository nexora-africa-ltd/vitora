'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { LabResult } from '@/lib/types/laboratory';
import { cn } from '@/lib/utils/cn';

interface LabResultsBadgeProps {
  hasResult: boolean;
  result?: LabResult | null;
  showValue?: boolean;
}

export function LabResultsBadge({ hasResult, result, showValue = false }: LabResultsBadgeProps) {
  if (!hasResult || !result) {
    return (
      <Badge variant="outline" className="text-xs">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  }

  const isCritical = result.is_critical_result;
  const isAbnormal = result.result_flag &&
    !['NORMAL', 'NEGATIVE'].includes(result.result_flag);
  const isVerified = result.verification_status === 'VERIFIED';

  if (isCritical) {
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Critical
        {showValue && result.numeric_value && ` - ${result.numeric_value}`}
      </Badge>
    );
  }

  if (isAbnormal) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          'text-xs',
          result.result_flag?.includes('HIGH') && 'bg-orange-100 text-orange-700',
          result.result_flag?.includes('LOW') && 'bg-blue-100 text-blue-700',
          result.result_flag === 'ABNORMAL' && 'bg-yellow-100 text-yellow-700',
          result.result_flag === 'POSITIVE' && 'bg-purple-100 text-purple-700',
        )}
      >
        {result.result_flag}
        {showValue && result.numeric_value && ` - ${result.numeric_value}`}
      </Badge>
    );
  }

  return (
    <Badge
      variant={isVerified ? 'default' : 'outline'}
      className={cn('text-xs', isVerified && 'bg-green-100 text-green-700')}
    >
      <CheckCircle2 className="h-3 w-3 mr-1" />
      {isVerified ? 'Verified' : 'Complete'}
      {showValue && result.numeric_value && ` - ${result.numeric_value}`}
    </Badge>
  );
}

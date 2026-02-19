/**
 * Clinic Priority Badge Component
 *
 * Displays a colored badge indicating the visit priority level.
 */
'use client';

import { AlertCircle, AlertTriangle, Clock, CheckCircle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClinicVisitPriority, ClinicalPriority } from '@/lib/types/clinic';
import { CLINIC_PRIORITY_CONFIG, TRIAGE_TO_CLINICAL_PRIORITY } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface ClinicPriorityBadgeProps {
  priority: ClinicVisitPriority;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const priorityIcons: Record<ClinicalPriority, typeof AlertCircle> = {
  EMERGENCY: AlertCircle,
  URGENT: AlertTriangle,
  PRIORITY: Clock,
  STANDARD: CheckCircle,
  NON_URGENT: Info,
};

const priorityColors: Record<ClinicalPriority, string> = {
  EMERGENCY: 'bg-red-500 text-white hover:bg-red-600',
  URGENT: 'bg-orange-500 text-white hover:bg-orange-600',
  PRIORITY: 'bg-yellow-500 text-black hover:bg-yellow-600',
  STANDARD: 'bg-green-500 text-white hover:bg-green-600',
  NON_URGENT: 'bg-blue-500 text-white hover:bg-blue-600',
};

const priorityEmoji: Record<ClinicalPriority, string> = {
  EMERGENCY: '🔴',
  URGENT: '🟠',
  PRIORITY: '🟡',
  STANDARD: '🟢',
  NON_URGENT: '🔵',
};

export function ClinicPriorityBadge({
  priority,
  showLabel = true,
  size = 'sm',
}: ClinicPriorityBadgeProps) {
  // Map triage colors to their clinical priority equivalent
  const clinicalPriority = TRIAGE_TO_CLINICAL_PRIORITY[priority];
  const config = CLINIC_PRIORITY_CONFIG[priority];
  const Icon = priorityIcons[clinicalPriority];

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <Badge
      className={cn(
        'inline-flex items-center gap-1 font-medium border-0',
        priorityColors[clinicalPriority],
        sizeClasses[size]
      )}
    >
      <span>{priorityEmoji[clinicalPriority]}</span>
      {showLabel && <span>{priority}</span>}
    </Badge>
  );
}

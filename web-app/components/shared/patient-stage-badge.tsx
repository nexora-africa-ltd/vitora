/**
 * PatientStageBadge Component
 * 
 * Displays the current stage in a patient's journey through the facility.
 * Uses consistent color coding across the application.
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { 
  Clock, 
  Activity, 
  Stethoscope, 
  CheckCircle2, 
  UserPlus,
  FileText,
} from 'lucide-react';
import type { PatientStage } from '@/lib/types/triage';
import { PATIENT_STAGE_CONFIG } from '@/lib/types/triage';

interface PatientStageBadgeProps {
  stage: PatientStage;
  size?: 'sm' | 'default' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const stageIcons: Record<PatientStage, React.ReactNode> = {
  REGISTERED: <UserPlus className="h-3 w-3" />,
  AWAITING_TRIAGE: <Clock className="h-3 w-3" />,
  IN_TRIAGE: <Activity className="h-3 w-3" />,
  AWAITING_CONSULTATION: <Clock className="h-3 w-3" />,
  IN_CONSULTATION: <Stethoscope className="h-3 w-3" />,
  COMPLETED: <CheckCircle2 className="h-3 w-3" />,
};

const stageColors: Record<PatientStage, string> = {
  REGISTERED: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
  AWAITING_TRIAGE: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
  IN_TRIAGE: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300',
  AWAITING_CONSULTATION: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300',
  IN_CONSULTATION: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
};

export function PatientStageBadge({ 
  stage, 
  size = 'default',
  showIcon = true,
  className,
}: PatientStageBadgeProps) {
  const config = PATIENT_STAGE_CONFIG[stage];
  const icon = stageIcons[stage];
  const colorClass = stageColors[stage];

  return (
    <Badge 
      variant="outline"
      className={cn(
        'font-medium border',
        colorClass,
        size === 'sm' && 'text-xs px-1.5 py-0',
        size === 'lg' && 'text-sm px-3 py-1',
        className
      )}
    >
      {showIcon && (
        <span className="mr-1">{icon}</span>
      )}
      {config.label}
    </Badge>
  );
}

/**
 * Helper function to determine patient stage from queue status
 */
export function getPatientStageFromQueueStatus(
  waitingQueueStatus?: string,
  triageQueueStatus?: string,
): PatientStage {
  if (triageQueueStatus === 'COMPLETED' || triageQueueStatus === 'LEFT_WITHOUT_BEING_SEEN') {
    return 'COMPLETED';
  }
  if (triageQueueStatus === 'WITH_CLINICIAN') {
    return 'IN_CONSULTATION';
  }
  if (triageQueueStatus === 'WAITING' || triageQueueStatus === 'CALLED') {
    return 'AWAITING_CONSULTATION';
  }
  if (waitingQueueStatus === 'IN_TRIAGE') {
    return 'IN_TRIAGE';
  }
  if (waitingQueueStatus === 'WAITING_TRIAGE') {
    return 'AWAITING_TRIAGE';
  }
  return 'REGISTERED';
}

export default PatientStageBadge;

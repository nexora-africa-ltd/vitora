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
  FlaskConical,
  ScanLine,
  Pill,
  CreditCard,
  BedDouble,
  HeartPulse,
  ClipboardCheck,
  LogOut,
  ExternalLink,
  AlertTriangle,
  Skull,
  UserCheck,
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
  CHECKED_IN: <UserCheck className="h-3 w-3" />,
  AWAITING_TRIAGE: <Clock className="h-3 w-3" />,
  IN_TRIAGE: <Activity className="h-3 w-3" />,
  AWAITING_CONSULTATION: <Clock className="h-3 w-3" />,
  IN_CONSULTATION: <Stethoscope className="h-3 w-3" />,
  AWAITING_LAB: <FlaskConical className="h-3 w-3" />,
  LAB_IN_PROGRESS: <FlaskConical className="h-3 w-3" />,
  LAB_RESULTS_READY: <CheckCircle2 className="h-3 w-3" />,
  AWAITING_IMAGING: <ScanLine className="h-3 w-3" />,
  IMAGING_IN_PROGRESS: <ScanLine className="h-3 w-3" />,
  IMAGING_RESULTS_READY: <CheckCircle2 className="h-3 w-3" />,
  AWAITING_PHARMACY: <Pill className="h-3 w-3" />,
  PHARMACY_DISPENSING: <Pill className="h-3 w-3" />,
  PHARMACY_READY: <CheckCircle2 className="h-3 w-3" />,
  AWAITING_BILLING: <CreditCard className="h-3 w-3" />,
  BILLING_IN_PROGRESS: <CreditCard className="h-3 w-3" />,
  BILLING_COMPLETE: <CheckCircle2 className="h-3 w-3" />,
  ADMISSION_RECOMMENDED: <BedDouble className="h-3 w-3" />,
  AWAITING_BED: <BedDouble className="h-3 w-3" />,
  ADMITTED: <BedDouble className="h-3 w-3" />,
  INPATIENT_CARE: <HeartPulse className="h-3 w-3" />,
  AWAITING_DISCHARGE: <ClipboardCheck className="h-3 w-3" />,
  DISCHARGE_PLANNING: <ClipboardCheck className="h-3 w-3" />,
  DISCHARGED: <LogOut className="h-3 w-3" />,
  REFERRED_OUT: <ExternalLink className="h-3 w-3" />,
  LEFT_WITHOUT_BEING_SEEN: <AlertTriangle className="h-3 w-3" />,
  DECEASED: <Skull className="h-3 w-3" />,
};

const stageColors: Record<PatientStage, string> = {
  REGISTERED: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
  CHECKED_IN: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300',
  AWAITING_TRIAGE: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
  IN_TRIAGE: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300',
  AWAITING_CONSULTATION: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300',
  IN_CONSULTATION: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300',
  AWAITING_LAB: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  LAB_IN_PROGRESS: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  LAB_RESULTS_READY: 'bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-900/30 dark:text-lime-300',
  AWAITING_IMAGING: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300',
  IMAGING_IN_PROGRESS: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300',
  IMAGING_RESULTS_READY: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300',
  AWAITING_PHARMACY: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300',
  PHARMACY_DISPENSING: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300',
  PHARMACY_READY: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300',
  AWAITING_BILLING: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300',
  BILLING_IN_PROGRESS: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300',
  BILLING_COMPLETE: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300',
  ADMISSION_RECOMMENDED: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300',
  AWAITING_BED: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300',
  ADMITTED: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300',
  INPATIENT_CARE: 'bg-red-100 text-red-800 border-red-400 dark:bg-red-900/40 dark:text-red-300',
  AWAITING_DISCHARGE: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
  DISCHARGE_PLANNING: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
  DISCHARGED: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
  REFERRED_OUT: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300',
  LEFT_WITHOUT_BEING_SEEN: 'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
  DECEASED: 'bg-gray-200 text-gray-700 border-gray-400 dark:bg-gray-800 dark:text-gray-300',
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
    return 'DISCHARGED';
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

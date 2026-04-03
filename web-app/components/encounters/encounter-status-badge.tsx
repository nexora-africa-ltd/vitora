/**
 * Encounter Status Badge Component
 *
 * Displays the current encounter status with appropriate color coding.
 * Sprint 2 - Phase 2A: Enhanced State Machine
 */
'use client';

import { Badge } from '@/components/ui/badge';
import type { EncounterStatus } from '@/lib/types/encounter';
import { ENCOUNTER_STATUS_DISPLAY } from '@/lib/types/encounter';
import {
  Circle,
  UserCheck,
  Stethoscope,
  Play,
  Pause,
  SquareDashedTopSolid,
  Clock,
  CheckCircle,
  XCircle,
  Lock,
} from 'lucide-react';

const STATUS_CONFIG: Record<
  EncounterStatus,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType; className?: string }
> = {
  CREATED: { variant: 'outline', icon: Circle, className: 'border-gray-300 text-gray-600' },
  CHECKED_IN: { variant: 'outline', icon: UserCheck, className: 'border-blue-300 text-blue-600' },
  TRIAGED: { variant: 'outline', icon: Stethoscope, className: 'border-cyan-300 text-cyan-600' },
  IN_PROGRESS: { variant: 'default', icon: Play, className: 'bg-blue-600 text-white' },
  ON_HOLD: { variant: 'secondary', icon: Pause, className: 'bg-amber-100 text-amber-700 border-amber-300' },
  ORDERS_PLACED: { variant: 'outline', icon: SquareDashedTopSolid, className: 'border-purple-300 text-purple-600' },
  RESULTS_PENDING: { variant: 'outline', icon: Clock, className: 'border-orange-300 text-orange-600' },
  READY_TO_CLOSE: { variant: 'outline', icon: CheckCircle, className: 'border-green-300 text-green-600' },
  CLOSED: { variant: 'secondary', icon: Lock, className: 'bg-gray-100 text-gray-500' },
  COMPLETED: { variant: 'secondary', icon: CheckCircle, className: 'bg-green-100 text-green-700' },
  CANCELLED: { variant: 'destructive', icon: XCircle },
};

interface EncounterStatusBadgeProps {
  status: EncounterStatus;
  showIcon?: boolean;
  size?: 'sm' | 'default';
}

export function EncounterStatusBadge({
  status,
  showIcon = true,
  size = 'default',
}: EncounterStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.CREATED;
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`${config.className || ''} ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}
    >
      {showIcon && <Icon className={`${size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />}
      {ENCOUNTER_STATUS_DISPLAY[status] || status}
    </Badge>
  );
}

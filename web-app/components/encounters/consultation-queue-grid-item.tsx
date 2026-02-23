/**
 * ConsultationQueueGridItem Component
 *
 * Grid view variant of ConsultationQueueItem using EntityCard pattern.
 * Shows patient info in a compact card format for grid layouts.
 */
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Phone,
  Play,
  Clock,
  AlertTriangle,
  UserCheck,
  Lock,
  Loader2,
} from 'lucide-react';
import type { ConsultationQueueItem as QueueItemType } from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface ConsultationQueueGridItemProps {
  item: QueueItemType;
  currentUserId?: number;
  onCall: (encounterId: number) => void;
  onStartConsultation: (encounterId: number) => void;
  onClaim?: (encounterId: number) => void;
  onRelease?: (encounterId: number) => void;
  isCallingPatient?: boolean;
  isClaimingEncounter?: boolean;
  isReleasingEncounter?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

const getTriageBadgeStyles = (category: string | null): string => {
  switch (category) {
    case 'RED':
      return 'bg-red-500 text-white';
    case 'ORANGE':
      return 'bg-orange-500 text-white';
    case 'YELLOW':
      return 'bg-yellow-500 text-black';
    case 'GREEN':
      return 'bg-green-500 text-white';
    case 'BLUE':
      return 'bg-blue-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

const getGenderBgClass = (gender: string | null): string => {
  switch (gender?.toUpperCase()) {
    case 'M':
      return 'bg-[hsl(var(--gender-male)/0.15)] text-[hsl(var(--gender-male))]';
    case 'F':
      return 'bg-[hsl(var(--gender-female)/0.15)] text-[hsl(var(--gender-female))]';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getGenderRingClass = (gender: string | null): string => {
  switch (gender?.toUpperCase()) {
    case 'M':
      return 'ring-[hsl(var(--gender-male))]';
    case 'F':
      return 'ring-[hsl(var(--gender-female))]';
    default:
      return 'ring-border';
  }
};

const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};

const isUrgentWaitTime = (minutes: number, category: string | null): boolean => {
  const thresholds: Record<string, number> = {
    RED: 10,
    ORANGE: 30,
    YELLOW: 60,
    GREEN: 120,
    BLUE: 180,
  };
  if (!category) return minutes > 60;
  return minutes > (thresholds[category] || 60);
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

// =============================================================================
// Component
// =============================================================================

export function ConsultationQueueGridItem({
  item,
  currentUserId,
  onCall,
  onStartConsultation,
  onRelease,
  isCallingPatient = false,
  isReleasingEncounter = false,
}: ConsultationQueueGridItemProps) {
  const isWaiting = item.consultation_status === 'WAITING';
  const isCalled = item.consultation_status === 'CALLED';
  const isBypassed = item.triage_status === 'BYPASSED';
  const isDirect = item.triage_status === 'NOT_APPLICABLE';

  const isClaimed = !!item.assigned_clinician;
  const isClaimedByMe = isClaimed && currentUserId === item.assigned_clinician;
  const isClaimedByOther = isClaimed && currentUserId !== item.assigned_clinician;
  const isUrgent = isUrgentWaitTime(item.wait_time_minutes, item.triage_category);

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all hover:shadow-md',
        isCalled && 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
        isUrgent && !isCalled && 'border-orange-500'
      )}
    >
      <CardContent className="p-4">
        {/* Header: Avatar + Name + Badges */}
        <div className="flex items-start gap-3">
          <Avatar
            className={cn(
              'h-10 w-10 ring-2 ring-offset-2 ring-offset-background shrink-0',
              getGenderRingClass(item.patient_gender)
            )}
          >
            <AvatarFallback className={cn('text-xs font-medium', getGenderBgClass(item.patient_gender))}>
              {getInitials(item.patient_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-medium text-sm leading-tight truncate">
                {item.patient_name}
              </h3>
              {isUrgent && (
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {item.patient_mrn}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {/* Triage Badge */}
              {isBypassed ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Bypassed
                </Badge>
              ) : isDirect ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Direct
                </Badge>
              ) : item.triage_category ? (
                <Badge className={cn(getTriageBadgeStyles(item.triage_category), 'text-[10px] px-1.5 py-0')}>
                  {item.triage_category}
                </Badge>
              ) : null}

              {/* Called Badge */}
              {isCalled && (
                <Badge variant="outline" className="border-blue-500 text-blue-600 text-[10px] px-1.5 py-0">
                  Called
                </Badge>
              )}

              {/* Claimed Badge */}
              {isClaimedByMe && (
                <Badge variant="info" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <UserCheck className="h-2.5 w-2.5" />
                  <span>Yours</span>
                </Badge>
              )}
              {isClaimedByOther && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1.5 py-0 gap-0.5">
                  <Lock className="h-2.5 w-2.5" />
                  <span className="truncate max-w-[50px]">
                    {item.assigned_clinician_name?.split(' ')[0] || 'Other'}
                  </span>
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Chief Complaint - truncated */}
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
          {item.chief_complaint}
        </p>

        {/* Footer: Wait Time + Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          {/* Wait Time */}
          <div className={cn(
            'flex items-center gap-1 text-xs',
            isUrgent ? 'text-orange-600 font-medium' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3" />
            {formatWaitTime(item.wait_time_minutes)}
          </div>

          {/* Actions */}
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              {/* Call Patient (if waiting) */}
              {isWaiting && !isClaimedByOther && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => onCall(item.id)}
                      disabled={isCallingPatient}
                    >
                      {isCallingPatient ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Phone className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Call Patient</TooltipContent>
                </Tooltip>
              )}

              {/* Start Consultation (if called and claimed by me) */}
              {isCalled && isClaimedByMe && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onStartConsultation(item.id)}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Start Consultation</TooltipContent>
                </Tooltip>
              )}

              {/* Release (if claimed by me) */}
              {isClaimedByMe && onRelease && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => onRelease(item.id)}
                      disabled={isReleasingEncounter}
                    >
                      Release
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Release to Queue</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConsultationQueueGridItem;

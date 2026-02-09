/**
 * ConsultationQueueItem Component
 *
 * Displays a single patient in the consultation queue with:
 * - Patient info (name, MRN, age, gender)
 * - Triage status badge
 * - Wait time
 * - Clinician claim status (Data Integrity - Sprint 1.7)
 * - Action buttons (Call Patient claims automatically, Start Consultation, Release)
 *
 * Flow: Call Patient → (auto-claims) → Start Consultation
 */
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Phone,
  Play,
  RefreshCw,
  Clock,
  AlertTriangle,
  User,
  FileText,
  UserCheck,
  UserX,
  Lock,
} from 'lucide-react';
import type { ConsultationQueueItem as QueueItemType } from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface ConsultationQueueItemProps {
  item: QueueItemType;
  /** Current user's ID to check claim ownership */
  currentUserId?: number;
  /** Call patient (also claims the encounter automatically) */
  onCall: (encounterId: number) => void;
  onStartConsultation: (encounterId: number) => void;
  /** @deprecated Claim is now automatic when calling - kept for backward compatibility */
  onClaim?: (encounterId: number) => void;
  /** Release a claimed encounter (Data Integrity - Sprint 1.7) */
  onRelease?: (encounterId: number) => void;
  isCallingPatient?: boolean;
  /** @deprecated Use isCallingPatient instead */
  isClaimingEncounter?: boolean;
  isReleasingEncounter?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

const getTriageBadgeStyles = (category: string | null): string => {
  switch (category) {
    case 'RED':
      return 'bg-red-500 text-white hover:bg-red-600';
    case 'ORANGE':
      return 'bg-orange-500 text-white hover:bg-orange-600';
    case 'YELLOW':
      return 'bg-yellow-500 text-black hover:bg-yellow-600';
    case 'GREEN':
      return 'bg-green-500 text-white hover:bg-green-600';
    case 'BLUE':
      return 'bg-blue-500 text-white hover:bg-blue-600';
    default:
      return 'bg-gray-500 text-white hover:bg-gray-600';
  }
};

// Bypass reason display - aligned with backend TRIAGE_BYPASS_REASON_CHOICES
const getBypassReasonDisplay = (reason: string | null): string => {
  switch (reason) {
    case 'STABLE_FOLLOW_UP':
      return 'Stable follow-up';
    case 'CONSULTANT_DECISION':
      return 'Consultant decision';
    case 'CHRONIC_CARE_REVIEW':
      return 'Chronic care review';
    case 'STAFF_SHORTAGE':
      return 'Staff shortage';
    case 'PATIENT_PREFERENCE':
      return 'Patient preference';
    case 'OTHER':
      return 'Other';
    default:
      return reason || 'Unknown';
  }
};

const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
};

const getTimeSinceCalled = (calledAt: string | null): string => {
  if (!calledAt) return '';

  const calledTime = new Date(calledAt);
  const now = new Date();
  const diffMs = now.getTime() - calledTime.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Called just now';
  if (diffMin === 1) return 'Called 1 min ago';
  return `Called ${diffMin} min ago`;
};

const isUrgentWaitTime = (minutes: number, category: string | null): boolean => {
  // Wait time thresholds by category
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

/** Format time since claimed */
const getTimeSinceClaimed = (claimedAt: string | null): string => {
  if (!claimedAt) return '';

  const claimedTime = new Date(claimedAt);
  const now = new Date();
  const diffMs = now.getTime() - claimedTime.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} min ago`;
  const hours = Math.floor(diffMin / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
};

// =============================================================================
// Component
// =============================================================================

export function ConsultationQueueItem({
  item,
  currentUserId,
  onCall,
  onStartConsultation,
  onClaim,
  onRelease,
  isCallingPatient = false,
  isClaimingEncounter = false,
  isReleasingEncounter = false,
}: ConsultationQueueItemProps) {
  const isWaiting = item.consultation_status === 'WAITING';
  const isCalled = item.consultation_status === 'CALLED';
  const isBypassed = item.triage_status === 'BYPASSED';
  const isDirect = item.triage_status === 'NOT_APPLICABLE';

  // Claim status (Data Integrity - Sprint 1.7)
  const isClaimed = !!item.assigned_clinician;
  const isClaimedByMe = isClaimed && currentUserId === item.assigned_clinician;
  const isClaimedByOther = isClaimed && currentUserId !== item.assigned_clinician;
  const isUrgent = isUrgentWaitTime(item.wait_time_minutes, item.triage_category);

  return (
    <Card
      data-testid="queue-item"
      className={cn(
        'p-3 sm:p-4 transition-all duration-200 hover:shadow-md',
        isCalled && 'called border-blue-500 bg-blue-50 dark:bg-blue-950/20',
        isUrgent && !isCalled && 'border-orange-500'
      )}
    >
      {/* Mobile layout: stacked | Desktop layout: horizontal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        {/* Left: Patient Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Patient Name */}
            <h3 className="font-semibold text-base sm:text-lg truncate">
              {item.patient_name}
            </h3>

            {/* Urgent indicator */}
            {isUrgent && (
              <div data-testid="urgent-indicator" className="shrink-0">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
            )}
          </div>

          {/* MRN and Demographics */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground mb-2">
            <span className="font-mono">{item.patient_mrn}</span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.patient_age} {item.patient_gender}
            </span>
          </div>

          {/* Chief Complaint */}
          <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2">
            <FileText className="h-3 w-3 inline mr-1 shrink-0" />
            {item.chief_complaint}
          </p>

          {/* Encounter Type - visible on mobile */}
          <div className="text-xs text-muted-foreground sm:hidden">
            {item.encounter_type_display}
          </div>
        </div>

        {/* Middle: Badges & Wait Time - Row on mobile, column on desktop */}
        <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-end sm:gap-2 order-first sm:order-none">
          {/* Triage Badge */}
          {isBypassed ? (
            <Badge variant="secondary" className="bg-gray-200 text-gray-700 text-xs shrink-0 w-fit">
              <span className="hidden sm:inline"> Bypassed: </span>
              <span className="sm:hidden">BP: </span>
              {getBypassReasonDisplay(item.triage_bypass_reason)}
            </Badge>
          ) : isDirect ? (
            <Badge variant="secondary" className="bg-gray-200 text-gray-700 text-xs shrink-0 w-fit">
              <span className="hidden sm:inline"></span>Direct
            </Badge>
          ) : item.triage_category ? (
            <Badge className={cn(getTriageBadgeStyles(item.triage_category), 'text-xs shrink-0 w-fit')}>
              {item.triage_category}
            </Badge>
          ) : null}

          {/* Called Status Badge */}
          {isCalled && (
            <Badge variant="outline" className="border-blue-500 text-blue-600 text-xs shrink-0 w-fit">
              <span className="hidden sm:inline"></span>Called
            </Badge>
          )}

          {/* Claimed Status Badge (Data Integrity - Sprint 1.7) */}
          {isClaimedByMe && (
            <Badge variant="info" className="gap-1 text-xs shrink-0 w-fit">
              <UserCheck className="h-3 w-3" />
              <span className="hidden sm:inline">Claimed by you</span>
              <span className="sm:hidden">Yours</span>
            </Badge>
          )}
          {isClaimedByOther && (
            <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1 text-xs shrink-0 w-fit">
              <Lock className="h-3 w-3" />
              <span className="truncate max-w-[100px] sm:max-w-none">
                {item.assigned_clinician_name || item.assigned_clinician_username}
              </span>
            </Badge>
          )}

          {/* Wait Time */}
          <div className={cn(
            'flex items-center gap-1 text-xs sm:text-sm shrink-0',
            isUrgent ? 'text-orange-600 font-medium' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3" />
            {formatWaitTime(item.wait_time_minutes)}
          </div>

          {/* Time since called - hidden on mobile to save space */}
          {isCalled && item.called_at && (
            <div className="hidden sm:block text-xs text-blue-600">
              {getTimeSinceCalled(item.called_at)}
            </div>
          )}

          {/* Time since claimed - hidden on mobile */}
          {isClaimed && item.claimed_at && (
            <div className="hidden sm:block text-xs text-muted-foreground">
              Claimed {getTimeSinceClaimed(item.claimed_at)}
            </div>
          )}
        </div>

        {/* Right: Actions - Full width on mobile */}
        <div className="flex flex-row gap-2 sm:flex-col w-full sm:w-auto">
          <TooltipProvider delayDuration={200}>
            {/* WAITING state: Call Patient (also claims automatically) */}
            {isWaiting && !isClaimedByOther && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => onCall(item.id)}
                    disabled={isCallingPatient}
                    className="flex-1 sm:flex-none sm:min-w-[120px]"
                    title="Call the patient and claim for consultation"
                  >
                    {isCallingPatient ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        <span className="hidden sm:inline">Calling...</span>
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Call Patient</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Call the patient and claim for your consultation
                </TooltipContent>
              </Tooltip>
            )}

            {/* WAITING state: Locked by another clinician */}
            {isWaiting && isClaimedByOther && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="flex-1 sm:flex-none sm:min-w-[120px]"
                  >
                    <Lock className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Claimed</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Claimed by {item.assigned_clinician_name || item.assigned_clinician_username}
                </TooltipContent>
              </Tooltip>
            )}

            {/* CALLED state: Start Consultation or Release */}
            {isCalled && (
              <>
                {/* Start Consultation - only if claimed by me */}
                {isClaimedByMe && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        onClick={() => onStartConsultation(item.id)}
                        className="flex-1 sm:flex-none sm:min-w-[120px] bg-green-600 hover:bg-green-700"
                        title="Start the consult and open encounter documentation."
                      >
                        <Play className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Start Consultation</span>
                        <span className="sm:hidden ml-1">Start</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Start the consult and open encounter documentation.
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* If claimed by another - show disabled button with info */}
                {isClaimedByOther && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        className="flex-1 sm:flex-none sm:min-w-[120px]"
                      >
                        <Lock className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">With {item.assigned_clinician_name?.split(' ')[0] || 'Clinician'}</span>
                        <span className="sm:hidden ml-1">Busy</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Patient is with {item.assigned_clinician_name || item.assigned_clinician_username}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Release button - only if claimed by me */}
                {isClaimedByMe && onRelease && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRelease(item.id)}
                        disabled={isReleasingEncounter}
                        className="flex-1 sm:flex-none sm:min-w-[120px]"
                      >
                        {isReleasingEncounter ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          </>
                        ) : (
                          <>
                            <UserX className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Release</span>
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Release this patient for another clinician.
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Re-call button - only if claimed by me, hidden on mobile */}
                {isClaimedByMe && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCall(item.id)}
                        disabled={isCallingPatient}
                        className="hidden sm:flex sm:min-w-[120px]"
                        title="Send another call notification."
                      >
                        {isCallingPatient ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            Calling...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Re-call
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Send another call notification.
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </TooltipProvider>
        </div>
      </div>
    </Card>
  );
}

export default ConsultationQueueItem;

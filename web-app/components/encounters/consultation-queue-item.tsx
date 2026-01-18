/**
 * ConsultationQueueItem Component
 *
 * Displays a single patient in the consultation queue with:
 * - Patient info (name, MRN, age, gender)
 * - Triage status badge
 * - Wait time
 * - Action buttons (Call, Start Consultation, Re-call)
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
} from 'lucide-react';
import type { ConsultationQueueItem as QueueItemType } from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface ConsultationQueueItemProps {
  item: QueueItemType;
  onCall: (encounterId: number) => void;
  onStartConsultation: (encounterId: number) => void;
  isCallingPatient?: boolean;
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

// =============================================================================
// Component
// =============================================================================

export function ConsultationQueueItem({
  item,
  onCall,
  onStartConsultation,
  isCallingPatient = false,
}: ConsultationQueueItemProps) {
  const isWaiting = item.consultation_status === 'WAITING';
  const isCalled = item.consultation_status === 'CALLED';
  const isBypassed = item.triage_status === 'BYPASSED';
  const isDirect = item.triage_status === 'NOT_APPLICABLE';
  const isUrgent = isUrgentWaitTime(item.wait_time_minutes, item.triage_category);

  return (
    <Card
      data-testid="queue-item"
      className={cn(
        'p-4 transition-all duration-200 hover:shadow-md',
        isCalled && 'called border-blue-500 bg-blue-50 dark:bg-blue-950/20',
        isUrgent && !isCalled && 'border-orange-500'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Patient Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Patient Name */}
            <h3 className="font-semibold text-lg truncate">
              {item.patient_name}
            </h3>

            {/* Urgent indicator */}
            {isUrgent && (
              <div data-testid="urgent-indicator">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
            )}
          </div>

          {/* MRN and Demographics */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
            <span className="font-mono">{item.patient_mrn}</span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.patient_age} {item.patient_gender}
            </span>
          </div>

          {/* Chief Complaint */}
          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
            <FileText className="h-3 w-3 inline mr-1" />
            {item.chief_complaint}
          </p>

          {/* Encounter Type */}
          <div className="text-xs text-muted-foreground">
            {item.encounter_type_display}
          </div>
        </div>

        {/* Middle: Badges & Wait Time */}
        <div className="flex flex-col items-end gap-2">
          {/* Triage Badge */}
          {isBypassed ? (
            <Badge variant="secondary" className="bg-gray-200 text-gray-700">
              ⏭️ Bypassed: {getBypassReasonDisplay(item.triage_bypass_reason)}
            </Badge>
          ) : isDirect ? (
            <Badge variant="secondary" className="bg-gray-200 text-gray-700">
              ➡️ Direct
            </Badge>
          ) : item.triage_category ? (
            <Badge className={getTriageBadgeStyles(item.triage_category)}>
              {item.triage_category}
            </Badge>
          ) : null}

          {/* Called Status Badge */}
          {isCalled && (
            <Badge variant="outline" className="border-blue-500 text-blue-600">
              📣 Called
            </Badge>
          )}

          {/* Wait Time */}
          <div className={cn(
            'flex items-center gap-1 text-sm',
            isUrgent ? 'text-orange-600 font-medium' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3" />
            {formatWaitTime(item.wait_time_minutes)}
          </div>

          {/* Time since called */}
          {isCalled && item.called_at && (
            <div className="text-xs text-blue-600">
              {getTimeSinceCalled(item.called_at)}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col gap-2">
          <TooltipProvider delayDuration={200}>
            {isWaiting && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => onCall(item.id)}
                    disabled={isCallingPatient}
                    className="min-w-[120px]"
                    title="Mark as called and notify the patient/waiting area."
                  >
                    {isCallingPatient ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        Calling...
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4 mr-1" />
                        Call Patient
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Mark as called and notify the patient/waiting area.
                </TooltipContent>
              </Tooltip>
            )}

            {isCalled && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => onStartConsultation(item.id)}
                      className="min-w-[120px] bg-green-600 hover:bg-green-700"
                      title="Start the consult and open encounter documentation."
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start Consultation
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Start the consult and open encounter documentation.
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCall(item.id)}
                      disabled={isCallingPatient}
                      className="min-w-[120px]"
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
              </>
            )}
          </TooltipProvider>
        </div>
      </div>
    </Card>
  );
}

export default ConsultationQueueItem;

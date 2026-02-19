/**
 * Clinic Queue Mobile Card Component
 *
 * Mobile-optimized card layout for queue entries.
 */
'use client';

import { Clock, Phone, Play, MoreHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClinicPriorityBadge } from './clinic-priority-badge';
import { ClinicVisitStatusBadge } from './clinic-visit-status-badge';
import type { ClinicVisit } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

interface ClinicQueueMobileCardProps {
  visit: ClinicVisit;
  waitTime: string;
  showActions?: boolean;
  isPending?: boolean;
  onCall: (visit: ClinicVisit) => void;
  onStart: (visit: ClinicVisit) => void;
  onMenuOpen: (visit: ClinicVisit) => void;
}

export function ClinicQueueMobileCard({
  visit,
  waitTime,
  showActions = true,
  isPending = false,
  onCall,
  onStart,
  onMenuOpen,
}: ClinicQueueMobileCardProps) {
  const canCall = visit.status === 'REGISTERED' || visit.status === 'WAITING';
  const canStart = visit.status === 'CALLED';

  return (
    <Card
      className={cn(
        'p-3',
        visit.status === 'CALLED' && 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
        visit.priority === 'EMERGENCY' && 'border-red-500 bg-red-50 dark:bg-red-950/20'
      )}
    >
      {/* Header: Queue # + Patient Name + Priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold text-muted-foreground shrink-0">
            #{visit.queue_number}
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">{visit.patient.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {visit.patient.mrn} • {visit.patient.age ? `${visit.patient.age}y` : ''} {visit.patient.gender}
            </p>
          </div>
        </div>
        <ClinicPriorityBadge priority={visit.priority} size="sm" />
      </div>

      {/* Status + Wait Time */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <ClinicVisitStatusBadge
          status={visit.status}
          statusDisplay={visit.status_display}
        />
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{waitTime}</span>
        </div>
      </div>

      {/* Chief Complaint */}
      {(visit.chief_complaint || visit.notes) && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {visit.chief_complaint || visit.notes}
        </p>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-2">
          {canCall && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCall(visit);
              }}
              disabled={isPending}
              className="flex-1"
            >
              <Phone className="h-3 w-3 mr-1" />
              Call
            </Button>
          )}
          {canStart && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onStart(visit);
              }}
              disabled={isPending}
              className="flex-1"
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onMenuOpen(visit);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}

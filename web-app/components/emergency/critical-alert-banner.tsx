/**
 * Critical Alert Banner Component
 *
 * Displays a prominent alert when RED category patients are in the ER queue.
 * Shows patient details with direct links to view them.
 *
 * Features:
 * - Toggle between list and grid views
 * - Visual alert header with subtle styling
 * - Patient cards with wait times
 * - Click-to-view functionality
 */
'use client';

import { AlertTriangle, Clock, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { cn } from '@/lib/utils/cn';

/**
 * Critical patient data for the alert banner.
 * Compatible with both API response and WebSocket data.
 */
export interface CriticalPatientInfo {
  /** Triage assessment ID - used for routing to /triage/[id] */
  id: number;
  /** Queue entry ID */
  queue_id?: number;
  /** Encounter ID for routing to /encounters/[id] */
  encounter_id?: number;
  /** Encounter status: CREATED, IN_PROGRESS, CLOSED, CANCELLED */
  encounter_status?: string;
  patient_name: string;
  mrn: string;
  chief_complaint: string;
  assigned_area: string;
  assigned_area_display: string;
  wait_minutes: number;
  arrival_time: string;
  status: string;
}

interface CriticalAlertBannerProps {
  patients: CriticalPatientInfo[];
  onViewPatient?: (patient: CriticalPatientInfo) => void;
  dismissible?: boolean;
  className?: string;
}

/**
 * Get initials from patient name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Format wait time for display
 */
function formatWaitTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function CriticalAlertBanner({
  patients,
  onViewPatient,
  dismissible = false,
  className,
}: CriticalAlertBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  if (patients.length === 0 || isDismissed) {
    return null;
  }

  return (
    <Card className={cn('border-destructive/50', className)}>
      {/* Alert Header */}
      <CardHeader className="pb-3 bg-destructive/10 border-b border-destructive/20">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive text-base font-semibold">
            <AlertTriangle className="h-5 w-5" />
            CRITICAL: {patients.length} RED patient{patients.length > 1 ? 's' : ''} waiting
          </CardTitle>
          <div className="flex items-center gap-2">
            <ViewToggle value={viewMode} onChange={setViewMode} />
            {dismissible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {viewMode === 'list' ? (
          /* List View */
          <div className="space-y-2">
            {patients.map((patient) => (
              <div
                key={patient.id}
                className={cn(
                  'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
                  'p-3 rounded-md bg-muted/50 border'
                )}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="font-medium">{patient.patient_name}</span>
                  <Badge variant="outline" className="w-fit text-xs">
                    {patient.mrn}
                  </Badge>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {patient.chief_complaint || 'No complaint recorded'}
                  </span>
                  <Badge variant="destructive" className="w-fit">
                    {patient.assigned_area_display}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">{formatWaitTime(patient.wait_minutes)}</span>
                  </div>
                  {onViewPatient && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewPatient(patient)}
                      className="shrink-0"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid View */
          <EntityGrid>
            {patients.map((patient) => (
              <EntityCard
                key={patient.id}
                title={patient.patient_name}
                subtitle={patient.mrn}
                initials={getInitials(patient.patient_name)}
                status={{
                  label: 'RED',
                  variant: 'destructive',
                }}
                badges={[
                  {
                    label: patient.assigned_area_display,
                    variant: 'outline',
                  },
                ]}
                metadata={[
                  {
                    icon: <Clock className="h-3 w-3" />,
                    label: 'Waiting',
                    value: formatWaitTime(patient.wait_minutes),
                  },
                  {
                    label: 'Complaint',
                    value: patient.chief_complaint || 'None',
                  },
                ]}
                onClick={onViewPatient ? () => onViewPatient(patient) : undefined}
              />
            ))}
          </EntityGrid>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Critical Alert Banner Component
 *
 * Displays a prominent alert when RED category patients are in the ER queue.
 * Shows patient details with direct links to view them.
 *
 * Features:
 * - Sticky positioning at top of ER pages
 * - Visual alert with pulsing animation
 * - Patient list with wait times
 * - Click-to-view functionality
 */
'use client';

import { AlertTriangle, Clock, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

/**
 * Critical patient data for the alert banner.
 * Compatible with both API response and WebSocket data.
 */
export interface CriticalPatientInfo {
  id: number;
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
  onViewPatient?: (patientId: number) => void;
  dismissible?: boolean;
  className?: string;
}

export function CriticalAlertBanner({
  patients,
  onViewPatient,
  dismissible = false,
  className,
}: CriticalAlertBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (patients.length === 0 || isDismissed) {
    return null;
  }

  return (
    <Alert
      variant="destructive"
      className={cn(
        'border-red-500 dark:border-red-700 bg-red-50 dark:bg-red-950/50',
        'animate-pulse-slow', // Custom animation defined in globals.css
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 text-red-600 dark:text-red-400" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <AlertTitle className="text-red-700 dark:text-red-300 font-semibold">
              ⚠️ CRITICAL ALERT: {patients.length} RED patient{patients.length > 1 ? 's' : ''} waiting
            </AlertTitle>
            {dismissible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mr-2 -mt-1"
                onClick={() => setIsDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <AlertDescription>
            <div className="space-y-2">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  className={cn(
                    'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
                    'p-2 rounded-md bg-white/50 dark:bg-white/5',
                    'border border-red-200 dark:border-red-800'
                  )}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="font-medium text-red-700 dark:text-red-300">
                      {patient.patient_name}
                    </span>
                    <Badge variant="outline" className="w-fit text-xs">
                      {patient.mrn}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {patient.chief_complaint || 'No complaint recorded'}
                    </span>
                    <Badge className="w-fit bg-red-600 text-white">
                      {patient.assigned_area_display}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">
                        Waiting {patient.wait_minutes} min
                      </span>
                    </div>
                    {onViewPatient && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onViewPatient(patient.id)}
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
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

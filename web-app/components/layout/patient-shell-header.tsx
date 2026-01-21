/**
 * Patient Shell Header Component
 *
 * Displays a read-only patient identity banner that persists across routes.
 * Shows patient demographics, verification status, and encounter info when available.
 *
 * Key Features:
 * - READ-ONLY: No edit functionality in this component
 * - Patient identity: MRN, name, DOB, gender, age
 * - Verification badges: CR verified, SHA member
 * - Sensitive indicator: For protected patient records
 * - Encounter info: Shows type, status, chief complaint when in encounter context
 *
 * Usage:
 * ```tsx
 * <PatientProvider patientId={1}>
 *   <PatientShellHeader />
 *   <PatientContent />
 * </PatientProvider>
 * ```
 */
'use client';

import React from 'react';
import { usePatientContext } from '@/lib/context/patient-context';
import { useOptionalEncounterContext } from '@/lib/context/encounter-context';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Stethoscope,
  FileText,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { calculateAge, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

// =============================================================================
// Types
// =============================================================================

interface PatientShellHeaderProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether to show a compact version */
  compact?: boolean;
}

// =============================================================================
// Gender Display Helper
// =============================================================================

const GENDER_LABELS: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
};

// =============================================================================
// Component
// =============================================================================

export function PatientShellHeader({ className, compact = false }: PatientShellHeaderProps) {
  const { patient, isLoading, error, isVerified, hasSHA, isSensitive } = usePatientContext();
  const encounterContext = useOptionalEncounterContext();

  // Loading state
  if (isLoading) {
    return (
      <header
        data-testid="patient-shell-loading"
        className={cn(
          'w-full min-h-14 md:h-16 bg-card border-b px-3 md:px-4 py-2 md:py-0 flex items-center',
          className
        )}
        role="banner"
        aria-label="Patient information loading"
      >
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </header>
    );
  }

  // Error state
  if (error || !patient) {
    return (
      <header
        className={cn(
          'w-full min-h-14 md:h-16 bg-destructive/10 border-b border-destructive/20 px-3 md:px-4 py-2 md:py-0 flex items-center',
          className
        )}
        role="alert"
        aria-label="Patient information error"
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>{error?.message || 'Failed to load patient information'}</span>
        </div>
      </header>
    );
  }

  // Calculate age
  const age = patient.date_of_birth ? calculateAge(patient.date_of_birth) : null;
  const genderLabel = GENDER_LABELS[patient.gender] || patient.gender;

  return (
    <header
      className={cn(
        'w-full min-h-14 md:h-16 bg-card border-b px-3 md:px-4 py-2 md:py-0 sticky top-0 z-30 flex items-center',
        isSensitive && 'border-l-4 border-l-destructive',
        className
      )}
      role="banner"
      aria-label="Patient information"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-4 w-full">
        {/* Patient Identity Section */}
        <div className="flex items-center gap-4">
          {/* Avatar placeholder */}
          <div className={cn(
            'flex items-center justify-center rounded-full bg-muted shrink-0',
            compact ? 'h-8 w-8' : 'h-8 w-8 md:h-10 md:w-10'
          )}>
            <User className={cn(compact ? 'h-4 w-4' : 'h-4 w-4 md:h-5 md:w-5', 'text-muted-foreground')} />
          </div>

          {/* Name and MRN */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
              <h2 className={cn(
                'font-semibold truncate',
                compact ? 'text-sm' : 'text-sm md:text-base'
              )}>
                {patient.first_name} {patient.last_name}
              </h2>

              {/* Verification Badges - Only show when patient data is confirmed loaded */}
              {isVerified && patient?.cr_number && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  CR Verified
                </Badge>
              )}
              {hasSHA && patient?.sha_number && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 px-1.5">
                  <SHALogo size="sm" />
                </Badge>
              )}
              {isSensitive && patient?.is_sensitive && (
                <Badge
                  variant="destructive"
                  className="text-xs"
                  aria-label="Sensitive patient record - restricted access"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Sensitive
                </Badge>
              )}
            </div>

            {/* Demographics Row */}
            <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-0.5 text-xs md:text-sm text-muted-foreground mt-0.5">
              <span className="font-mono">{patient.mrn}</span>
              <span className="hidden sm:inline text-muted-foreground/50">•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span className="hidden sm:inline">{formatDate(patient.date_of_birth)}</span>
                <span className="sm:hidden">{age !== null ? `${age}y` : ''}</span>
              </span>
              {age !== null && (
                <span className="hidden sm:inline">
                  <span className="text-muted-foreground/50 mr-2 md:mr-3">•</span>
                  {age} yrs
                </span>
              )}
              <span className="text-muted-foreground/50">•</span>
              <span>{genderLabel}</span>
            </div>
          </div>
        </div>

        {/* Encounter Section (when in encounter context) - hidden on mobile */}
        {encounterContext?.encounter && (
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {encounterContext.encounter.encounter_type === 'OPD' ? 'Outpatient' :
                     encounterContext.encounter.encounter_type === 'IPD' ? 'Inpatient' :
                     encounterContext.encounter.encounter_type === 'EMERGENCY' ? 'Emergency' :
                     encounterContext.encounter.encounter_type}
                  </span>
                  <Badge
                    variant={encounterContext.isActiveEncounter ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {encounterContext.encounter.status === 'IN_PROGRESS' ? 'In Progress' :
                     encounterContext.encounter.status === 'DRAFT' ? 'Draft' :
                     encounterContext.encounter.status === 'COMPLETED' ? 'Completed' :
                     encounterContext.encounter.status}
                  </Badge>
                </div>
                {encounterContext.encounter.chief_complaint && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <FileText className="h-3 w-3" />
                    <span className="truncate max-w-[200px]">
                      {encounterContext.encounter.chief_complaint}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default PatientShellHeader;

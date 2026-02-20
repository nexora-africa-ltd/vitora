/**
 * Triage Assess Layout
 *
 * Wraps all /triage/assess/[patientId]/[encounterId]/* routes with
 * PatientProvider and EncounterProvider.
 *
 * Flow:
 * 1. Validate patientId and encounterId from params
 * 2. Wrap with PatientProvider for patient context
 * 3. Wrap with EncounterProvider for encounter context
 * 4. Display compact PatientShellHeader with patient/encounter info
 * 5. Display TriageAssessTabs for tab navigation
 *
 * Usage:
 * - Automatically applied to all routes under /triage/assess/[patientId]/[encounterId]/
 * - Children have access to both usePatientContext() and useEncounterContext()
 */
'use client';

import { useParams } from 'next/navigation';
import { PatientProvider } from '@/lib/context/patient-context';
import { EncounterProvider, useEncounterContext } from '@/lib/context/encounter-context';
import { PatientShellHeader } from '@/components/layout/patient-shell-header';
import { TriageAssessTabs } from '@/components/triage/triage-assess-tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// =============================================================================
// Error Component
// =============================================================================

function TriageLayoutError({ message }: { message: string }) {
  return (
    <div className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href="/triage">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Triage Queue
          </Link>
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Component
// =============================================================================

function TriageLayoutLoading() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-card border-b px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-full" />
          <div className="space-y-1.5 sm:space-y-2">
            <Skeleton className="h-4 w-24 sm:w-32" />
            <Skeleton className="h-3 w-36 sm:w-48" />
          </div>
        </div>
      </header>
      {/* Tab skeleton */}
      <div className="border-b px-4 py-2">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <Skeleton className="h-6 w-48 sm:h-8 sm:w-64 mb-4" />
        <Skeleton className="h-48 sm:h-64 w-full" />
      </main>
    </div>
  );
}

// =============================================================================
// Layout Content (wrapped in providers)
// =============================================================================

function TriageLayoutContent({ children }: { children: React.ReactNode }) {
  const { error, isLoading } = useEncounterContext();

  if (isLoading) {
    return <TriageLayoutLoading />;
  }

  if (error) {
    return <TriageLayoutError message={error.message} />;
  }

  return (
    <div className="flex flex-col min-h-full -m-4 md:-m-6 lg:-m-8">
      <PatientShellHeader compact />
      <TriageAssessTabs />
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

// =============================================================================
// Main Layout
// =============================================================================

export default function TriageAssessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const patientIdParam = params.patientId;
  const encounterIdParam = params.encounterId;

  // Validate IDs from params
  const patientId =
    typeof patientIdParam === 'string' ? parseInt(patientIdParam, 10) : null;
  const encounterId =
    typeof encounterIdParam === 'string' ? parseInt(encounterIdParam, 10) : null;

  const isValidPatientId =
    patientId !== null && !isNaN(patientId) && patientId > 0;
  const isValidEncounterId =
    encounterId !== null && !isNaN(encounterId) && encounterId > 0;

  // Invalid patient ID
  if (!isValidPatientId) {
    return (
      <TriageLayoutError message="Invalid patient ID. Please select a patient from the triage queue." />
    );
  }

  // Invalid encounter ID
  if (!isValidEncounterId) {
    return (
      <TriageLayoutError message="Invalid encounter ID. Please select a valid encounter." />
    );
  }

  return (
    <PatientProvider patientId={patientId}>
      <EncounterProvider encounterId={encounterId}>
        <TriageLayoutContent>{children}</TriageLayoutContent>
      </EncounterProvider>
    </PatientProvider>
  );
}

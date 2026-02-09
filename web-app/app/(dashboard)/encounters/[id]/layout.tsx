/**
 * Encounter Shell Layout
 *
 * Wraps all /encounters/[id]/* routes with PatientProvider and EncounterProvider.
 * Derives patientId from the encounter data, ensuring proper context hierarchy.
 *
 * Flow:
 * 1. Fetch encounter to get patientId
 * 2. Wrap with PatientProvider using derived patientId
 * 3. Wrap with EncounterProvider for encounter-specific context
 * 4. Display PatientShellHeader with encounter info
 *
 * Usage:
 * - Automatically applied to all routes under /encounters/[id]/
 * - Children have access to both usePatientContext() and useEncounterContext()
 * - PatientShellHeader displays patient identity + encounter info
 */
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { encountersApi } from '@/lib/api/encounters';
import { PatientProvider } from '@/lib/context/patient-context';
import { EncounterProvider, useEncounterContext } from '@/lib/context/encounter-context';
import { PatientShellHeader } from '@/components/layout/patient-shell-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// =============================================================================
// Error Component
// =============================================================================

function EncounterLayoutError({ message }: { message: string }) {
  return (
    <div className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href="/encounters">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Encounters
          </Link>
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Component
// =============================================================================

function EncounterLayoutLoading() {
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

function EncounterLayoutContent({ children }: { children: React.ReactNode }) {
  const { error } = useEncounterContext();

  if (error) {
    return <EncounterLayoutError message={error.message} />;
  }

  return (
    <div className="flex flex-col min-h-full -m-4 md:-m-6 lg:-m-8">
      <PatientShellHeader />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}

// =============================================================================
// Main Layout
// =============================================================================

export default function EncounterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const idParam = params.id;

  // Validate encounterId from params
  const encounterId = typeof idParam === 'string' ? parseInt(idParam, 10) : null;
  const isValidId = encounterId !== null && !isNaN(encounterId) && encounterId > 0;

  // Fetch encounter to get patientId (lightweight query just for routing)
  const {
    data: encounter,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['encounter-layout', encounterId],
    queryFn: () => encountersApi.get(encounterId!),
    enabled: isValidId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Invalid ID
  if (!isValidId) {
    return <EncounterLayoutError message="Invalid encounter ID. Please select a valid encounter." />;
  }

  // Loading state
  if (isLoading) {
    return <EncounterLayoutLoading />;
  }

  // Fetch error
  if (error || !encounter) {
    return <EncounterLayoutError message={error?.message || 'Encounter not found'} />;
  }

  // Derive patientId from encounter
  const patientId = encounter.patient;

  if (!patientId) {
    return <EncounterLayoutError message="Encounter has no associated patient" />;
  }

  return (
    <PatientProvider patientId={patientId}>
      <EncounterProvider encounterId={encounterId}>
        <EncounterLayoutContent>
          {children}
        </EncounterLayoutContent>
      </EncounterProvider>
    </PatientProvider>
  );
}

/**
 * New Encounter Flow Layout
 *
 * Wraps all /encounters/new/* routes with:
 * - NewEncounterTabs for step navigation
 * - Store session initialization
 * - Draft recovery handling
 *
 * URL Structure:
 * - /encounters/new          → Redirects to /patient
 * - /encounters/new/patient  → Step 1: Select patient
 * - /encounters/new/details  → Step 2: Encounter type, chief complaint
 * - /encounters/new/history  → Step 3: Medical history (optional)
 * - /encounters/new/notes    → Step 4: Clinical notes (optional)
 * - /encounters/new/diagnosis → Step 5: Diagnoses (optional)
 * - /encounters/new/review   → Step 6: Summary and create
 */
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NewEncounterTabs } from '@/components/encounters/new-encounter-tabs';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import { usePatient } from '@/lib/hooks/use-patients';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { useToast } from '@/lib/hooks/use-toast';
import { usePermissions } from '@/lib/hooks/use-permissions';

// =============================================================================
// Layout Content
// =============================================================================

export default function NewEncounterLayout({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreateEncounter = hasPermission('encounters.add_encounter');
  const patientIdParam = searchParams.get('patient');

  const { initSession, hasSession, getSession, setPatient, clearSession, isDirtyState } =
    useNewEncounterStore();

  const [didNotifyDraftRecovery, setDidNotifyDraftRecovery] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Check if we have a pre-selected patient from URL
  const { data: prefetchedPatient } = usePatient(patientIdParam || '');

  // Initialize or recover session
  useEffect(() => {
    if (!canCreateEncounter) {
      return;
    }

    const session = getSession();

    if (session) {
      // Session exists - auto-recover unsaved draft without prompting
      if (session.isDirty && !didNotifyDraftRecovery) {
        toast({
          title: 'Draft Restored',
          description: 'Recovered your unsaved encounter draft automatically.',
        });
        setDidNotifyDraftRecovery(true);
      }
    } else {
      // No session - create new one
      initSession();
    }

    setIsInitialized(true);
  }, [canCreateEncounter, getSession, initSession, isInitialized, didNotifyDraftRecovery, toast]);

  // Set prefetched patient if provided in URL
  useEffect(() => {
    if (!canCreateEncounter) {
      return;
    }

    if (prefetchedPatient && isInitialized) {
      const session = getSession();
      if (session && !session.patientId) {
        setPatient(prefetchedPatient.id, prefetchedPatient);
      }
    }
  }, [canCreateEncounter, prefetchedPatient, isInitialized, getSession, setPatient]);

  const isDirty = isDirtyState();
  const session = getSession();

  const handleStartFresh = () => {
    clearSession();
    initSession();
    if (prefetchedPatient) {
      setPatient(prefetchedPatient.id, prefetchedPatient);
    }
    setDidNotifyDraftRecovery(false);
    toast({
      title: 'Started fresh',
      description: 'Unsaved draft cleared. You can begin a new encounter.',
    });
  };

  if (!canCreateEncounter) {
    return (
      <div className="p-4 sm:p-6">
        <Alert>
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>You do not have permission to create encounters.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-3 py-3 sm:px-4 sm:py-4">
        <PageHeader
          title="New Encounter"
          helpContent="Create a new patient encounter. Follow the steps to select a patient, enter encounter details, and optionally add medical history and diagnoses."
          actions={
            isDirty ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Clock className="h-3 w-3" />
                  <span className="hidden sm:inline">Unsaved changes</span>
                  <span className="sm:hidden">Unsaved</span>
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleStartFresh}
                  className="h-8"
                >
                  Start fresh
                </Button>
              </div>
            ) : null
          }
        />

        {/* Patient context info */}
        {session?.patientData && (
          <div className="mt-2 text-sm text-muted-foreground">
            Patient:{' '}
            <span className="font-medium text-foreground">
              {session.patientData.first_name} {session.patientData.last_name}
            </span>
            <span className="ml-2 text-xs">({session.patientData.mrn})</span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <NewEncounterTabs />

      {/* Step Content */}
      <main className="flex-1 bg-muted/30 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

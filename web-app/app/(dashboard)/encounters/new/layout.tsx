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
 * - /encounters/new/diagnosis → Step 5: ICD-10 diagnoses (optional)
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
import { RotateCcw, X, Clock } from 'lucide-react';
import { useToast } from '@/lib/hooks/use-toast';

// =============================================================================
// Layout Content
// =============================================================================

export default function NewEncounterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const patientIdParam = searchParams.get('patient');

  const {
    initSession,
    hasSession,
    getSession,
    setPatient,
    clearSession,
    isDirtyState,
  } = useNewEncounterStore();

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Check if we have a pre-selected patient from URL
  const { data: prefetchedPatient } = usePatient(patientIdParam || '');

  // Initialize or recover session
  useEffect(() => {
    const session = getSession();

    if (session) {
      // Session exists - check if it's a draft we should prompt to recover
      if (session.isDirty && !isInitialized) {
        setShowDraftBanner(true);
      }
    } else {
      // No session - create new one
      initSession();
    }

    setIsInitialized(true);
  }, [getSession, initSession, isInitialized]);

  // Set prefetched patient if provided in URL
  useEffect(() => {
    if (prefetchedPatient && isInitialized) {
      const session = getSession();
      if (session && !session.patientId) {
        setPatient(prefetchedPatient.id, prefetchedPatient);
      }
    }
  }, [prefetchedPatient, isInitialized, getSession, setPatient]);

  // Handle draft recovery
  const handleRecoverDraft = () => {
    setShowDraftBanner(false);
    toast({
      title: 'Draft Recovered',
      description: 'Your previous work has been restored.',
    });
  };

  // Handle draft discard
  const handleDiscardDraft = () => {
    clearSession();
    initSession();
    setShowDraftBanner(false);
    toast({
      title: 'Draft Discarded',
      description: 'Starting fresh.',
    });
  };

  const isDirty = isDirtyState();
  const session = getSession();

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-background border-b px-3 py-3 sm:px-4 sm:py-4">
        <PageHeader
          title="New Encounter"
          helpContent="Create a new patient encounter. Follow the steps to select a patient, enter encounter details, and optionally add medical history and diagnoses."
          actions={
            isDirty ? (
              <Badge variant="secondary" className="gap-1 shrink-0">
                <Clock className="h-3 w-3" />
                <span className="hidden sm:inline">Unsaved changes</span>
                <span className="sm:hidden">Unsaved</span>
              </Badge>
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

      {/* Draft Recovery Banner */}
      {showDraftBanner && (
        <div className="px-3 py-3 sm:px-4">
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <RotateCcw className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">
              Unsaved Draft Found
            </AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              You have an unsaved draft from a previous session. Would you like to recover it?
              <div className="flex flex-col gap-2 mt-3 sm:flex-row">
                <Button
                  size="sm"
                  onClick={handleRecoverDraft}
                  className="w-full sm:w-auto"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Recover Draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDiscardDraft}
                  className="w-full sm:w-auto"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Discard
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Tab Navigation */}
      <NewEncounterTabs />

      {/* Step Content */}
      <main className="flex-1 bg-muted/30 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

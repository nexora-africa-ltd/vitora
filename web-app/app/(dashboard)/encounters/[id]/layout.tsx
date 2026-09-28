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

import { useEffect } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { encountersApi } from '@/lib/api/encounters';
import { PatientProvider, usePatientContext } from '@/lib/context/patient-context';
import { EncounterProvider, useEncounterContext } from '@/lib/context/encounter-context';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { calculateAge } from '@/lib/utils/format';
import { parseBPAndCalculateMAP } from '@/lib/vitals';
import { PatientShellHeader } from '@/components/layout/patient-shell-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useEncounterWorkspaceStore } from '@/lib/stores/ui-store';
import { isDesktop } from '@/lib/desktop';
import { AlertTriangle, ArrowLeft, X } from 'lucide-react';
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
            <ArrowLeft className="mr-2 h-4 w-4" />
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
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <Skeleton className="h-8 w-8 rounded-full sm:h-10 sm:w-10" />
          <div className="space-y-1.5 sm:space-y-2">
            <Skeleton className="h-4 w-24 sm:w-32" />
            <Skeleton className="h-3 w-36 sm:w-48" />
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <Skeleton className="mb-4 h-6 w-48 sm:h-8 sm:w-64" />
        <Skeleton className="h-48 w-full sm:h-64" />
      </main>
    </div>
  );
}

// =============================================================================
// Layout Content (wrapped in providers)
// =============================================================================

function EncounterLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { encounter, error } = useEncounterContext();
  const { patient } = usePatientContext();
  const chatCtx = useOptionalAIChatContext();
  const tabs = useEncounterWorkspaceStore((state) => state.tabs);
  const activeEncounterId = useEncounterWorkspaceStore((state) => state.activeEncounterId);
  const upsertFromRoute = useEncounterWorkspaceStore((state) => state.upsertFromRoute);
  const setActiveWorkspaceTab = useEncounterWorkspaceStore((state) => state.setActive);
  const closeWorkspaceTab = useEncounterWorkspaceStore((state) => state.closeTab);
  const closeOtherWorkspaceTabs = useEncounterWorkspaceStore((state) => state.closeOthers);
  const closeAllWorkspaceTabs = useEncounterWorkspaceStore((state) => state.closeAll);
  const getNextAfterClose = useEncounterWorkspaceStore((state) => state.getNextAfterClose);
  const editSessions = useEncounterEditStore((state) => state.sessions);
  // Extract the stable callback to avoid depending on the entire context object,
  // which changes reference whenever state updates (infinite loop).
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;

  const queryString = searchParams.toString();
  const currentRoute = queryString ? `${pathname}?${queryString}` : pathname;

  const desktopMode = isDesktop();

  useEffect(() => {
    if (!desktopMode || !encounter) {
      return;
    }

    upsertFromRoute({
      encounterId: encounter.id,
      title: encounter.patient_name || `Encounter ${encounter.id}`,
      subtitle: encounter.patient_mrn || encounter.encounter_type,
      status: encounter.status,
      route: currentRoute,
    });
  }, [desktopMode, encounter, currentRoute, upsertFromRoute]);

  // Wire encounter + patient data into the AI chat context so TibaBot
  // can provide encounter-aware clinical assistance.
  useEffect(() => {
    if (!setEncounterAwareContext) return;

    if (patient && encounter) {
      const allergies =
        encounter.allergies
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
      const comorbidities =
        encounter.chronic_conditions
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
      const currentMeds =
        encounter.current_medications
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];

      setEncounterAwareContext(
        {
          patient_age: calculateAge(patient.date_of_birth),
          patient_sex: patient.gender,
          allergies,
          comorbidities,
          current_medications: currentMeds,
        },
        {
          chief_complaint: encounter.chief_complaint ?? undefined,
          vitals: {
            spo2: encounter.spo2 != null ? Number(encounter.spo2) : undefined,
            pulse: encounter.pulse ?? undefined,
            temperature: encounter.temperature != null ? Number(encounter.temperature) : undefined,
            rr: encounter.respiratory_rate ?? undefined,
            map: parseBPAndCalculateMAP(encounter.blood_pressure) ?? undefined,
          },
        }
      );
    }

    // Clear encounter context when navigating away
    return () => {
      setEncounterAwareContext(null, null);
    };
  }, [patient, encounter, setEncounterAwareContext]);

  if (error) {
    return <EncounterLayoutError message={error.message} />;
  }

  const handleActivateTab = (encounterId: number, route: string) => {
    setActiveWorkspaceTab(encounterId);
    router.push(route);
  };

  const handleCloseTab = (encounterId: number) => {
    const isClosingActive = activeEncounterId === encounterId;
    const nextEncounterId = isClosingActive ? getNextAfterClose(encounterId) : null;
    const nextRoute =
      nextEncounterId !== null
        ? tabs.find((tab) => tab.encounterId === nextEncounterId)?.lastRoute ||
          `/encounters/${nextEncounterId}`
        : '/encounters';

    closeWorkspaceTab(encounterId);

    if (isClosingActive) {
      router.push(nextRoute);
    }
  };

  return (
    <div className="-m-4 flex min-h-full flex-col md:-m-6 lg:-m-8">
      <PatientShellHeader />
      {desktopMode && tabs.length > 0 && (
        <div className="border-b bg-card px-2 py-1.5 sm:px-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = tab.encounterId === activeEncounterId;
              const isDirty = !!editSessions[tab.encounterId]?.isDirty;
              return (
                <div
                  key={tab.encounterId}
                  className={`group flex max-w-[260px] shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition-colors sm:text-sm ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleActivateTab(tab.encounterId, tab.lastRoute)}
                    className="min-w-0 flex-1 text-left"
                  >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tab.title}</p>
                    {tab.subtitle && (
                      <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                        {tab.subtitle}
                      </p>
                    )}
                  </div>
                  {isDirty && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      Unsaved
                    </Badge>
                  )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCloseTab(tab.encounterId);
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                    aria-label={`Close encounter ${tab.encounterId} tab`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
              {activeEncounterId !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => closeOtherWorkspaceTabs(activeEncounterId)}
                >
                  Close Others
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  closeAllWorkspaceTabs();
                  router.push('/encounters');
                }}
              >
                Close All
              </Button>
            </div>
          </div>
        </div>
      )}
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

// =============================================================================
// Main Layout
// =============================================================================

export default function EncounterLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const encounterId = typeof params.id === 'string' ? params.id : null;
  const isValidId = !!encounterId && /^\d+$/.test(encounterId);

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
    return (
      <EncounterLayoutError message="Invalid encounter ID. Please select a valid encounter." />
    );
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
        <EncounterLayoutContent>{children}</EncounterLayoutContent>
      </EncounterProvider>
    </PatientProvider>
  );
}

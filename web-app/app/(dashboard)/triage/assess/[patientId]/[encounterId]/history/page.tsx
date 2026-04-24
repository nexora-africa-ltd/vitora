/**
 * Triage Assess - History Tab
 *
 * Second step in triage assessment workflow.
 * Displays patient's clinical history snapshot (read-only) from past visits and shared health records.
 * Patient history data entry is a clinician/consultation responsibility, not triage.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/history
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Calendar, History, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { FloatingPeekPanel, type PeekPanelState } from '@/components/shared/floating-peek-panel';
import { EncounterPeekContent } from '@/components/encounters/encounter-peek-content';
import { ClinicalSnapshotBanner } from '@/components/encounters/clinical-snapshot-banner';
import { usePatientContext } from '@/lib/context/patient-context';
import { usePatientEncounters } from '@/lib/hooks/use-patients';
import { useTriageAssessHistoryAvailability } from '@/lib/hooks/use-triage-assess-history-availability';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { formatDate } from '@/lib/utils/format';
import type { PatientEncounter } from '@/lib/types/patient';
import { ENCOUNTER_TYPES } from '@/lib/utils/constants';

// =============================================================================
// Past Encounter Card Component (Clickable)
// =============================================================================

function PastEncounterCard({ encounter, onSelect }: { encounter: PatientEncounter; onSelect: (enc: PatientEncounter) => void }) {
  const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);
  return (
    <button
      type="button"
      onClick={() => onSelect(encounter)}
      className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 hover:border-teal-500/30 transition-colors group w-full text-left"
    >
      <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{formatDate(encounter.encounter_date)}</span>
          <Badge variant="outline" className="text-xs">
            {type?.label || encounter.encounter_type}
          </Badge>
          <Badge variant="secondary" className="text-xs">{encounter.status}</Badge>
        </div>
        {encounter.chief_complaint && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {encounter.chief_complaint}
          </p>
        )}
      </div>
      <Stethoscope className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
    </button>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function TriageHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const { isLoading: isPatientLoading } = usePatientContext();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;
  const patientIdNum = parseInt(patientId, 10);
  const encounterIdNum = parseInt(encounterId, 10);
  const { showHistoryStep, isLoading: isHistoryAvailabilityLoading } = useTriageAssessHistoryAvailability(patientIdNum, encounterIdNum);

  const { markSectionComplete, markSectionVisited } = useTriageAssessStore();

  // Floating encounter peek state
  const [peekState, setPeekState] = useState<PeekPanelState>('closed');
  const [peekEncounter, setPeekEncounter] = useState<PatientEncounter | null>(null);

  const handleSelectEncounter = useCallback((enc: PatientEncounter) => {
    setPeekEncounter(enc);
    setPeekState('open');
  }, []);

  // Mark history as visited when leaving the tab
  useEffect(() => {
    return () => {
      markSectionVisited(encounterIdNum, 'history');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterIdNum]);

  // Fetch patient's past encounters
  const { data: encountersData, isLoading: isEncountersLoading } = usePatientEncounters(patientIdNum);

  // Filter out current encounter from history (limit to 5 most recent)
  const pastEncounters = (encountersData || [])
    .filter((e) => e.id !== encounterIdNum)
    .slice(0, 5);

  useEffect(() => {
    if (!isHistoryAvailabilityLoading && !showHistoryStep) {
      router.replace(`/triage/assess/${patientId}/${encounterId}/assessment`);
    }
  }, [isHistoryAvailabilityLoading, showHistoryStep, router, patientId, encounterId]);

  const handleContinue = useCallback(() => {
    // History is read-only in triage — mark as reviewed when user proceeds
    markSectionComplete(parseInt(encounterId, 10), 'history');
    router.push(`/triage/assess/${patientId}/${encounterId}/assessment`);
  }, [router, patientId, encounterId, markSectionComplete]);

  const handleBack = useCallback(() => {
    router.push(`/triage/assess/${patientId}/${encounterId}/vitals`);
  }, [router, patientId, encounterId]);

  // Loading state
  if (isPatientLoading || isHistoryAvailabilityLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Patient History</h2>
          <HelpPopover content="Review patient's medical history from past visits and shared health records. This data is read-only during triage — detailed history collection is done during clinical consultation." />
        </div>
        <Badge variant="secondary">Step 2 of 4</Badge>
      </div>

      {/* Clinical Snapshot Banner (read-only) */}
      <ClinicalSnapshotBanner encounterId={parseInt(encounterId, 10)} />

      {/* Past Encounters Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Recent Encounters</CardTitle>
          </div>
          <CardDescription>Click to view details of previous visits</CardDescription>
        </CardHeader>
        <CardContent>
          {isEncountersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : pastEncounters.length > 0 ? (
            <div className="space-y-2">
              {pastEncounters.map((enc) => (
                <PastEncounterCard key={enc.id} encounter={enc} onSelect={handleSelectEncounter} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No previous encounters on record
            </p>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={handleBack}>
          Back: Vitals
        </Button>
        <Button onClick={handleContinue}>
          Next: Assessment
        </Button>
      </div>

      {/* Encounter Peek Panel */}
      {peekEncounter && (
        <FloatingPeekPanel
          state={peekState}
          onStateChange={setPeekState}
          title={`${ENCOUNTER_TYPES.find((t) => t.value === peekEncounter.encounter_type)?.label || peekEncounter.encounter_type} — ${formatDate(peekEncounter.encounter_date)}`}
          subtitle={peekEncounter.chief_complaint}
          icon={Stethoscope}
          fullPageHref={`/encounters/${peekEncounter.id}`}
        >
          <EncounterPeekContent encounterId={peekEncounter.id} />
        </FloatingPeekPanel>
      )}
    </div>
  );
}

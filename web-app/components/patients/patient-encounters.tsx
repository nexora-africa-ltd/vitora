'use client';

import { useCallback, useState } from 'react';
import { Stethoscope, Calendar, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { FloatingPeekPanel, type PeekPanelState } from '@/components/shared/floating-peek-panel';
import { EncounterPeekContent } from '@/components/encounters/encounter-peek-content';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { usePatientEncounters } from '@/lib/hooks/use-patients';
import type { PatientEncounter } from '@/lib/types/patient';

interface PatientEncountersProps {
  patientId: number;
}

export function PatientEncounters({ patientId }: PatientEncountersProps) {
  const { data: encounters, isLoading, error } = usePatientEncounters(patientId);
  const [peekState, setPeekState] = useState<PeekPanelState>('closed');
  const [peekEncounter, setPeekEncounter] = useState<PatientEncounter | null>(null);

  const handleSelectEncounter = useCallback((enc: PatientEncounter) => {
    setPeekEncounter(enc);
    setPeekState('open');
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Error loading encounters"
        description="Failed to load patient encounters. Please try again."
      />
    );
  }

  if (!encounters?.length) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No encounters"
        description="This patient has no recorded encounters yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      {encounters.map((encounter) => {
        const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
        const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

        return (
          <button
            key={encounter.id}
            type="button"
            onClick={() => handleSelectEncounter(encounter)}
            className="w-full text-left"
          >
            <Card className="hover:shadow-md hover:border-teal-500/30 transition-all cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
                      <Stethoscope className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{type?.label || encounter.encounter_type}</h4>
                        <Badge className={status?.color || ''}>{status?.label || encounter.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {encounter.chief_complaint}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(encounter.encounter_date)}
                        </span>
                        <span>{formatRelativeTime(encounter.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}

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

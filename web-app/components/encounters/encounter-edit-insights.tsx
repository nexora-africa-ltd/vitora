/**
 * EncounterEditInsights — Shared proactive insights panel for the encounter edit flow.
 *
 * Encapsulates the useProactiveInsights hook + context building for reuse
 * across all encounter edit steps (vitals, history, diagnosis, notes, orders, referrals, review).
 */
'use client';

import { useMemo } from 'react';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useProactiveInsights } from '@/lib/hooks/use-proactive-insights';
import { ProactiveInsightsPanel } from '@/components/shared/proactive-insight-card';

function calculateAge(dob: string | null | undefined): number {
  if (!dob) return 0;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function parseBPToMAP(systolic: number | null | undefined, diastolic: number | null | undefined): number | undefined {
  if (!systolic || !diastolic) return undefined;
  return Math.round(diastolic + (systolic - diastolic) / 3);
}

interface EncounterEditInsightsProps {
  className?: string;
}

export function EncounterEditInsights({ className }: EncounterEditInsightsProps) {
  const { encounter } = useEncounterContext();
  const encounterId = encounter?.id;
  const { getVitals, getSession } = useEncounterEditStore();

  const vitals = encounterId ? getVitals(encounterId) : null;
  const session = encounterId ? getSession(encounterId) : null;

  const patientContext = useMemo(() => {
    if (!encounter) return null;
    return {
      patient_age: calculateAge(encounter.patient_date_of_birth),
      patient_sex: encounter.patient_gender ?? 'O',
      allergies: encounter.allergies?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
      comorbidities: encounter.chronic_conditions?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
      current_medications: encounter.current_medications?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [],
    };
  }, [encounter]);

  const encounterCtx = useMemo(() => {
    if (!encounter && !vitals) return null;
    return {
      chief_complaint: session?.chief_complaint ?? encounter?.chief_complaint ?? undefined,
      vitals: {
        spo2: vitals?.spo2 != null ? Number(vitals.spo2) : (encounter?.spo2 != null ? Number(encounter.spo2) : undefined),
        pulse: vitals?.pulse ?? encounter?.pulse ?? undefined,
        temperature: vitals?.temperature != null ? Number(vitals.temperature) : (encounter?.temperature != null ? Number(encounter.temperature) : undefined),
        rr: vitals?.respiratory_rate ?? encounter?.respiratory_rate ?? undefined,
        map: parseBPToMAP(
          vitals?.blood_pressure_systolic ?? null,
          vitals?.blood_pressure_diastolic ?? null,
        ),
      },
    };
  }, [encounter, vitals, session?.chief_complaint]);

  const {
    insights,
    isLoading,
    dismissInsight,
    dismissAll,
    refresh,
    error,
    noInsightsFound,
  } = useProactiveInsights(patientContext, encounterCtx, {
    cacheKey: encounterId ? `edit_${encounterId}` : undefined,
  });

  return (
    <ProactiveInsightsPanel
      insights={insights}
      onDismiss={dismissInsight}
      onDismissAll={dismissAll}
      onGenerate={refresh}
      isLoading={isLoading}
      error={error}
      noInsightsFound={noInsightsFound}
      className={className}
    />
  );
}

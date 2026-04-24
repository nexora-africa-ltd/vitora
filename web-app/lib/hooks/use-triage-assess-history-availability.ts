import { useMemo } from 'react';
import { useEncounterClinicalSnapshot } from '@/lib/hooks/use-encounters';
import { usePatientEncounters } from '@/lib/hooks/use-patients';

function hasClinicalSnapshotContent(snapshot?: {
  allergies?: string[];
  active_conditions?: string[];
  current_medications?: string[];
  pending_results?: unknown[];
  alerts?: string[];
} | null): boolean {
  if (!snapshot) return false;

  return Boolean(
    snapshot.allergies?.length
      || snapshot.active_conditions?.length
      || snapshot.current_medications?.length
      || snapshot.pending_results?.length
      || snapshot.alerts?.length
  );
}

export function useTriageAssessHistoryAvailability(patientId: number, encounterId: number) {
  const { data: encountersData, isLoading: isEncountersLoading } = usePatientEncounters(patientId);
  const { data: snapshot, isLoading: isSnapshotLoading } = useEncounterClinicalSnapshot(encounterId);

  const hasPastEncounters = useMemo(() => {
    return (encountersData ?? []).some((encounter) => encounter.id !== encounterId);
  }, [encountersData, encounterId]);

  const hasSnapshot = useMemo(() => hasClinicalSnapshotContent(snapshot), [snapshot]);
  const isLoading = isEncountersLoading || isSnapshotLoading;
  const hasHistory = hasPastEncounters || hasSnapshot;

  return {
    hasHistory,
    hasPastEncounters,
    hasSnapshot,
    isLoading,
    showHistoryStep: hasHistory,
  };
}

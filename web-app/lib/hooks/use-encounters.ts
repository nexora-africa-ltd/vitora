/**
 * React hooks for encounter data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { encountersApi, PreTriageQueueParams } from '@/lib/api/encounters';
import { EncounterListParams, Encounter } from '@/lib/types/encounter';

/**
 * Hook for fetching paginated encounter list.
 */
export function useEncounters(params?: EncounterListParams) {
  return useQuery({
    queryKey: ['encounters', params],
    queryFn: () => encountersApi.list(params),
  });
}

/**
 * Hook for fetching a single encounter.
 */
export function useEncounter(id: number) {
  return useQuery({
    queryKey: ['encounters', id],
    queryFn: () => encountersApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching clinician-facing clinical snapshot for an encounter.
 */
export function useEncounterClinicalSnapshot(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'clinical-snapshot'],
    queryFn: () => encountersApi.getClinicalSnapshot(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for fetching encounter diagnoses.
 */
export function useEncounterDiagnoses(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'diagnoses'],
    queryFn: () => encountersApi.getDiagnoses(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for fetching encounter treatment plan.
 * Note: 404 is expected when no treatment plan exists - handled gracefully by returning null.
 */
export function useEncounterTreatmentPlan(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'treatment-plan'],
    queryFn: () => encountersApi.getTreatmentPlan(encounterId),
    enabled: !!encounterId,
    // Don't retry on 404 - it means no treatment plan exists (expected)
    retry: (failureCount, error) => {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) return false;
      return failureCount < 3;
    },
  });
}

/**
 * Hook for creating an encounter.
 */
export function useCreateEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Encounter>) => encountersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}

/**
 * Hook for quick consultation - creates and claims encounter in one step.
 *
 * Use this from the patient list to quickly start a consultation.
 * Creates a new OPD encounter or claims an existing unclaimed one.
 *
 * @example
 * ```tsx
 * const quickConsult = useQuickConsultation();
 *
 * const handleStartConsultation = async (patientId: number) => {
 *   const encounter = await quickConsult.mutateAsync({ patientId });
 *   router.push(`/encounters/${encounter.id}`);
 * };
 * ```
 */
export function useQuickConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      patientId,
      chief_complaint,
      encounter_type,
    }: {
      patientId: number;
      chief_complaint?: string;
      encounter_type?: string;
    }) => encountersApi.quickConsultation(patientId, { chief_complaint, encounter_type }),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['consultation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['my-claimed-encounters'] });
    },
  });
}

/**
 * Hook for updating an encounter.
 */
export function useUpdateEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Encounter> }) =>
      encountersApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['encounters', variables.id] });
    },
  });
}

/**
 * Hook for editing chief complaint with audit trail.
 */
export function useEditChiefComplaint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      encounterId,
      data,
    }: {
      encounterId: number;
      data: {
        chief_complaint: string;
        edit_reason: string;
        edit_reason_other?: string;
      };
    }) => encountersApi.editChiefComplaint(encounterId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['encounters', variables.encounterId] });
    },
  });
}

/**
 * Hook for fetching pre-triage queue (encounters awaiting triage).
 *
 * Returns encounters with:
 * - triage_status = PENDING (or IN_PROGRESS if include_in_progress=true)
 * - triage_requirement in (MANDATORY, OPTIONAL)
 *
 * Auto-refreshes every 15 seconds.
 */
export function usePreTriageQueue(params?: PreTriageQueueParams) {
  return useQuery({
    queryKey: ['encounters', 'pre-triage-queue', params],
    queryFn: () => encountersApi.getPreTriageQueue(params),
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  });
}

/**
 * Hook for adding a diagnosis to an encounter.
 */
export function useAddDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      icd10_code?: number | null;
      icd11_code?: string;
      icd11_display?: string;
      diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
      free_text_diagnosis?: string;
      notes?: string;
      is_confirmed?: boolean;
      certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
    }) => encountersApi.createDiagnosis(encounterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

/**
 * Hook for deleting a diagnosis from an encounter.
 */
export function useDeleteDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (diagnosisId: number) => encountersApi.deleteDiagnosis(encounterId, diagnosisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

/**
 * Hook for updating a diagnosis (e.g., changing certainty after lab results).
 */
export function useUpdateDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ diagnosisId, data }: {
      diagnosisId: number;
      data: {
        icd10_code?: number | null;
        diagnosis_type?: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
        free_text_diagnosis?: string;
        notes?: string;
        is_confirmed?: boolean;
        certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
      };
    }) => encountersApi.updateDiagnosis(encounterId, diagnosisId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

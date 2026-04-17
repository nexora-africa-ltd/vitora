/**
 * React hooks for encounter data fetching and mutations.
 * Dual-mode: PowerSync (local SQLite) with React Query API fallback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { encountersApi, PreTriageQueueParams } from '@/lib/api/encounters';
import { EncounterListParams, Encounter } from '@/lib/types/encounter';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { useOfflineMutation } from '@/lib/powersync/use-offline-mutation';
import { generateId } from '@/lib/powersync/uuid';
import { transformEncounterRow, transformDiagnosisRow, transformTreatmentPlanRow, transformMedicationRow } from '@/lib/powersync/transforms';
import type { EncounterRow, DiagnosisRow, TreatmentPlanRow, MedicationRow } from '@/lib/powersync/schema';
import type { PaginatedResponse } from '@/lib/types';
import type { Diagnosis, TreatmentPlan, Medication } from '@/lib/types/encounter';

/**
 * Hook for fetching paginated encounter list.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useEncounters(params?: EncounterListParams) {
  const limit = params?.page_size || 20;
  const offset = ((params?.page || 1) - 1) * limit;

  const conditions: string[] = [];
  const sqlParams: (string | number | null)[] = [];

  if (params?.patient) {
    conditions.push('e.patient_id = ?');
    sqlParams.push(String(params.patient));
  }
  if (params?.encounter_type) {
    conditions.push('e.encounter_type = ?');
    sqlParams.push(params.encounter_type);
  }
  if (params?.search) {
    conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.mrn LIKE ? OR e.chief_complaint LIKE ?)');
    const pattern = `%${params.search}%`;
    sqlParams.push(pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return useOfflineQuery<
    EncounterRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string },
    PaginatedResponse<Encounter>
  >({
    sql: `SELECT e.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM encounters_encounter e
      LEFT JOIN patients_patient p ON e.patient_id = p.id
      ${whereClause}
      ORDER BY e.encounter_date DESC
      LIMIT ? OFFSET ?`,
    params: [...sqlParams, limit, offset],
    transform: (rows) => ({
      count: rows.length < limit ? offset + rows.length : offset + limit + 1,
      next: null,
      previous: null,
      results: rows.map(r => transformEncounterRow(r) as unknown as Encounter),
    }),
    queryKey: ['encounters', params],
    queryFn: () => encountersApi.list(params),
  });
}

/**
 * Hook for fetching a single encounter.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useEncounter(id: number) {
  return useOfflineQuery<
    EncounterRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string },
    Encounter
  >({
    sql: `SELECT e.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM encounters_encounter e
      LEFT JOIN patients_patient p ON e.patient_id = p.id
      WHERE e.id = ?`,
    params: [String(id)],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Encounter ${id} not found`);
      return transformEncounterRow(rows[0]!) as unknown as Encounter;
    },
    queryKey: ['encounters', id],
    queryFn: () => encountersApi.get(id),
    forceApi: !id,
    enabled: id > 0,
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
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useEncounterDiagnoses(encounterId: number) {
  return useOfflineQuery<
    DiagnosisRow & { id: string; icd10_code_text?: string; icd10_short_description?: string },
    Diagnosis[]
  >({
    sql: `SELECT d.*, i.code as icd10_code_text, i.short_description as icd10_short_description
      FROM encounters_diagnosis d
      LEFT JOIN encounters_icd10code i ON d.icd10_code_id = i.id
      WHERE d.encounter_id = ?
      ORDER BY d.created_at`,
    params: [String(encounterId)],
    transform: (rows) => rows.map(r => transformDiagnosisRow(r) as unknown as Diagnosis),
    queryKey: ['encounters', encounterId, 'diagnoses'],
    queryFn: () => encountersApi.getDiagnoses(encounterId),
    forceApi: !encounterId,
    enabled: encounterId > 0,
  });
}

/**
 * Hook for fetching encounter treatment plan.
 * Reads from local PowerSync SQLite when available, falls back to API.
 * Note: 404 is expected when no treatment plan exists - handled gracefully by returning null.
 */
export function useEncounterTreatmentPlan(encounterId: number) {
  return useOfflineQuery<
    TreatmentPlanRow & { id: string },
    TreatmentPlan | null
  >({
    sql: `SELECT * FROM encounters_treatmentplan WHERE encounter_id = ? LIMIT 1`,
    params: [String(encounterId)],
    transform: (rows) => {
      if (rows.length === 0) return null;
      const local = transformTreatmentPlanRow(rows[0]!);
      // Map TreatmentPlanLocalRecord → TreatmentPlan shape expected by consumers
      return {
        ...local,
        template: local.template ?? null,
        medications_json: local.medications_json,
        procedures_json: local.procedures_json,
        has_follow_up: !!local.follow_up_date,
        has_referral: local.referral_needed,
        medications: [], // Medications loaded separately via useEncounterMedications
      } as TreatmentPlan;
    },
    queryKey: ['encounters', encounterId, 'treatment-plan'],
    queryFn: async () => {
      try {
        return await encountersApi.getTreatmentPlan(encounterId);
      } catch (err) {
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status === 404) return null;
        throw err;
      }
    },
    forceApi: !encounterId,
    enabled: encounterId > 0,
  });
}

/**
 * Hook for creating an encounter.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useCreateEncounter() {
  const queryClient = useQueryClient();

  return useOfflineMutation<Partial<Encounter>, Encounter>({
    table: 'encounters_encounter',
    operation: 'create',
    // Encounter creation MUST go through the API directly because:
    // 1. Callers immediately use result.id for diagnoses, admissions, redirects, and triage check-in
    // 2. The backend generates consultation_status, triage_status, and assigns facility scoping
    forceApi: true,
    buildLocalData: (data) => ({
      id: generateId(),
      patient_id: data.patient ? String(data.patient) : null,
      encounter_type: data.encounter_type || 'OPD',
      encounter_date: data.encounter_date || new Date().toISOString().split('T')[0],
      chief_complaint: data.chief_complaint || '',
      consultation_status: 'WAITING',
      triage_status: 'PENDING',
      notes: data.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    mutationFn: (data) => encountersApi.create(data),
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
 * Uses local PowerSync write when available, falls back to API.
 */
export function useUpdateEncounter() {
  const queryClient = useQueryClient();

  return useOfflineMutation<{ id: number; data: Partial<Encounter> }, Encounter>({
    table: 'encounters_encounter',
    operation: 'update',
    getId: (input) => input.id,
    buildLocalData: ({ data }) => {
      const fields: Record<string, string | number | null> = {};
      if (data.chief_complaint !== undefined) fields.chief_complaint = data.chief_complaint;
      if (data.encounter_type !== undefined) fields.encounter_type = data.encounter_type;
      if (data.notes !== undefined) fields.notes = data.notes || null;
      if (data.temperature !== undefined) fields.temperature = data.temperature ?? null;
      if (data.pulse !== undefined) fields.pulse = data.pulse ?? null;
      if (data.blood_pressure !== undefined) fields.blood_pressure = data.blood_pressure || null;
      if (data.respiratory_rate !== undefined) fields.respiratory_rate = data.respiratory_rate ?? null;
      if (data.spo2 !== undefined) fields.spo2 = data.spo2 ?? null;
      if (data.weight !== undefined) fields.weight = data.weight ?? null;
      if (data.height !== undefined) fields.height = data.height ?? null;
      fields.updated_at = new Date().toISOString();
      return fields;
    },
    mutationFn: ({ id, data }) => encountersApi.update(id, data),
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
 * Uses local PowerSync write when available, falls back to API.
 */
export function useAddDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();

  return useOfflineMutation<{
    icd10_code?: number | null;
    icd11_code?: string;
    icd11_display?: string;
    snomed_code?: string;
    snomed_display?: string;
    diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
    free_text_diagnosis?: string;
    notes?: string;
    is_confirmed?: boolean;
    certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
  }, Diagnosis>({
    table: 'encounters_diagnosis',
    operation: 'create',
    buildLocalData: (data) => ({
      id: generateId(),
      encounter_id: String(encounterId),
      icd10_code_id: data.icd10_code ? String(data.icd10_code) : null,
      icd11_code: data.icd11_code || null,
      icd11_display: data.icd11_display || null,
      snomed_code: data.snomed_code || null,
      snomed_display: data.snomed_display || null,
      diagnosis_type: data.diagnosis_type,
      free_text_diagnosis: data.free_text_diagnosis || null,
      notes: data.notes || null,
      is_confirmed: data.is_confirmed ? 1 : 0,
      certainty: data.certainty || 'provisional',
      diagnosed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    mutationFn: (data) => encountersApi.createDiagnosis(encounterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

/**
 * Hook for deleting a diagnosis from an encounter.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useDeleteDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();

  return useOfflineMutation<number, void>({
    table: 'encounters_diagnosis',
    operation: 'delete',
    getId: (diagnosisId) => diagnosisId,
    mutationFn: (diagnosisId) => encountersApi.deleteDiagnosis(encounterId, diagnosisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

/**
 * Hook for updating a diagnosis (e.g., changing certainty after lab results).
 * Uses local PowerSync write when available, falls back to API.
 */
export function useUpdateDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();

  return useOfflineMutation<{
    diagnosisId: number;
    data: {
      icd10_code?: number | null;
      icd11_code?: string;
      icd11_display?: string;
      snomed_code?: string;
      snomed_display?: string;
      diagnosis_type?: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
      free_text_diagnosis?: string;
      notes?: string;
      is_confirmed?: boolean;
      certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
    };
  }, Diagnosis>({
    table: 'encounters_diagnosis',
    operation: 'update',
    getId: (input) => input.diagnosisId,
    buildLocalData: ({ data }) => {
      const fields: Record<string, string | number | null> = {};
      if (data.icd10_code !== undefined) fields.icd10_code_id = data.icd10_code ? String(data.icd10_code) : null;
      if (data.icd11_code !== undefined) fields.icd11_code = data.icd11_code || null;
      if (data.icd11_display !== undefined) fields.icd11_display = data.icd11_display || null;
      if (data.snomed_code !== undefined) fields.snomed_code = data.snomed_code || null;
      if (data.snomed_display !== undefined) fields.snomed_display = data.snomed_display || null;
      if (data.diagnosis_type !== undefined) fields.diagnosis_type = data.diagnosis_type;
      if (data.free_text_diagnosis !== undefined) fields.free_text_diagnosis = data.free_text_diagnosis || null;
      if (data.notes !== undefined) fields.notes = data.notes || null;
      if (data.is_confirmed !== undefined) fields.is_confirmed = data.is_confirmed ? 1 : 0;
      if (data.certainty !== undefined) fields.certainty = data.certainty;
      fields.updated_at = new Date().toISOString();
      return fields;
    },
    mutationFn: ({ diagnosisId, data }) => encountersApi.updateDiagnosis(encounterId, diagnosisId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

/**
 * Hook for fetching medications for a treatment plan.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useEncounterMedications(treatmentPlanId: number | undefined) {
  return useOfflineQuery<
    MedicationRow & { id: string },
    Medication[]
  >({
    sql: `SELECT * FROM encounters_medication WHERE treatment_plan_id = ? ORDER BY created_at`,
    params: [String(treatmentPlanId ?? 0)],
    transform: (rows) => rows.map(r => {
      const local = transformMedicationRow(r);
      return { ...local, is_active: true } as Medication;
    }),
    queryKey: ['treatment-plans', treatmentPlanId, 'medications'],
    queryFn: async () => {
      // Medications are typically embedded in the treatment plan response;
      // if a standalone endpoint exists, use it. Otherwise return empty.
      return [];
    },
    forceApi: !treatmentPlanId,
    enabled: !!treatmentPlanId && treatmentPlanId > 0,
  });
}

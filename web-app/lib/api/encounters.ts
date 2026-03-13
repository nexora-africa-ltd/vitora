/**
 * Encounters API client.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  EncounterSchema,
  DiagnosisSchema,
  TreatmentPlanSchema,
  EncounterClaimResponseSchema,
  EncounterReleaseResponseSchema,
  MyClaimedEncountersResponseSchema,
  AllClaimedEncountersResponseSchema,
  PaginatedEncounterSchema,
  PaginatedDiagnosisSchema,
  PaginatedPreTriageQueueSchema,
  TemplatePopulateResponseSchema,
  TemplateSyncResponseSchema,
  TemplateSnapshotSchema,
  TemplateSnapshotArraySchema,
  SNOMEDSearchResponseSchema,
} from '@/lib/schemas/encounter.schema';
import { ClinicalSnapshotSchema } from '@/lib/schemas/checkin.schema';
import {
  Encounter,
  EncounterListParams,
  Diagnosis,
  TreatmentPlan,
  EncounterClaimResponse,
  EncounterReleaseResponse,
  MyClaimedEncountersParams,
  MyClaimedEncountersResponse,
  AllClaimedEncountersParams,
  AllClaimedEncountersResponse,
  EncounterTransitionRequest,
  EncounterTransitionResponse,
  RelatedEncounter,
  SNOMEDSearchResult,
} from '@/lib/types/encounter';
import type { ClinicalSnapshot } from '@/lib/types/checkin';
import { PaginatedResponse } from '@/lib/types';

export const encountersApi = {
  /**
   * Get paginated list of encounters.
   */
  async list(params?: EncounterListParams): Promise<PaginatedResponse<Encounter>> {
    const response = await apiClient.get<PaginatedResponse<Encounter>>('/api/encounters/', {
      params,
    });
    return parseResponse(PaginatedEncounterSchema, response.data, { context: 'encountersApi.list' });
  },

  /**
   * Get a single encounter by ID.
   */
  async get(id: number): Promise<Encounter> {
    const response = await apiClient.get<Encounter>(`/api/encounters/${id}/`);
    return parseResponse(EncounterSchema, response.data, { context: 'encountersApi.get' });
  },

  /**
   * Create a new encounter.
   */
  async create(data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.post<Encounter>('/api/encounters/', data);
    return parseResponse(EncounterSchema, response.data, { context: 'encountersApi.create' });
  },

  /**
   * Update an encounter.
   */
  async update(id: number, data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.patch<Encounter>(`/api/encounters/${id}/`, data);
    return parseResponse(EncounterSchema, response.data, { context: 'encountersApi.update' });
  },

  /**
   * Finalize/complete an encounter.
   * Changes status to COMPLETED and records the finalizing user and timestamp.
   */
  async finalize(id: number): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(`/api/encounters/${id}/finalize/`);
    return parseResponse(EncounterSchema, response.data, { context: 'encountersApi.finalize' });
  },

  // ===========================================================================
  // Quick Consultation (Start consultation directly from patient list)
  // ===========================================================================

  /**
   * Start a quick consultation for a patient.
   *
   * Creates a new OPD encounter and claims it in one step, or claims
   * an existing unclaimed encounter for the patient.
   *
   * This is the preferred way to start a consultation from the patient list.
   *
   * @param patientId - The patient ID
   * @param options - Optional encounter details
   * @returns The created/claimed encounter
   * @throws 409 Conflict if patient has an active encounter with another clinician
   */
  async quickConsultation(
    patientId: number,
    options?: { chief_complaint?: string; encounter_type?: string }
  ): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      '/api/encounters/quick_consultation/',
      {
        patient: patientId,
        ...options,
      }
    );
    return parseResponse(EncounterSchema, response.data, { context: 'encountersApi.quickConsultation' });
  },

  // ===========================================================================
  // State Machine Transition (Sprint 2 - Phase 2A)
  // ===========================================================================

  /**
   * Transition encounter to a new status.
   *
   * Validates the transition and creates an audit trail entry.
   *
   * @param id - The encounter ID to transition
   * @param data - The target status and optional reason
   * @returns Transition details including previous status and timestamp
   * @throws 400 Bad Request if the transition is invalid
   */
  async transition(id: number, data: EncounterTransitionRequest): Promise<EncounterTransitionResponse> {
    const response = await apiClient.post<EncounterTransitionResponse>(
      `/api/encounters/${id}/transition/`,
      data
    );
    return response.data;
  },

  // ===========================================================================
  // Related Encounters (Sprint 2 - Phase 2B)
  // ===========================================================================

  /**
   * Get encounters linked to this encounter (follow-up visits).
   *
   * @param id - The encounter ID
   * @returns List of related encounters
   */
  async getRelated(id: number): Promise<RelatedEncounter[]> {
    const response = await apiClient.get<RelatedEncounter[]>(
      `/api/encounters/${id}/related/`
    );
    return response.data;
  },

  // =========================================================================
  // Clinical Snapshot (Clinician Safety)
  // =========================================================================

  /**
   * Get the clinical snapshot for the encounter's patient.
   *
   * This reuses the same response shape as check-in clinical snapshots.
   */
  async getClinicalSnapshot(id: number): Promise<ClinicalSnapshot> {
    const response = await apiClient.get<ClinicalSnapshot>(
      `/api/encounters/${id}/clinical_snapshot/`
    );
    return parseResponse(ClinicalSnapshotSchema, response.data, {
      context: 'encountersApi.getClinicalSnapshot',
    }) as ClinicalSnapshot;
  },

  // ===========================================================================
  // Clinician Claim/Release Actions (Data Integrity - Sprint 1.7)
  // ===========================================================================

  /**
   * Claim an encounter for consultation.
   *
   * Prevents multiple clinicians from attending the same patient.
   * Uses database-level locking to prevent race conditions.
   *
   * @param id - The encounter ID to claim
   * @returns Claim confirmation with timestamp
   * @throws 409 Conflict if already claimed by another clinician
   * @throws 400 Bad Request if encounter status is invalid
   */
  async claim(id: number): Promise<EncounterClaimResponse> {
    const response = await apiClient.post<EncounterClaimResponse>(
      `/api/encounters/${id}/claim/`
    );
    return parseResponse(EncounterClaimResponseSchema, response.data, { context: 'encountersApi.claim' });
  },

  /**
   * Release an encounter you previously claimed.
   *
   * Only the assigned clinician can release an encounter.
   * This allows another clinician to take over.
   *
   * @param id - The encounter ID to release
   * @returns Release confirmation
   * @throws 403 Forbidden if not the assigned clinician
   * @throws 400 Bad Request if encounter is completed/cancelled
   */
  async release(id: number): Promise<EncounterReleaseResponse> {
    const response = await apiClient.post<EncounterReleaseResponse>(
      `/api/encounters/${id}/release/`
    );
    return parseResponse(EncounterReleaseResponseSchema, response.data, { context: 'encountersApi.release' });
  },

  /**
   * Get encounters claimed by the current user.
   *
   * Returns all encounters where the current user is the assigned clinician.
   * By default, excludes completed encounters.
   *
   * @param params - Optional filters (status, include_completed)
   * @returns List of claimed encounters with count
   */
  async getMyClaimed(params?: MyClaimedEncountersParams): Promise<MyClaimedEncountersResponse> {
    const response = await apiClient.get<MyClaimedEncountersResponse>(
      '/api/encounters/my_claimed/',
      { params }
    );
    return parseResponse(MyClaimedEncountersResponseSchema, response.data, { context: 'encountersApi.getMyClaimed' });
  },

  /**
   * Get all claimed encounters (supervisor/management view).
   *
   * Returns all encounters that are currently claimed by any clinician.
   * Requires supervisor-level access (hierarchy_level <= 3) or specific permission.
   *
   * @param params - Optional filters (status, include_completed, clinician, department)
   * @returns List of all claimed encounters with count
   * @throws 403 Forbidden if user lacks supervisor access
   */
  async getAllClaimed(params?: AllClaimedEncountersParams): Promise<AllClaimedEncountersResponse> {
    const response = await apiClient.get<AllClaimedEncountersResponse>(
      '/api/encounters/all_claimed/',
      { params }
    );
    return parseResponse(AllClaimedEncountersResponseSchema, response.data, { context: 'encountersApi.getAllClaimed' });
  },

  /**
   * Get diagnoses for an encounter.
   */
  async getDiagnoses(encounterId: number): Promise<Diagnosis[]> {
    const response = await apiClient.get<PaginatedResponse<Diagnosis>>(
      `/api/encounters/${encounterId}/diagnoses/`
    );
    const validated = parseResponse(PaginatedDiagnosisSchema, response.data, {
      context: 'encountersApi.getDiagnoses',
    });
    return validated.results;
  },

  /**
   * Create a diagnosis for an encounter.
   */
  async createDiagnosis(encounterId: number, data: CreateDiagnosisData): Promise<Diagnosis> {
    const response = await apiClient.post<Diagnosis>(
      `/api/encounters/${encounterId}/diagnoses/`,
      data
    );
    return parseResponse(DiagnosisSchema, response.data, { context: 'encountersApi.createDiagnosis' });
  },

  /**
   * Delete a diagnosis.
   */
  async deleteDiagnosis(encounterId: number, diagnosisId: number): Promise<void> {
    await apiClient.delete(`/api/encounters/${encounterId}/diagnoses/${diagnosisId}/`);
  },

  /**
   * Update a diagnosis (e.g., change certainty after lab results).
   */
  async updateDiagnosis(encounterId: number, diagnosisId: number, data: Partial<CreateDiagnosisData>): Promise<Diagnosis> {
    const response = await apiClient.patch<Diagnosis>(
      `/api/encounters/${encounterId}/diagnoses/${diagnosisId}/`,
      data
    );
    return parseResponse(DiagnosisSchema, response.data, { context: 'encountersApi.updateDiagnosis' });
  },

  /**
   * Get treatment plan for an encounter.
   */
  async getTreatmentPlan(encounterId: number): Promise<TreatmentPlan | null> {
    try {
      const response = await apiClient.get<TreatmentPlan>(
        `/api/encounters/${encounterId}/treatment-plan/`
      );
      return parseResponse(TreatmentPlanSchema, response.data, { context: 'encountersApi.getTreatmentPlan' }) as TreatmentPlan;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get pre-triage queue (encounters awaiting triage).
   *
   * Returns encounters with:
   * - triage_status = PENDING (or IN_PROGRESS if include_in_progress=true)
   * - triage_requirement in (MANDATORY, OPTIONAL)
   *
   * Sorted by arrival time (created_at) ascending.
   */
  async getPreTriageQueue(params?: PreTriageQueueParams): Promise<PaginatedResponse<PreTriageQueueItem>> {
    const response = await apiClient.get<PaginatedResponse<PreTriageQueueItem>>(
      '/api/encounters/pre_triage_queue/',
      { params }
    );
    return parseResponse(PaginatedPreTriageQueueSchema, response.data, { context: 'encountersApi.getPreTriageQueue' });
  },

  /**
   * Edit chief complaint with audit trail.
   *
   * Only allowed for triaged encounters. Requires a reason for the edit.
   */
  async editChiefComplaint(
    encounterId: number,
    data: {
      chief_complaint: string;
      edit_reason: string;
      edit_reason_other?: string;
    }
  ): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      `/api/encounters/${encounterId}/edit_chief_complaint/`,
      data
    );
    return parseResponse(EncounterSchema, response.data, { context: 'encountersApi.editChiefComplaint' });
  },

  // ===========================================================================
  // Clinical Template Sync
  // ===========================================================================

  /**
   * Populate template fields from existing encounter/patient data.
   * Auto-fills template fields with matching encounter vitals and patient demographics.
   */
  async populateTemplate(
    encounterId: number,
    templateId: number,
    structureBySection?: boolean
  ): Promise<TemplatePopulateResponse> {
    const params: Record<string, string> = { template_id: String(templateId) };
    if (structureBySection) {
      params.structure_by_section = 'true';
    }
    const response = await apiClient.get<TemplatePopulateResponse>(
      `/api/encounters/${encounterId}/populate-template/`,
      { params }
    );
    return parseResponse(TemplatePopulateResponseSchema, response.data, { context: 'encountersApi.populateTemplate' });
  },

  /**
   * Sync template data back to encounter fields.
   * Updates encounter vitals and other fields from template data.
   */
  async syncTemplate(
    encounterId: number,
    templateId: number,
    templateData: Record<string, unknown>
  ): Promise<TemplateSyncResponse> {
    const response = await apiClient.post<TemplateSyncResponse>(
      `/api/encounters/${encounterId}/sync-template/`,
      {
        template_id: templateId,
        template_data: templateData,
      }
    );
    return parseResponse(TemplateSyncResponseSchema, response.data, { context: 'encountersApi.syncTemplate' });
  },

  /**
   * List template snapshots (attachments) for an encounter.
   */
  async listTemplateSnapshots(encounterId: number): Promise<TemplateSnapshot[]> {
    const response = await apiClient.get<TemplateSnapshot[]>(
      `/api/encounters/${encounterId}/template-snapshots/`
    );
    return parseResponse(TemplateSnapshotArraySchema, response.data, { context: 'encountersApi.listTemplateSnapshots' });
  },

  /**
   * Create a template snapshot (attachment) for an encounter.
   * Snapshots are immutable records of completed template assessments.
   */
  async createTemplateSnapshot(
    encounterId: number,
    templateId: number,
    templateData: Record<string, unknown>
  ): Promise<TemplateSnapshot> {
    const response = await apiClient.post<TemplateSnapshot>(
      `/api/encounters/${encounterId}/template-snapshots/`,
      {
        template_id: templateId,
        template_data: templateData,
      }
    );
    return parseResponse(TemplateSnapshotSchema, response.data, { context: 'encountersApi.createTemplateSnapshot' });
  },

  // ============ SNOMED CT Search ============

  /**
   * Search SNOMED CT concepts via Snowstorm API or local cache.
   *
   * @param query - Search query (minimum 2 characters)
   */
  async searchSNOMED(query: string): Promise<{ count: number; results: SNOMEDSearchResult[] }> {
    const response = await apiClient.get('/api/encounters/snomed/search/', {
      params: { q: query },
    });
    return parseResponse(SNOMEDSearchResponseSchema, response.data, { context: 'encountersApi.searchSNOMED' });
  },
};

// =============================================================================
// Clinical Template Sync Types
// =============================================================================

export interface TemplatePopulateResponse {
  populated_data: Record<string, unknown>;
  template_id: number;
  template_name: string;
}

export interface TemplateSyncResponse extends Encounter {
  changed_fields: string[];
}

export interface TemplateSnapshot {
  id: number;
  template_id: number | null;
  template_name: string;
  template_version: string;
  data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// =============================================================================
// Diagnosis Types
// =============================================================================

export interface CreateDiagnosisData {
  icd10_code?: number | null;
  icd11_code?: string;
  icd11_display?: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
  free_text_diagnosis?: string;
  notes?: string;
  is_confirmed?: boolean;
  certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
}

// =============================================================================
// Pre-Triage Queue Types
// =============================================================================

export interface PreTriageQueueParams {
  triage_requirement?: 'MANDATORY' | 'OPTIONAL';
  encounter_type?: string;
  include_in_progress?: boolean;
}

export interface PreTriageQueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number | null;
  patient_gender: string;
  encounter_type: string;
  encounter_type_display?: string | null;
  chief_complaint: string;
  triage_requirement: 'MANDATORY' | 'OPTIONAL' | 'NOT_REQUIRED';
  triage_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';
  created_at: string;
  wait_time_minutes: number;
}

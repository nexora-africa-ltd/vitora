/**
 * Vital flag suggestion type definitions.
 *
 * Purpose:
 * - Represents vitals-derived clinician review suggestions returned by
 *   /api/patients/{patientId}/vital-flag-suggestions endpoints.
 *
 * Usage:
 * - Import into API clients, hooks, and patient review UI.
 *
 * Inputs:
 * - Numeric patient and suggestion IDs
 * - Action payloads for acknowledge/map/accept/reject endpoints
 */

export type VitalFlagSourceType = 'TRIAGE' | 'ENCOUNTER' | 'BACKGROUND_RULE';

export type VitalFlagSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type VitalFlagStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'MAPPED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type VitalFlagMappingStatus = 'UNMAPPED' | 'AUTO_MAPPED' | 'NEEDS_REVIEW' | 'CONFIRMED';

export type VitalFlagResolutionAction =
  | 'CREATE_DIAGNOSIS_PROVISIONAL'
  | 'CREATE_DIAGNOSIS_CONFIRMED'
  | 'ADD_CHRONIC_CONDITION'
  | 'NOTE_ONLY'
  | 'NO_ACTION';

export interface VitalFlagSuggestionAction {
  id: number;
  action_type: string;
  from_status: string;
  to_status: string;
  actor: number | null;
  actor_username: string | null;
  payload_json: Record<string, unknown>;
  created_at: string;
}

export interface VitalFlagSuggestion {
  id: number;
  patient: number;
  patient_name: string;
  encounter: number | null;
  triage_assessment: number | null;
  source_type: VitalFlagSourceType;
  flag_key: string;
  clinical_domain: string;
  severity: VitalFlagSeverity;
  severity_display: string;
  status: VitalFlagStatus;
  status_display: string;
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  rule_id: string;
  rule_version: string;
  evidence_json: Record<string, unknown>;
  mapping_status: VitalFlagMappingStatus;
  mapping_status_display: string;
  suggested_icd10: number | null;
  suggested_icd10_code: string | null;
  suggested_icd11_code: string;
  suggested_icd11_title: string;
  selected_icd10: number | null;
  selected_icd10_code: string | null;
  selected_icd11_code: string;
  selected_icd11_title: string;
  resolution_action: VitalFlagResolutionAction | '';
  resolution_note: string;
  resolved_by: number | null;
  resolved_by_username: string | null;
  linked_diagnosis: number | null;
  linked_chronic_condition: number | null;
  actions: VitalFlagSuggestionAction[];
  created_at: string;
  updated_at: string;
}

export interface VitalFlagAcknowledgePayload {
  note?: string;
}

export interface VitalFlagMapPayload {
  selected_icd10?: number | null;
  selected_icd11_code?: string;
  selected_icd11_title?: string;
}

export interface VitalFlagAcceptPayload {
  resolution_action: VitalFlagResolutionAction;
  note?: string;
  selected_icd10?: number | null;
  selected_icd11_code?: string;
  selected_icd11_title?: string;
  diagnosis_type?: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
  certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
  condition_name?: string;
  chronic_status?: 'ACTIVE' | 'REMISSION' | 'RESOLVED' | 'UNKNOWN';
}

export interface VitalFlagRejectPayload {
  reason: string;
}

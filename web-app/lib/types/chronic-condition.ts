/**
 * Chronic Condition type definitions.
 *
 * Structured chronic/ongoing conditions for FHIR R4 interoperability.
 * Maps to backend ChronicCondition model in encounters/models.py.
 */

export type ConditionStatus = 'ACTIVE' | 'REMISSION' | 'RESOLVED' | 'UNKNOWN';

export interface ChronicCondition {
  id: number;
  patient: number;
  encounter: number | null;
  condition_name: string;
  icd10_code: string;
  status: ConditionStatus;
  status_display: string;
  onset_date: string | null;
  notes: string;
  recorded_by: number | null;
  recorded_by_username: string | null;
  patient_name: string;
  created_at: string;
  updated_at: string;
}

export interface ChronicConditionCreatePayload {
  condition_name: string;
  icd10_code?: string;
  status: ConditionStatus;
  onset_date?: string | null;
  notes?: string;
  encounter?: number | null;
}

export interface ChronicConditionUpdatePayload {
  condition_name?: string;
  icd10_code?: string;
  status?: ConditionStatus;
  onset_date?: string | null;
  notes?: string;
}

export const CONDITION_STATUS_OPTIONS: { value: ConditionStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'REMISSION', label: 'In remission' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

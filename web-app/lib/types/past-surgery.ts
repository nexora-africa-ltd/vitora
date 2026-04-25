/**
 * Past Surgery type definitions.
 *
 * Structured past surgery/procedure records (FHIR Procedure).
 * Maps to backend PastSurgery model in encounters/models.py.
 */

export type SurgeryOutcome = 'SUCCESSFUL' | 'COMPLICATED' | 'UNKNOWN';

export interface PastSurgery {
  id: number;
  patient: number;
  encounter: number | null;
  procedure_name: string;
  procedure_date: string | null;
  outcome: SurgeryOutcome;
  outcome_display: string;
  notes: string;
  recorded_by: number | null;
  recorded_by_username: string | null;
  patient_name: string;
  created_at: string;
  updated_at: string;
}

export interface PastSurgeryCreatePayload {
  procedure_name: string;
  procedure_date?: string | null;
  outcome: SurgeryOutcome;
  notes?: string;
  encounter?: number | null;
}

export interface PastSurgeryUpdatePayload {
  procedure_name?: string;
  procedure_date?: string | null;
  outcome?: SurgeryOutcome;
  notes?: string;
}

export const SURGERY_OUTCOME_OPTIONS: { value: SurgeryOutcome; label: string }[] = [
  { value: 'SUCCESSFUL', label: 'Successful' },
  { value: 'COMPLICATED', label: 'Complicated' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

/**
 * Current Medication type definitions.
 *
 * Structured medication statements for patient intake (FHIR MedicationStatement).
 * Maps to backend CurrentMedication model in encounters/models.py.
 */

export type MedicationStatus = 'ACTIVE' | 'ON_HOLD' | 'STOPPED' | 'UNKNOWN';

export interface CurrentMedication {
  id: number;
  patient: number;
  encounter: number | null;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  status: MedicationStatus;
  status_display: string;
  start_date: string | null;
  notes: string;
  recorded_by: number | null;
  recorded_by_username: string | null;
  patient_name: string;
  created_at: string;
  updated_at: string;
}

export interface CurrentMedicationCreatePayload {
  medication_name: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  status: MedicationStatus;
  start_date?: string | null;
  notes?: string;
  encounter?: number | null;
}

export interface CurrentMedicationUpdatePayload {
  medication_name?: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  status?: MedicationStatus;
  start_date?: string | null;
  notes?: string;
}

export const MEDICATION_STATUS_OPTIONS: { value: MedicationStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Currently taking' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

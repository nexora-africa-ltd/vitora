/**
 * PowerSync Row → TypeScript Type Transformers
 *
 * PowerSync rows use snake_case text keys and text IDs (from PostgreSQL
 * logical replication). These functions normalize rows into the existing
 * TypeScript types used throughout the web-app.
 *
 * Each transformer handles:
 *   - Text ID → number ID conversion (parseInt)
 *   - Integer booleans (0/1) → true/false
 *   - Null coalescing for optional fields
 */

import type {
  PatientRow,
  EncounterRow,
  CountyRow,
  SubCountyRow,
  WardRow,
  ICD10CodeRow,
  TriageAssessmentRow,
  DiagnosisRow,
  TreatmentPlanRow,
  MedicationRow,
  PrescriptionRow,
  PrescriptionItemRow,
  LabOrderRow,
  LabOrderItemRow,
  LabResultRow,
  InvoiceRow,
} from './schema';

import type { County, SubCounty, Ward } from '@/lib/api/locations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a PowerSync text ID to a number. Returns 0 for null/empty. */
function toNumericId(id: string | null | undefined): number {
  if (!id) return 0;
  const n = parseInt(id, 10);
  return isNaN(n) ? 0 : n;
}

/** Convert SQLite integer (0/1) to boolean. */
function toBool(val: number | null | undefined): boolean {
  return val === 1;
}

// ---------------------------------------------------------------------------
// Reference Data Transformers
// ---------------------------------------------------------------------------

export function transformCountyRow(row: CountyRow & { id: string }): County {
  return {
    id: toNumericId(row.id),
    code: row.code as number,
    name: row.name as string,
  };
}

export function transformSubCountyRow(row: SubCountyRow & { id: string }): SubCounty {
  return {
    id: toNumericId(row.id),
    county: toNumericId(row.county_id as string),
    name: row.name as string,
  };
}

export function transformWardRow(row: WardRow & { id: string }): Ward {
  return {
    id: toNumericId(row.id),
    sub_county: toNumericId(row.sub_county_id as string),
    name: row.name as string,
  };
}

// ---------------------------------------------------------------------------
// Patient Transformer
// ---------------------------------------------------------------------------

/**
 * Minimal patient shape returned from local SQLite for list/search views.
 * PII fields (national_id, phone_number, identification_number) are NOT
 * available in PowerSync — they remain API-only.
 */
export interface PatientLocalRecord {
  id: number;
  mrn: string;
  cr_number?: string;
  sha_number?: string;
  title?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  email?: string;
  address?: string;
  citizenship?: string;
  identification_type?: string;
  is_person_with_disability: boolean;
  is_sensitive: boolean;
  consent_given: boolean;
  consent_date?: string;
  consent_deferred: boolean;
  referral_source: string;
  referred_from_facility?: string;
  county: number;
  sub_county: number;
  ward?: number;
  county_name?: string;
  sub_county_name?: string;
  ward_name?: string;
  is_deceased: boolean;
  registered_by: number;
  created_at: string;
  updated_at: string;
}

/**
 * Transform a PowerSync PatientRow into a PatientLocalRecord.
 * Pass optional county/sub_county/ward names from JOINed queries.
 */
export function transformPatientRow(
  row: PatientRow & { id: string; county_name?: string; sub_county_name?: string; ward_name?: string }
): PatientLocalRecord {
  return {
    id: toNumericId(row.id),
    mrn: (row.mrn as string) || '',
    cr_number: (row.cr_number as string) || undefined,
    sha_number: (row.sha_number as string) || undefined,
    title: (row.title as string) || undefined,
    first_name: (row.first_name as string) || '',
    middle_name: (row.middle_name as string) || undefined,
    last_name: (row.last_name as string) || '',
    date_of_birth: (row.date_of_birth as string) || '',
    gender: (row.gender as 'M' | 'F' | 'O') || 'O',
    email: (row.email as string) || undefined,
    address: (row.address as string) || undefined,
    citizenship: (row.citizenship as string) || undefined,
    identification_type: (row.identification_type as string) || undefined,
    is_person_with_disability: toBool(row.is_person_with_disability as number),
    is_sensitive: toBool(row.is_sensitive as number),
    consent_given: toBool(row.consent_given as number),
    consent_date: (row.consent_date as string) || undefined,
    consent_deferred: toBool(row.consent_deferred as number),
    referral_source: (row.referral_source as string) || 'self',
    referred_from_facility: (row.referred_from_facility as string) || undefined,
    county: toNumericId(row.county_id as string),
    sub_county: toNumericId(row.sub_county_id as string),
    ward: row.ward_id ? toNumericId(row.ward_id as string) : undefined,
    county_name: (row.county_name as string) || undefined,
    sub_county_name: (row.sub_county_name as string) || undefined,
    ward_name: (row.ward_name as string) || undefined,
    is_deceased: toBool(row.is_deceased as number),
    registered_by: toNumericId(row.registered_by_id as string),
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ---------------------------------------------------------------------------
// Encounter Transformer
// ---------------------------------------------------------------------------

export interface EncounterLocalRecord {
  id: number;
  facility_id: number;
  patient_id: number;
  encounter_type: string;
  encounter_date: string;
  chief_complaint: string;
  consultation_status?: string;
  triage_status?: string;
  triage_requirement?: string;
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  notes?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  // JOINed patient fields
  patient_name?: string;
  patient_mrn?: string;
}

export function transformEncounterRow(
  row: EncounterRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string }
): EncounterLocalRecord {
  return {
    id: toNumericId(row.id),
    facility_id: toNumericId(row.facility_id as string),
    patient_id: toNumericId(row.patient_id as string),
    encounter_type: (row.encounter_type as string) || '',
    encounter_date: (row.encounter_date as string) || '',
    chief_complaint: (row.chief_complaint as string) || '',
    consultation_status: (row.consultation_status as string) || undefined,
    triage_status: (row.triage_status as string) || undefined,
    triage_requirement: (row.triage_requirement as string) || undefined,
    temperature: row.temperature as number | undefined,
    pulse: row.pulse as number | undefined,
    blood_pressure: (row.blood_pressure as string) || undefined,
    respiratory_rate: row.respiratory_rate as number | undefined,
    spo2: row.spo2 as number | undefined,
    weight: row.weight as number | undefined,
    height: row.height as number | undefined,
    notes: (row.notes as string) || undefined,
    created_by: toNumericId(row.created_by_id as string),
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    patient_name: row.patient_first_name && row.patient_last_name
      ? `${row.patient_first_name} ${row.patient_last_name}`
      : undefined,
    patient_mrn: (row.patient_mrn as string) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Re-export types and helpers for convenience
// ---------------------------------------------------------------------------

export type {
  PatientRow,
  EncounterRow,
  CountyRow,
  SubCountyRow,
  WardRow,
  ICD10CodeRow,
  TriageAssessmentRow,
  DiagnosisRow,
  TreatmentPlanRow,
  MedicationRow,
  PrescriptionRow,
  PrescriptionItemRow,
  LabOrderRow,
  LabOrderItemRow,
  LabResultRow,
  InvoiceRow,
};

export { toNumericId, toBool };

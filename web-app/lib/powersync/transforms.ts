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
  ClinicalTemplateRow,
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

/**
 * Transforms an ICD-10 code row from PowerSync into the ICD10SearchResult shape.
 */
export function transformICD10Row(row: ICD10CodeRow & { id: string }) {
  return {
    id: toNumericId(row.id),
    code: row.code as string,
    description: (row.description as string) || (row.short_description as string) || '',
    short_description: (row.short_description as string) || '',
    long_description: (row.long_description as string) || '',
    category: (row.category as string) || '',
    chapter: row.chapter as number | null,
    is_billable: toBool(row.is_billable as number),
    is_active: toBool(row.is_active as number),
  };
}

/**
 * Transforms a clinical template row from PowerSync into the ClinicalTemplate shape.
 */
export function transformClinicalTemplateRow(row: ClinicalTemplateRow & { id: string }) {
  let content;
  try {
    content = row.content ? JSON.parse(row.content as string) : {};
  } catch {
    content = {};
  }
  return {
    id: toNumericId(row.id),
    name: row.name as string,
    template_type: row.template_type as string,
    specialty: (row.specialty as string) || '',
    description: (row.description as string) || '',
    content,
    is_system: toBool(row.is_system as number),
    is_active: toBool(row.is_active as number),
    usage_count: (row.usage_count as number) || 0,
    created_by: row.created_by_id ? toNumericId(row.created_by_id as string) : null,
    created_by_username: null,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    sections: content?.sections || [],
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
  status?: string;
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
    status: (row.status as string) || undefined,
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
// Triage Assessment Transformer
// ---------------------------------------------------------------------------

export interface TriageAssessmentLocalRecord {
  id: number;
  facility_id: number;
  encounter_id: number;
  chief_complaint: string;
  chief_complaint_category?: string;
  pain_score?: number;
  mental_status?: string;
  gcs_eye?: number;
  gcs_verbal?: number;
  gcs_motor?: number;
  mobility?: string;
  arrival_mode?: string;
  spo2?: number;
  heart_rate?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  temperature?: number;
  respiratory_rate?: number;
  weight?: number;
  height?: number;
  triage_category?: string;
  auto_calculated_category?: string;
  assigned_area?: string;
  arrival_time?: string;
  triage_start_time?: string;
  triage_end_time?: string;
  triaged_by: number;
  created_at: string;
  updated_at: string;
  // JOINed fields
  patient_name?: string;
  patient_mrn?: string;
}

export function transformTriageRow(
  row: TriageAssessmentRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string }
): TriageAssessmentLocalRecord {
  return {
    id: toNumericId(row.id),
    facility_id: toNumericId(row.facility_id as string),
    encounter_id: toNumericId(row.encounter_id as string),
    chief_complaint: (row.chief_complaint as string) || '',
    chief_complaint_category: (row.chief_complaint_category as string) || undefined,
    pain_score: row.pain_score as number | undefined,
    mental_status: (row.mental_status as string) || undefined,
    gcs_eye: row.gcs_eye as number | undefined,
    gcs_verbal: row.gcs_verbal as number | undefined,
    gcs_motor: row.gcs_motor as number | undefined,
    mobility: (row.mobility as string) || undefined,
    arrival_mode: (row.arrival_mode as string) || undefined,
    spo2: row.spo2 as number | undefined,
    heart_rate: row.heart_rate as number | undefined,
    systolic_bp: row.systolic_bp as number | undefined,
    diastolic_bp: row.diastolic_bp as number | undefined,
    temperature: row.temperature as number | undefined,
    respiratory_rate: row.respiratory_rate as number | undefined,
    weight: row.weight as number | undefined,
    height: row.height as number | undefined,
    triage_category: (row.triage_category as string) || undefined,
    auto_calculated_category: (row.auto_calculated_category as string) || undefined,
    assigned_area: (row.assigned_area as string) || undefined,
    arrival_time: (row.arrival_time as string) || undefined,
    triage_start_time: (row.triage_start_time as string) || undefined,
    triage_end_time: (row.triage_end_time as string) || undefined,
    triaged_by: toNumericId(row.triaged_by_id as string),
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    patient_name: row.patient_first_name && row.patient_last_name
      ? `${row.patient_first_name} ${row.patient_last_name}`
      : undefined,
    patient_mrn: (row.patient_mrn as string) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Diagnosis Transformer
// ---------------------------------------------------------------------------

export interface DiagnosisLocalRecord {
  id: number;
  encounter_id: number;
  icd10_code_id?: number;
  icd11_code?: string;
  icd11_display?: string;
  snomed_code?: string;
  snomed_display?: string;
  diagnosis_type: string;
  free_text_diagnosis?: string;
  notes?: string;
  is_confirmed: boolean;
  certainty?: string;
  diagnosed_by: number;
  diagnosed_at?: string;
  created_at: string;
  updated_at: string;
  // JOINed ICD-10 fields
  icd10_code?: string;
  icd10_description?: string;
}

export function transformDiagnosisRow(
  row: DiagnosisRow & { id: string; icd10_code_text?: string; icd10_short_description?: string }
): DiagnosisLocalRecord {
  return {
    id: toNumericId(row.id),
    encounter_id: toNumericId(row.encounter_id as string),
    icd10_code_id: row.icd10_code_id ? toNumericId(row.icd10_code_id as string) : undefined,
    icd11_code: (row.icd11_code as string) || undefined,
    icd11_display: (row.icd11_display as string) || undefined,
    snomed_code: (row.snomed_code as string) || undefined,
    snomed_display: (row.snomed_display as string) || undefined,
    diagnosis_type: (row.diagnosis_type as string) || '',
    free_text_diagnosis: (row.free_text_diagnosis as string) || undefined,
    notes: (row.notes as string) || undefined,
    is_confirmed: toBool(row.is_confirmed as number),
    certainty: (row.certainty as string) || undefined,
    diagnosed_by: toNumericId(row.diagnosed_by_id as string),
    diagnosed_at: (row.diagnosed_at as string) || undefined,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    icd10_code: (row.icd10_code_text as string) || undefined,
    icd10_description: (row.icd10_short_description as string) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Prescription Transformer
// ---------------------------------------------------------------------------

export interface PrescriptionLocalRecord {
  id: number;
  prescription_number: string;
  facility_id: number;
  encounter_id?: number;
  patient_id: number;
  prescribed_by: number;
  prescribed_at?: string;
  valid_until?: string;
  status: string;
  dispensing_type?: string;
  is_discharge_medication: boolean;
  clinical_notes?: string;
  created_at: string;
  updated_at: string;
  // JOINed fields
  patient_name?: string;
  patient_mrn?: string;
}

export function transformPrescriptionRow(
  row: PrescriptionRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string }
): PrescriptionLocalRecord {
  return {
    id: toNumericId(row.id),
    prescription_number: (row.prescription_number as string) || '',
    facility_id: toNumericId(row.facility_id as string),
    encounter_id: row.encounter_id ? toNumericId(row.encounter_id as string) : undefined,
    patient_id: toNumericId(row.patient_id as string),
    prescribed_by: toNumericId(row.prescribed_by_id as string),
    prescribed_at: (row.prescribed_at as string) || undefined,
    valid_until: (row.valid_until as string) || undefined,
    status: (row.status as string) || '',
    dispensing_type: (row.dispensing_type as string) || undefined,
    is_discharge_medication: toBool(row.is_discharge_medication as number),
    clinical_notes: (row.clinical_notes as string) || undefined,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    patient_name: row.patient_first_name && row.patient_last_name
      ? `${row.patient_first_name} ${row.patient_last_name}`
      : undefined,
    patient_mrn: (row.patient_mrn as string) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Lab Order Transformer
// ---------------------------------------------------------------------------

export interface LabOrderLocalRecord {
  id: number;
  order_number: string;
  facility_id: number;
  patient_id: number;
  encounter_id?: number;
  ordered_by: number;
  order_type?: string;
  priority?: string;
  clinical_notes?: string;
  status: string;
  specimen_collected: boolean;
  specimen_collected_at?: string;
  sample_type?: string;
  total_cost?: number;
  is_paid: boolean;
  ordered_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  // JOINed fields
  patient_name?: string;
  patient_mrn?: string;
}

export function transformLabOrderRow(
  row: LabOrderRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string }
): LabOrderLocalRecord {
  return {
    id: toNumericId(row.id),
    order_number: (row.order_number as string) || '',
    facility_id: toNumericId(row.facility_id as string),
    patient_id: toNumericId(row.patient_id as string),
    encounter_id: row.encounter_id ? toNumericId(row.encounter_id as string) : undefined,
    ordered_by: toNumericId(row.ordered_by_id as string),
    order_type: (row.order_type as string) || undefined,
    priority: (row.priority as string) || undefined,
    clinical_notes: (row.clinical_notes as string) || undefined,
    status: (row.status as string) || '',
    specimen_collected: toBool(row.specimen_collected as number),
    specimen_collected_at: (row.specimen_collected_at as string) || undefined,
    sample_type: (row.sample_type as string) || undefined,
    total_cost: row.total_cost as number | undefined,
    is_paid: toBool(row.is_paid as number),
    ordered_at: (row.ordered_at as string) || undefined,
    completed_at: (row.completed_at as string) || undefined,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    patient_name: row.patient_first_name && row.patient_last_name
      ? `${row.patient_first_name} ${row.patient_last_name}`
      : undefined,
    patient_mrn: (row.patient_mrn as string) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Invoice Transformer
// ---------------------------------------------------------------------------

export interface InvoiceLocalRecord {
  id: number;
  invoice_number: string;
  facility_id: number;
  patient_id: number;
  encounter_id?: number;
  status: string;
  payment_type?: string;
  invoice_date?: string;
  due_date?: string;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  amount_paid?: number;
  balance_due?: number;
  insurance_provider?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // JOINed fields
  patient_name?: string;
  patient_mrn?: string;
}

export function transformInvoiceRow(
  row: InvoiceRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string }
): InvoiceLocalRecord {
  return {
    id: toNumericId(row.id),
    invoice_number: (row.invoice_number as string) || '',
    facility_id: toNumericId(row.facility_id as string),
    patient_id: toNumericId(row.patient_id as string),
    encounter_id: row.encounter_id ? toNumericId(row.encounter_id as string) : undefined,
    status: (row.status as string) || '',
    payment_type: (row.payment_type as string) || undefined,
    invoice_date: (row.invoice_date as string) || undefined,
    due_date: (row.due_date as string) || undefined,
    subtotal: row.subtotal as number | undefined,
    tax_amount: row.tax_amount as number | undefined,
    discount_amount: row.discount_amount as number | undefined,
    total_amount: row.total_amount as number | undefined,
    amount_paid: row.amount_paid as number | undefined,
    balance_due: row.balance_due as number | undefined,
    insurance_provider: (row.insurance_provider as string) || undefined,
    notes: (row.notes as string) || undefined,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
    patient_name: row.patient_first_name && row.patient_last_name
      ? `${row.patient_first_name} ${row.patient_last_name}`
      : undefined,
    patient_mrn: (row.patient_mrn as string) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Treatment Plan Transformer
// ---------------------------------------------------------------------------

export interface TreatmentPlanLocalRecord {
  id: number;
  encounter: number;
  template?: number;
  clinical_notes: string;
  medications_json: unknown;
  procedures_json: unknown;
  follow_up_instructions: string;
  follow_up_date: string | null;
  diet_recommendations: string;
  activity_restrictions: string;
  referral_needed: boolean;
  referral_specialty: string;
  referral_notes: string;
  status: string;
  created_by?: number | null;
  approved_by?: number | null;
  created_at: string;
  updated_at: string;
}

export function transformTreatmentPlanRow(
  row: TreatmentPlanRow & { id: string }
): TreatmentPlanLocalRecord {
  let medicationsJson: unknown = [];
  let proceduresJson: unknown = [];
  try { medicationsJson = row.medications_json ? JSON.parse(row.medications_json as string) : []; } catch { /* keep default */ }
  try { proceduresJson = row.procedures_json ? JSON.parse(row.procedures_json as string) : []; } catch { /* keep default */ }

  return {
    id: toNumericId(row.id),
    encounter: toNumericId(row.encounter_id as string),
    template: row.template_id ? toNumericId(row.template_id as string) : undefined,
    clinical_notes: (row.clinical_notes as string) || '',
    medications_json: medicationsJson,
    procedures_json: proceduresJson,
    follow_up_instructions: (row.follow_up_instructions as string) || '',
    follow_up_date: (row.follow_up_date as string) || null,
    diet_recommendations: (row.diet_recommendations as string) || '',
    activity_restrictions: (row.activity_restrictions as string) || '',
    referral_needed: toBool(row.referral_needed as number),
    referral_specialty: (row.referral_specialty as string) || '',
    referral_notes: (row.referral_notes as string) || '',
    status: (row.status as string) || 'DRAFT',
    created_by: row.created_by_id ? toNumericId(row.created_by_id as string) : null,
    approved_by: row.approved_by_id ? toNumericId(row.approved_by_id as string) : null,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
  };
}

// ---------------------------------------------------------------------------
// Medication Transformer
// ---------------------------------------------------------------------------

export interface MedicationLocalRecord {
  id: number;
  treatment_plan: number;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
}

export function transformMedicationRow(
  row: MedicationRow & { id: string }
): MedicationLocalRecord {
  return {
    id: toNumericId(row.id),
    treatment_plan: toNumericId(row.treatment_plan_id as string),
    name: (row.name as string) || '',
    dosage: (row.dosage as string) || '',
    frequency: (row.frequency as string) || '',
    duration: (row.duration as string) || '',
    route: (row.route as string) || '',
    quantity: String((row.quantity as number) ?? ''),
    instructions: (row.instructions as string) || '',
    start_date: (row.start_date as string) || null,
    end_date: (row.end_date as string) || null,
    created_at: (row.created_at as string) || '',
    updated_at: (row.updated_at as string) || '',
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
  ClinicalTemplateRow,
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

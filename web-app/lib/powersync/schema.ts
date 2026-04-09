/**
 * PowerSync Client-Side Schema
 *
 * Defines the local SQLite schema used by PowerSync in the browser.
 * Must mirror the columns listed in backend/powersync/sync-rules.yaml.
 *
 * SECURITY: Encrypted fields (national_id, phone_number, identification_number)
 * are deliberately EXCLUDED. They remain API-only (Kenya DPA 2019 compliance).
 */

import { column, Schema, Table } from '@powersync/web';

// ---------------------------------------------------------------------------
// Reference data (global — synced to all users)
// ---------------------------------------------------------------------------

const counties = new Table(
  {
    code: column.integer,
    name: column.text,
  },
  { indexes: { by_name: ['name'] } }
);

const sub_counties = new Table(
  {
    county_id: column.text,
    name: column.text,
  },
  { indexes: { by_county: ['county_id'] } }
);

const wards = new Table(
  {
    sub_county_id: column.text,
    name: column.text,
  },
  { indexes: { by_sub_county: ['sub_county_id'] } }
);

const icd10_codes = new Table(
  {
    code: column.text,
    short_description: column.text,
    description: column.text,
    long_description: column.text,
    category: column.text,
    chapter: column.integer,
    is_billable: column.integer,
    is_active: column.integer,
  },
  { indexes: { by_code: ['code'], by_category: ['category'] } }
);

const clinical_templates = new Table(
  {
    name: column.text,
    template_type: column.text,
    specialty: column.text,
    description: column.text,
    content: column.text, // JSON stored as text
    is_system: column.integer,
    is_active: column.integer,
    usage_count: column.integer,
    created_by_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_type: ['template_type'], by_specialty: ['specialty'] } }
);

// ---------------------------------------------------------------------------
// Organization-scoped data
// ---------------------------------------------------------------------------

const patients = new Table(
  {
    organization_id: column.text,
    registered_at_facility_id: column.text,
    mrn: column.text,
    first_name: column.text,
    middle_name: column.text,
    last_name: column.text,
    title: column.text,
    date_of_birth: column.text,
    gender: column.text,
    cr_number: column.text,
    sha_number: column.text,
    email: column.text,
    address: column.text,
    citizenship: column.text,
    identification_type: column.text,
    is_person_with_disability: column.integer,
    is_sensitive: column.integer,
    consent_given: column.integer,
    consent_date: column.text,
    consent_deferred: column.integer,
    registered_by_id: column.text,
    referral_source: column.text,
    referred_from_facility: column.text,
    county_id: column.text,
    sub_county_id: column.text,
    ward_id: column.text,
    is_deceased: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_mrn: ['mrn'], by_name: ['last_name', 'first_name'] } }
);

const emergency_contacts = new Table(
  {
    patient_id: column.text,
    full_name: column.text,
    relationship: column.text,
    phone_number: column.text,
    alternative_phone: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_patient: ['patient_id'] } }
);

// ---------------------------------------------------------------------------
// Facility-scoped data
// ---------------------------------------------------------------------------

const encounters = new Table(
  {
    organization_id: column.text,
    facility_id: column.text,
    patient_id: column.text,
    clinic_visit_id: column.text,
    encounter_type: column.text,
    encounter_date: column.text,
    chief_complaint: column.text,
    temperature: column.real,
    pulse: column.integer,
    blood_pressure: column.text,
    respiratory_rate: column.integer,
    spo2: column.real,
    weight: column.real,
    height: column.real,
    notes: column.text,
    triage_requirement: column.text,
    triage_status: column.text,
    consultation_status: column.text,
    created_by_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_patient: ['patient_id'],
      by_date: ['encounter_date'],
      by_facility: ['facility_id'],
    },
  }
);

// Phase 2: Clinical workflow tables

const triage_assessments = new Table(
  {
    organization_id: column.text,
    facility_id: column.text,
    encounter_id: column.text,
    chief_complaint: column.text,
    chief_complaint_category: column.text,
    pain_score: column.integer,
    mental_status: column.text,
    gcs_eye: column.integer,
    gcs_verbal: column.integer,
    gcs_motor: column.integer,
    mobility: column.text,
    arrival_mode: column.text,
    referring_facility_name: column.text,
    allergies_noted: column.text,
    spo2: column.real,
    heart_rate: column.integer,
    systolic_bp: column.integer,
    diastolic_bp: column.integer,
    temperature: column.real,
    respiratory_rate: column.integer,
    weight: column.real,
    height: column.real,
    triage_category: column.text,
    auto_calculated_category: column.text,
    category_override_reason: column.text,
    assigned_area: column.text,
    assigned_clinic_id: column.text,
    assigned_clinician_id: column.text,
    arrival_time: column.text,
    triage_start_time: column.text,
    triage_end_time: column.text,
    seen_by_clinician_time: column.text,
    alerts: column.text, // JSON stored as text
    triaged_by_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_encounter: ['encounter_id'],
      by_category: ['triage_category'],
      by_facility: ['facility_id'],
    },
  }
);

const diagnoses = new Table(
  {
    encounter_id: column.text,
    icd10_code_id: column.text,
    icd11_code: column.text,
    icd11_display: column.text,
    snomed_code: column.text,
    snomed_display: column.text,
    diagnosis_type: column.text,
    free_text_diagnosis: column.text,
    notes: column.text,
    is_confirmed: column.integer,
    certainty: column.text,
    diagnosed_by_id: column.text,
    diagnosed_at: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_encounter: ['encounter_id'], by_icd10: ['icd10_code_id'] } }
);

const treatment_plans = new Table(
  {
    encounter_id: column.text,
    template_id: column.text,
    medications_json: column.text,
    procedures_json: column.text,
    clinical_notes: column.text,
    follow_up_instructions: column.text,
    follow_up_date: column.text,
    diet_recommendations: column.text,
    activity_restrictions: column.text,
    referral_needed: column.integer,
    referral_specialty: column.text,
    referral_notes: column.text,
    status: column.text,
    created_by_id: column.text,
    approved_by_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_encounter: ['encounter_id'], by_status: ['status'] } }
);

const medications = new Table(
  {
    treatment_plan_id: column.text,
    name: column.text,
    dosage: column.text,
    frequency: column.text,
    duration: column.text,
    route: column.text,
    quantity: column.integer,
    instructions: column.text,
    start_date: column.text,
    end_date: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_treatment_plan: ['treatment_plan_id'] } }
);

// Phase 3: Pharmacy, Laboratory, Billing tables

const prescriptions = new Table(
  {
    prescription_number: column.text,
    organization_id: column.text,
    facility_id: column.text,
    encounter_id: column.text,
    admission_id: column.text,
    patient_id: column.text,
    prescribed_by_id: column.text,
    prescribed_at: column.text,
    valid_until: column.text,
    status: column.text,
    dispensing_type: column.text,
    is_discharge_medication: column.integer,
    clinical_notes: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_patient: ['patient_id'],
      by_encounter: ['encounter_id'],
      by_status: ['status'],
    },
  }
);

const prescription_items = new Table(
  {
    prescription_id: column.text,
    drug_id: column.text,
    quantity: column.integer,
    dosage: column.text,
    frequency: column.text,
    duration: column.text,
    route: column.text,
    instructions: column.text,
    quantity_dispensed: column.integer,
    is_substitutable: column.integer,
    is_cancelled: column.integer,
    cancellation_reason: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_prescription: ['prescription_id'] } }
);

const lab_orders = new Table(
  {
    order_number: column.text,
    organization_id: column.text,
    facility_id: column.text,
    patient_id: column.text,
    encounter_id: column.text,
    admission_id: column.text,
    ordered_by_id: column.text,
    order_type: column.text,
    priority: column.text,
    clinical_notes: column.text,
    status: column.text,
    status_changed_at: column.text,
    status_changed_by_id: column.text,
    specimen_collected: column.integer,
    specimen_collected_at: column.text,
    specimen_collected_by_id: column.text,
    sample_type: column.text,
    total_cost: column.real,
    is_paid: column.integer,
    ordered_at: column.text,
    completed_at: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_patient: ['patient_id'],
      by_encounter: ['encounter_id'],
      by_status: ['status'],
    },
  }
);

const lab_order_items = new Table(
  {
    lab_order_id: column.text,
    test_id: column.text,
    status: column.text,
    unit_cost: column.real,
    special_instructions: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_order: ['lab_order_id'] } }
);

const lab_results = new Table(
  {
    order_item_id: column.text,
    specimen_id: column.text,
    numeric_value: column.real,
    text_value: column.text,
    option_value: column.text,
    result_unit: column.text,
    reference_low: column.real,
    reference_high: column.real,
    reference_range_text: column.text,
    result_flag: column.text,
    interpretation: column.text,
    is_critical_result: column.integer,
    method: column.text,
    equipment: column.text,
    verification_status: column.text,
    verified_by_id: column.text,
    verified_at: column.text,
    entered_by_id: column.text,
    entered_at: column.text,
    is_amended: column.integer,
    amendment_reason: column.text,
    original_value: column.text,
    amended_by_id: column.text,
    amended_at: column.text,
    is_external_result: column.integer,
    external_result_date: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_order_item: ['order_item_id'],
      by_verification: ['verification_status'],
    },
  }
);

const invoices = new Table(
  {
    invoice_number: column.text,
    organization_id: column.text,
    facility_id: column.text,
    patient_id: column.text,
    encounter_id: column.text,
    clinic_visit_id: column.text,
    status: column.text,
    payment_type: column.text,
    invoice_date: column.text,
    due_date: column.text,
    discount_type: column.text,
    discount_value: column.real,
    subtotal: column.real,
    tax_amount: column.real,
    discount_amount: column.real,
    discount_reason: column.text,
    total_amount: column.real,
    amount_paid: column.real,
    balance_due: column.real,
    insurance_provider: column.text,
    insurance_member_no: column.text,
    sha_claim_number: column.text,
    insurance_amount: column.real,
    insurance_coverage: column.real,
    notes: column.text,
    created_by_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {
    indexes: {
      by_patient: ['patient_id'],
      by_encounter: ['encounter_id'],
      by_status: ['status'],
      by_date: ['invoice_date'],
    },
  }
);

// ---------------------------------------------------------------------------
// Assembled schema — table keys must match PowerSync bucket data table names
// ---------------------------------------------------------------------------

export const powersyncSchema = new Schema({
  // Global reference data (from global_* buckets)
  core_county: counties,
  core_subcounty: sub_counties,
  core_ward: wards,
  encounters_icd10code: icd10_codes,
  clinical_templates_clinicaltemplate: clinical_templates,

  // Organization-scoped (from org_patients bucket)
  patients_patient: patients,
  patients_emergencycontact: emergency_contacts,

  // Facility-scoped (from facility_* buckets)
  encounters_encounter: encounters,
  triage_triageassessment: triage_assessments,
  encounters_diagnosis: diagnoses,
  encounters_treatmentplan: treatment_plans,
  encounters_medication: medications,
  pharmacy_prescription: prescriptions,
  pharmacy_prescriptionitem: prescription_items,
  laboratory_laborder: lab_orders,
  laboratory_laborderitem: lab_order_items,
  laboratory_labresult: lab_results,
  billing_invoice: invoices,
});

// ---------------------------------------------------------------------------
// Convenience row types
// ---------------------------------------------------------------------------

/** Convenience type for a row from the patients_patient table. */
export type PatientRow = (typeof powersyncSchema)['types']['patients_patient'];

/** Convenience type for a row from the encounters_encounter table. */
export type EncounterRow = (typeof powersyncSchema)['types']['encounters_encounter'];

/** Convenience type for a county row. */
export type CountyRow = (typeof powersyncSchema)['types']['core_county'];

/** Convenience type for a sub-county row. */
export type SubCountyRow = (typeof powersyncSchema)['types']['core_subcounty'];

/** Convenience type for a ward row. */
export type WardRow = (typeof powersyncSchema)['types']['core_ward'];

/** Convenience type for an ICD-10 code row. */
export type ICD10CodeRow = (typeof powersyncSchema)['types']['encounters_icd10code'];

/** Convenience type for a clinical template row. */
export type ClinicalTemplateRow =
  (typeof powersyncSchema)['types']['clinical_templates_clinicaltemplate'];

/** Convenience type for a triage assessment row. */
export type TriageAssessmentRow =
  (typeof powersyncSchema)['types']['triage_triageassessment'];

/** Convenience type for a diagnosis row. */
export type DiagnosisRow = (typeof powersyncSchema)['types']['encounters_diagnosis'];

/** Convenience type for a treatment plan row. */
export type TreatmentPlanRow =
  (typeof powersyncSchema)['types']['encounters_treatmentplan'];

/** Convenience type for a medication row. */
export type MedicationRow = (typeof powersyncSchema)['types']['encounters_medication'];

/** Convenience type for a prescription row. */
export type PrescriptionRow =
  (typeof powersyncSchema)['types']['pharmacy_prescription'];

/** Convenience type for a prescription item row. */
export type PrescriptionItemRow =
  (typeof powersyncSchema)['types']['pharmacy_prescriptionitem'];

/** Convenience type for a lab order row. */
export type LabOrderRow = (typeof powersyncSchema)['types']['laboratory_laborder'];

/** Convenience type for a lab order item row. */
export type LabOrderItemRow =
  (typeof powersyncSchema)['types']['laboratory_laborderitem'];

/** Convenience type for a lab result row. */
export type LabResultRow = (typeof powersyncSchema)['types']['laboratory_labresult'];

/** Convenience type for an invoice row. */
export type InvoiceRow = (typeof powersyncSchema)['types']['billing_invoice'];

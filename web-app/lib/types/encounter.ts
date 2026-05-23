/**
 * Encounter-related TypeScript types.
 * Enhanced types for clinical encounters, diagnoses, and treatment plans.
 */

/** Lightweight CDS alert embedded in encounter API responses (advisory-only). */
export interface InlineCDSAlert {
  id: number;
  rule_code: string;
  rule_name: string;
  priority: string;
  status: string;
  message: string;
  suggestion: string;
  is_critical: boolean;
  created_at: string;
}

export interface Encounter {
  id: number;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  patient_gender?: 'M' | 'F' | 'O' | null;
  patient_date_of_birth?: string | null;

  // Encounter details
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;
  status: EncounterStatus;

  // Encounter Linking (Sprint 2 - Phase 2B)
  linked_encounter?: number | null;

  // Visit Reason (Sprint 2 - Phase 2D)
  visit_reason?: VisitReason;

  // Vitals
  temperature?: number | null;
  pulse?: number | null;
  blood_pressure?: string | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;

  // Computed vitals
  bmi?: number | null;
  bmi_classification?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  has_critical_vitals?: boolean;
  alerts?: string | null;
  cds_alerts?: InlineCDSAlert[];
  vitals_summary?: string | null;

  // Vitals source tracking
  vitals_source?: 'TRIAGE' | 'CONSULTATION' | 'NURSING' | null;
  vitals_recorded_by?: number | null;
  vitals_recorded_at?: string | null;

  // Clinical template
  clinical_template?: number | null;
  clinical_template_data?: Record<string, Record<string, unknown>> | null;

  // Medical history
  allergies?: string | null;
  chronic_conditions?: string | null;
  current_medications?: string | null;
  past_surgeries?: string | null;
  family_history?: string | null;
  social_history?: string | null;

  // Clinical notes
  notes?: string | null;
  history_of_present_illness?: string | null;
  physical_examination?: string | null;
  assessment?: string | null;
  // Note: SOAP 'P' (Plan) is TreatmentPlan-only (see TreatmentPlan.clinical_notes)

  // Status workflow
  finalized_by?: number | null;
  finalized_by_username?: string | null;
  finalized_at?: string | null;
  cancellation_reason?: string | null;

  // Disposition (Clinical Documentation Enhancement)
  disposition?: EncounterDisposition | null;
  disposition_notes?: string | null;

  // Triage fields
  triage_status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';

  // Consultation tracking
  consultation_status?: ConsultationStatus | null;

  // Clinician Assignment (Data Integrity - Sprint 1.7)
  assigned_clinician?: number | null;
  assigned_clinician_username?: string | null;
  assigned_clinician_name?: string | null;
  claimed_at?: string | null;

  // Chief complaint edit tracking
  chief_complaint_original?: string | null;
  chief_complaint_edited?: boolean;
  chief_complaint_edit_reason?: string | null;
  chief_complaint_edit_reason_other?: string | null;
  chief_complaint_edited_by?: number | null;
  chief_complaint_edited_by_username?: string | null;
  chief_complaint_edited_at?: string | null;

  // Metadata
  created_by?: number | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Diagnosis {
  id: number;
  encounter: number;
  icd10_code: number | null;
  icd10_code_display?: string | null;
  icd10_display?: string | null; // Alias for display text
  icd10_description?: string | null;
  icd11_code?: string | null;
  icd11_display?: string | null;
  // SNOMED CT (supplementary coding for FHIR interoperability)
  snomed_code?: string | null;
  snomed_display?: string | null;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
  free_text_diagnosis?: string | null;
  notes: string;
  is_confirmed: boolean;
  certainty: 'suspected' | 'probable' | 'confirmed' | 'ruled_out' | 'provisional';
  diagnosed_by?: number | null;
  diagnosed_by_name?: string | null;
  diagnosed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlan {
  id: number;
  encounter: number;
  template?: number | null;
  template_name?: string | null;
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
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED';
  has_follow_up?: boolean;
  has_referral?: boolean;
  medications: Medication[];
  created_by?: number | null;
  created_by_name?: string | null;
  approved_by?: number | null;
  approved_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Medication {
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
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VitalSign {
  name: string;
  value: number | string | null | undefined;
  unit: string;
  normalRange: string;
  isAbnormal: boolean;
  isCritical: boolean;
}

export interface EncounterListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  status?: string;
  encounter_date?: string;
  encounter_type?: string;
  visit_reason?: string;
  search?: string;
  ordering?: string;
}

// =============================================================================
// Encounter Status (Sprint 2 - Enhanced State Machine)
// =============================================================================

export type EncounterStatus =
  | 'CREATED'
  | 'CHECKED_IN'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'ORDERS_PLACED'
  | 'RESULTS_PENDING'
  | 'READY_TO_CLOSE'
  | 'CLOSED'
  | 'COMPLETED'
  | 'CANCELLED';

export const ENCOUNTER_STATUS_DISPLAY: Record<EncounterStatus, string> = {
  CREATED: 'Created',
  CHECKED_IN: 'Checked In',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  ORDERS_PLACED: 'Orders Placed',
  RESULTS_PENDING: 'Results Pending',
  READY_TO_CLOSE: 'Ready to Close',
  CLOSED: 'Closed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// Valid state transitions
export const VALID_ENCOUNTER_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> = {
  CREATED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['TRIAGED', 'IN_PROGRESS', 'CANCELLED'],
  TRIAGED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'ORDERS_PLACED', 'READY_TO_CLOSE', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  ORDERS_PLACED: ['RESULTS_PENDING', 'READY_TO_CLOSE'],
  RESULTS_PENDING: ['READY_TO_CLOSE'],
  READY_TO_CLOSE: ['CLOSED'],
  CLOSED: [],
  COMPLETED: [],
  CANCELLED: [],
};

// =============================================================================
// Encounter Disposition (Clinical Documentation Enhancement)
// =============================================================================

export type EncounterDisposition =
  | ''
  | 'ADVICE_ONLY'
  | 'TREATED_DISCHARGED'
  | 'REFERRED'
  | 'ADMITTED'
  | 'FOLLOW_UP_SCHEDULED'
  | 'LEFT_AMA';

export const ENCOUNTER_DISPOSITION_DISPLAY: Record<EncounterDisposition, string> = {
  '': 'Not Set',
  ADVICE_ONLY: 'Advice Only',
  TREATED_DISCHARGED: 'Treated & Discharged',
  REFERRED: 'Referred to Specialist',
  ADMITTED: 'Admitted to Inpatient',
  FOLLOW_UP_SCHEDULED: 'Follow-up Scheduled',
  LEFT_AMA: 'Left Against Medical Advice',
};

// Dispositions that require notes
export const DISPOSITIONS_REQUIRING_NOTES: EncounterDisposition[] = [
  'ADVICE_ONLY',
  'LEFT_AMA',
  'REFERRED',
];

// Visit Reason (Sprint 2 - Phase 2D)
export type VisitReason =
  | 'NEW_COMPLAINT'
  | 'FOLLOW_UP'
  | 'CHRONIC_CARE'
  | 'SCHEDULED_PROCEDURE'
  | 'PROCEDURE_REVIEW'
  | 'REFILL_ONLY'
  | 'LAB_REVIEW'
  | 'REFERRAL_VISIT'
  | 'EMERGENCY'
  | 'OTHER';

export const VISIT_REASON_DISPLAY: Record<VisitReason, string> = {
  NEW_COMPLAINT: 'New Complaint',
  FOLLOW_UP: 'Follow-up',
  CHRONIC_CARE: 'Chronic Care Review',
  SCHEDULED_PROCEDURE: 'Scheduled Procedure',
  PROCEDURE_REVIEW: 'Post-Procedure Review',
  REFILL_ONLY: 'Medication Refill Only',
  LAB_REVIEW: 'Lab Results Review',
  REFERRAL_VISIT: 'Referral from Another Facility',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
};

// Visit reasons that can skip triage
export const SKIP_TRIAGE_REASONS: VisitReason[] = ['LAB_REVIEW', 'REFILL_ONLY', 'SCHEDULED_PROCEDURE'];

// Encounter state transition request/response
export interface EncounterTransitionRequest {
  to_status: EncounterStatus;
  reason?: string;
}

export interface EncounterTransitionResponse {
  id: number;
  status: EncounterStatus;
  previous_status: EncounterStatus;
  transitioned_at: string;
  transitioned_by: string;
}

// Related encounters response
export interface RelatedEncounter {
  id: number;
  patient: number;
  patient_mrn: string;
  patient_name: string;
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;
  status: EncounterStatus;
  visit_reason?: VisitReason;
  created_at: string;
}

// =============================================================================
// Consultation Queue Types (Phase 3.1)
// Aligned with backend hmis/apps/encounters/models.py
// =============================================================================

// Encounter Type Choices - matches ENCOUNTER_TYPE_CHOICES
export type EncounterType =
  // Existing (MANDATORY triage)
  | 'OPD'           // Outpatient Department
  | 'IPD'           // Inpatient Department
  | 'EMERGENCY'     // Emergency
  // High-risk clinics (MANDATORY triage)
  | 'ANC'           // Antenatal Clinic
  | 'PAEDIATRIC'    // Paediatric Clinic
  | 'DIALYSIS'      // Dialysis Unit
  | 'ONCOLOGY'      // Oncology Clinic
  // Scheduled visits (OPTIONAL triage)
  | 'SCHEDULED_OPD' // Scheduled Outpatient
  | 'FOLLOW_UP'     // Follow-up Visit
  | 'CONSULTANT_REVIEW' // Consultant Review
  | 'CHRONIC_STABLE'    // Stable Chronic Care
  | 'SPECIALIST_CLINIC' // Specialist Clinic
  // Pre-assessed (NOT_REQUIRED triage)
  | 'PROCEDURE'     // Scheduled Procedure
  | 'DAY_CASE'      // Day Case
  | 'WARD_ROUND'    // Ward Round
  | 'DISCHARGE_REVIEW'; // Discharge Review

// Display labels for encounter types
export const ENCOUNTER_TYPE_DISPLAY: Record<EncounterType, string> = {
  OPD: 'Outpatient Department',
  IPD: 'Inpatient Department',
  EMERGENCY: 'Emergency',
  ANC: 'Antenatal Clinic',
  PAEDIATRIC: 'Paediatric Clinic',
  DIALYSIS: 'Dialysis Unit',
  ONCOLOGY: 'Oncology Clinic',
  SCHEDULED_OPD: 'Scheduled Outpatient',
  FOLLOW_UP: 'Follow-up Visit',
  CONSULTANT_REVIEW: 'Consultant Review',
  CHRONIC_STABLE: 'Stable Chronic Care',
  SPECIALIST_CLINIC: 'Specialist Clinic',
  PROCEDURE: 'Scheduled Procedure',
  DAY_CASE: 'Day Case',
  WARD_ROUND: 'Ward Round',
  DISCHARGE_REVIEW: 'Discharge Review',
};

// Triage Requirement - matches TRIAGE_REQUIREMENT_CHOICES
export type TriageRequirement = 'MANDATORY' | 'OPTIONAL' | 'NOT_REQUIRED';

// Maps encounter type to triage requirement - matches ENCOUNTER_TYPE_TRIAGE_MAP
export const ENCOUNTER_TYPE_TRIAGE_MAP: Record<EncounterType, TriageRequirement> = {
  // Mandatory triage types
  OPD: 'MANDATORY',
  IPD: 'MANDATORY',
  EMERGENCY: 'MANDATORY',
  ANC: 'MANDATORY',
  PAEDIATRIC: 'MANDATORY',
  DIALYSIS: 'MANDATORY',
  ONCOLOGY: 'MANDATORY',
  // Optional triage types
  SCHEDULED_OPD: 'OPTIONAL',
  FOLLOW_UP: 'OPTIONAL',
  CONSULTANT_REVIEW: 'OPTIONAL',
  CHRONIC_STABLE: 'OPTIONAL',
  SPECIALIST_CLINIC: 'OPTIONAL',
  // Not required triage types
  PROCEDURE: 'NOT_REQUIRED',
  DAY_CASE: 'NOT_REQUIRED',
  WARD_ROUND: 'NOT_REQUIRED',
  DISCHARGE_REVIEW: 'NOT_REQUIRED',
};

// Triage Status - matches TRIAGE_STATUS_CHOICES
export type TriageStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';

export const TRIAGE_STATUS_DISPLAY: Record<TriageStatus, string> = {
  PENDING: 'Pending - Awaiting triage',
  IN_PROGRESS: 'In Progress - Being triaged',
  COMPLETED: 'Completed - Triage done',
  BYPASSED: 'Bypassed - Triage skipped',
  NOT_APPLICABLE: 'Not Applicable - Triage not required',
};

// Triage Category (imported from triage module for consistency)
// Note: Using union with null for nullable triage category
import type { TriageCategory as BaseTriageCategory } from './triage';
export type TriageCategory = BaseTriageCategory | null;

// Triage Bypass Reason - matches TRIAGE_BYPASS_REASON_CHOICES
export type TriageBypassReason =
  | 'STABLE_FOLLOW_UP'      // Stable follow-up patient
  | 'CONSULTANT_DECISION'   // Consultant/senior decision
  | 'CHRONIC_CARE_REVIEW'   // Chronic care review
  | 'STAFF_SHORTAGE'        // Staff shortage
  | 'PATIENT_PREFERENCE'    // Patient preference
  | 'OTHER'                 // Other reason
  | null;

export const TRIAGE_BYPASS_REASON_DISPLAY: Record<Exclude<TriageBypassReason, null>, string> = {
  STABLE_FOLLOW_UP: 'Stable follow-up patient',
  CONSULTANT_DECISION: 'Consultant/senior decision',
  CHRONIC_CARE_REVIEW: 'Chronic care review',
  STAFF_SHORTAGE: 'Staff shortage',
  PATIENT_PREFERENCE: 'Patient preference',
  OTHER: 'Other reason',
};

// Consultation Status - matches CONSULTATION_STATUS_CHOICES
export type ConsultationStatus = 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED';

export const CONSULTATION_STATUS_DISPLAY: Record<ConsultationStatus, string> = {
  WAITING: 'Waiting for consultation',
  CALLED: 'Called - Patient summoned',
  IN_PROGRESS: 'In Progress - Being seen',
  COMPLETED: 'Completed - Consultation done',
};

export interface ConsultationQueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number;
  patient_gender: 'M' | 'F' | 'O';
  encounter_type: string;
  encounter_type_display: string;
  chief_complaint: string;
  triage_status: TriageStatus;
  triage_category: TriageCategory;
  triage_bypass_reason: TriageBypassReason;
  consultation_status: ConsultationStatus;
  arrival_time: string;
  triage_completed_at: string | null;
  wait_time_minutes: number;
  called_at: string | null;
  // Clinician Assignment (Data Integrity - Sprint 1.7)
  assigned_clinician?: number | null;
  assigned_clinician_username?: string | null;
  assigned_clinician_name?: string | null;
  claimed_at?: string | null;
}

export interface ConsultationQueueFilters {
  consultation_status?: ConsultationStatus;
  triage_status?: TriageStatus;
  search?: string;
}

export interface ConsultationQueueStats {
  total: number;
  waiting: number;
  called: number;
  by_category: {
    RED: number;
    ORANGE: number;
    YELLOW: number;
    GREEN: number;
    BLUE: number;
    bypassed: number;
    direct: number;
  };
}

// =============================================================================
// Clinician Claim/Release Types (Data Integrity - Sprint 1.7)
// =============================================================================

export interface EncounterClaimResponse {
  status: 'claimed';
  encounter_id: number;
  claimed_by: string;
  claimed_at: string;
}

export interface EncounterReleaseResponse {
  status: 'released';
  encounter_id: number;
}

export interface MyClaimedEncountersParams {
  status?: 'DRAFT' | 'IN_PROGRESS';
  include_completed?: boolean;
}

export interface MyClaimedEncountersResponse {
  results: Encounter[];
  count: number;
}

/**
 * Parameters for fetching all claimed encounters (supervisor view)
 */
export interface AllClaimedEncountersParams {
  status?: 'DRAFT' | 'IN_PROGRESS';
  include_completed?: boolean;
  clinician?: number;
  department?: number;
}

export type AllClaimedEncountersResponse = MyClaimedEncountersResponse;

// =============================================================================
// SNOMED CT Search Result
// =============================================================================

/**
 * SNOMED CT concept result from Snowstorm API or local cache.
 * Returned by GET /api/encounters/snomed/search/?q={query}
 */
export interface SNOMEDSearchResult {
  concept_id: string;
  display: string;
  semantic_tag: string;
}

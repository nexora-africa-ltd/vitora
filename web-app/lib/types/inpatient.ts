import { PaginatedResponse } from '@/lib/types';

export type InpatientWardType =
  | 'MEDICAL'
  | 'SURGICAL'
  | 'PEDIATRIC'
  | 'MATERNITY'
  | 'ICU'
  | 'ISOLATION';

export interface InpatientWard {
  id: number;
  name: string;
  code: string;
  ward_type: InpatientWardType;
  ward_type_display?: string;
  floor?: string;
  capacity: number;
  description?: string;
  is_active: boolean;
  daily_rate: string;
  available_beds?: number;
  total_beds?: number;
  occupied_beds?: number;
  occupancy_rate?: number;
  // Ward constraints
  gender_restriction?: 'ANY' | 'MALE_ONLY' | 'FEMALE_ONLY' | null;
  min_age_years?: number | null;
  max_age_years?: number | null;
  isolation_capable?: boolean;
  oxygen_equipped?: boolean;
  ventilator_capable?: boolean;
  maternity_designated?: boolean;
  // Phase C: Smart allocation
  emergency_buffer_percent?: number;
  created_at?: string;
  updated_at?: string;
}

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE' | 'RESERVED';

export type BedType = 'STANDARD' | 'PRIVATE' | 'ICU' | 'HDU' | 'ISOLATION';

export interface Bed {
  id: number;
  ward: number;
  ward_name?: string;
  bed_number: string;
  bed_type?: BedType | string;
  status: BedStatus;
  status_display?: string;
  notes?: string;
}

export type AdmissionRecommendationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type AdmissionRecommendationUrgency = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export interface AdmissionRecommendation {
  id: number;
  encounter: number;
  recommended_by: number;
  recommended_by_username?: string;
  patient_id?: number;
  patient_name?: string;
  patient_mrn?: string;
  reason: string;
  provisional_diagnosis: string;
  provisional_diagnosis_text: string;
  urgency: AdmissionRecommendationUrgency;
  urgency_display?: string;
  preferred_ward_type: InpatientWardType;
  status: AdmissionRecommendationStatus;
  status_display?: string;
  expires_at: string;
  is_expired?: boolean;
  resolved_at?: string | null;
  resolved_by?: number | null;
  resolved_by_username?: string | null;
  decline_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type AdmissionStatus =
  | 'ACTIVE'
  | 'DISCHARGED'
  | 'TRANSFERRED_OUT'
  | 'DECEASED'
  | 'ABSCONDED';

export type AdmissionPayerType = 'CASH' | 'SHA' | 'CORPORATE';

export interface Admission {
  id: number;
  admission_number: string;
  patient: number;
  patient_name?: string;
  patient_age?: number | null;
  patient_gender?: 'M' | 'F' | 'O' | null;
  opd_encounter?: number | null;
  mch_registration?: number | null;
  mch_registration_number?: string;
  ipd_encounter?: number;
  source_encounter?: number | null; // Source OPD encounter ID
  recommendation?: number | null;
  admission_date: string;
  admitting_diagnosis?: string;
  admitting_diagnosis_text?: string;
  admitting_officer?: number;
  admitting_officer_username?: string;
  admitted_by_username?: string; // Alias for admitting_officer_username
  attending_doctor?: number | null;
  attending_doctor_username?: string | null;
  ward: number;
  ward_name?: string;
  bed: number | null;
  bed_number?: string | null;
  admission_status: AdmissionStatus;
  admission_status_display?: string;
  payer_type: AdmissionPayerType;
  payer_type_display?: string;
  insurance_details?: Record<string, unknown> | null;
  // Constraint override fields
  constraint_override?: boolean;
  constraint_override_reason?: string | null;
  constraint_violations?: string[];
  // Phase C: Smart allocation
  expected_discharge_date?: string | null;
  // Additional fields for detail view
  clinical_notes?: string;
  diet?: string;
  special_instructions?: string;
  length_of_stay?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Input type for creating an admission.
 * Includes auto_assign_bed flag for automatic bed assignment.
 */
export interface AdmissionCreateInput {
  patient: number;
  ward: number;
  mch_registration?: number;
  /** Bed ID (required unless auto_assign_bed is true) */
  bed?: number;
  /** When true, system will auto-assign the first available bed in the ward */
  auto_assign_bed?: boolean;
  /** When true with auto_assign_bed, use rule-based scoring (Phase B) */
  use_rules?: boolean;
  payer_type: AdmissionPayerType;
  admission_date: string;
  admitting_diagnosis?: string;
  admitting_diagnosis_text?: string;
  admitting_officer?: number;
  attending_doctor?: number;
  source_encounter?: number;
  opd_encounter?: number;
  recommendation?: number;
  /** Set to true if overriding compatibility warnings */
  constraint_override?: boolean;
  constraint_override_reason?: string;
  constraint_violations?: string[];
  requires_isolation?: boolean;
}

// ============================================================================
// Discharge Types
// ============================================================================

export type DischargeType =
  | 'NORMAL'
  | 'ROUTINE'
  | 'AGAINST_ADVICE'
  | 'TRANSFERRED'
  | 'DECEASED'
  | 'ABSCONDED';

export type MaternityContinuityAction =
  | 'NONE'
  | 'CONTINUE_POSTPARTUM_OBSERVATION'
  | 'SCHEDULE_EARLY_PNC'
  | 'ROUTE_TO_PNC_QUEUE';

export type MaternityContinuityStatus =
  | 'NOT_APPLICABLE'
  | 'SCHEDULED'
  | 'QUEUED';

export type DiagnosisRole = 'PRIMARY' | 'SECONDARY' | 'COMPLICATION';

export interface DischargeDiagnosis {
  id?: number;
  role: DiagnosisRole;
  role_display?: string;
  code: string;
  description: string;
}

export interface DischargeMedication {
  drug_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface Discharge {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  mch_registration?: number | null;
  mch_registration_number?: string;
  discharge_type: DischargeType;
  discharge_type_display?: string;
  discharge_date: string;
  discharged_by: number;
  discharged_by_username?: string;
  admission_diagnosis: string;
  final_diagnosis: string;
  final_diagnosis_text: string;
  diagnoses?: DischargeDiagnosis[];
  procedures_performed?: string;
  treatment_summary: string;
  discharge_medications: DischargeMedication[];
  maternity_continuity_action: MaternityContinuityAction;
  maternity_continuity_action_display?: string;
  maternity_continuity_status: MaternityContinuityStatus;
  maternity_continuity_status_display?: string;
  pnc_clinic_visit?: number | null;
  pnc_appointment?: number | null;
  follow_up_date?: string | null;
  follow_up_instructions?: string;
  referral_facility?: string;
  referral_reason?: string;
  patient_instructions: string;
  pharmacy_cleared: boolean;
  billing_cleared: boolean;
  lab_results_acknowledged: boolean;
  length_of_stay?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DischargeCreateData {
  admission: number;
  discharge_type: DischargeType;
  discharge_date: string;
  discharged_by: number;
  admission_diagnosis: string;
  final_diagnosis: string;
  final_diagnosis_text: string;
  diagnoses?: Omit<DischargeDiagnosis, 'id' | 'role_display'>[];
  procedures_performed?: string;
  treatment_summary: string;
  discharge_medications?: DischargeMedication[];
  maternity_continuity_action?: MaternityContinuityAction;
  follow_up_date?: string;
  follow_up_instructions?: string;
  referral_facility?: string;
  referral_reason?: string;
  patient_instructions: string;
  pharmacy_cleared?: boolean;
  billing_cleared?: boolean;
  billing_clearance?: boolean;
  pharmacy_clearance?: boolean;
  nursing_clearance?: boolean;
  lab_results_acknowledged?: boolean;
}

// ============================================================================
// Transfer Types
// ============================================================================

export type TransferReason =
  | 'STEP_UP'
  | 'STEP_DOWN'
  | 'SPECIALTY'
  | 'BED_MANAGEMENT'
  | 'PATIENT_REQUEST'
  | 'OTHER';

export interface Transfer {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  mch_registration?: number | null;
  mch_registration_number?: string;
  source_ward: number;
  source_ward_name?: string;
  source_bed: number;
  source_bed_number?: string;
  destination_ward: number;
  destination_ward_name?: string;
  destination_bed: number;
  destination_bed_number?: string;
  reason: TransferReason;
  reason_display?: string;
  reason_details?: string;
  transferred_by: number;
  transferred_by_username?: string;
  transfer_date: string;
  clinical_handover_notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface TransferCreateData {
  admission: number;
  source_ward: number;
  source_bed: number;
  destination_ward: number;
  destination_bed: number;
  reason: TransferReason;
  clinical_handover_notes: string;
  transfer_date: string;
  transferred_by?: number;
}

// ============================================================================
// Ward Round Types
// ============================================================================

export type ConditionStatus = 'STABLE' | 'IMPROVING' | 'DETERIORATING' | 'CRITICAL';
export type ReviewType = 'WARD_ROUND' | 'URGENT_REVIEW' | 'CONSULTANT_REVIEW' | 'TRANSFER_REVIEW' | 'PRE_DISCHARGE';
export type ReviewRequestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ReviewUrgency = 'ROUTINE' | 'URGENT' | 'STAT';

export interface WardRoundVitalSigns {
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
}

export interface WardRound {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  round_date: string;
  round_time: string;
  conducted_by: number;
  conducted_by_username?: string;
  conducted_by_name?: string; // Display name from mock data
  // Review type - differentiates scheduled rounds from urgent/consultant reviews
  review_type: ReviewType;
  review_type_display?: string;
  review_request?: number | null; // Link to review request if this fulfills one
  // SOAP notes - required per SHA/FHIR
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  maternity_continuity_action?: MaternityContinuityAction;
  maternity_continuity_action_display?: string;
  maternity_continuity_notes?: string;
  // Legacy alias for display compatibility
  clinical_notes?: string;
  // Vital signs can be nested object or individual fields
  vital_signs?: WardRoundVitalSigns;
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
  // Additional fields
  diet_orders?: string;
  activity_level?: string;
  condition_status: ConditionStatus;
  condition_status_display?: string;
  requires_consultant_review: boolean;
  consultant_specialty?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WardRoundCreateData {
  admission: number;
  round_date: string;
  round_time: string;
  conducted_by: number;
  review_type?: ReviewType;  // Defaults to WARD_ROUND
  review_request?: number;   // Link to review request if fulfilling one
  subjective: string;       // Required - SOAP 'S' (SHA/FHIR compliance)
  objective: string;        // Required - SOAP 'O' (SHA/FHIR compliance)
  assessment: string;       // Required - SOAP 'A' (SHA/FHIR compliance)
  plan: string;             // Required - SOAP 'P' (SHA/FHIR compliance)
  maternity_continuity_action?: MaternityContinuityAction;
  maternity_continuity_notes?: string;
  condition_status: ConditionStatus;
  requires_consultant_review?: boolean;
  consultant_specialty?: string;
  // Vitals (optional)
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
}

// ============================================================================
// Review Request Types
// ============================================================================

export interface ReviewRequest {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  ward_name?: string;
  bed_number?: string;
  review_type: Exclude<ReviewType, 'WARD_ROUND'>; // WARD_ROUND is not a request type
  review_type_display?: string;
  urgency: ReviewUrgency;
  urgency_display?: string;
  reason: string;
  requested_by: number;
  requested_by_username?: string;
  requested_at: string;
  consultant_specialty?: string;
  assigned_to?: number | null;
  assigned_to_username?: string | null;
  status: ReviewRequestStatus;
  status_display?: string;
  acknowledged_at?: string | null;
  acknowledged_by?: number | null;
  acknowledged_by_username?: string | null;
  completed_at?: string | null;
  clinical_context?: string;
  cancellation_reason?: string;
  is_overdue?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ReviewRequestCreateData {
  admission: number;
  review_type: Exclude<ReviewType, 'WARD_ROUND'>;
  urgency: ReviewUrgency;
  reason: string;
  consultant_specialty?: string;
  clinical_context?: string;
}

// ============================================================================
// Nursing Kardex Types
// ============================================================================

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type ShiftType = 'DAY' | 'NIGHT';

export interface KardexShiftNote {
  id: number;
  kardex: number;
  shift: ShiftType;
  shift_display?: string;
  nurse: number;
  nurse_username?: string;
  content: string;
  notes?: string; // Alias for content
  timestamp: string;
  created_at?: string;
}

export interface KardexHandoverNote {
  id: number;
  kardex: number;
  from_shift: ShiftType;
  to_shift: ShiftType;
  outgoing_nurse: number;
  outgoing_nurse_username?: string;
  nurse_username?: string; // Alias for outgoing nurse
  incoming_nurse: number;
  incoming_nurse_username?: string;
  shift_ending: ShiftType;
  pending_tasks: string;
  content: string;
  escalations?: string;
  acknowledged_at?: string | null;
  created_at: string;
}

export interface NursingKardex {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  ward_name?: string;
  bed_number?: string;
  // Basic care information
  mobility_status?: string;
  dietary_requirements?: string;
  diet?: string; // Legacy alias
  allergies?: string;
  iv_access?: string;
  maternity_continuity_action?: MaternityContinuityAction;
  maternity_continuity_action_display?: string;
  maternity_continuity_notes?: string;
  // Risk assessments (CharFields with LOW/MODERATE/HIGH choices)
  fall_risk: RiskLevel;
  fall_risk_display?: string;
  pressure_sore_risk: RiskLevel;
  pressure_sore_risk_display?: string;
  // Isolation
  isolation_required: boolean;
  isolation_type?: string;
  // Related notes and care plan entries
  shift_notes?: KardexShiftNote[];
  handover_notes?: KardexHandoverNote[];
  care_plan_entries?: NursingCarePlanEntry[];
  created_at?: string;
  updated_at?: string;
}

export interface InpatientConsumableUsage {
  id: number;
  admission: number;
  admission_number?: string;
  patient_name?: string;
  drug: number;
  drug_name?: string;
  batch: number;
  batch_number?: string;
  quantity_used: number;
  notes?: string;
  used_by: number;
  used_by_username?: string;
  used_at: string;
  is_reversed: boolean;
  reversed_by?: number | null;
  reversed_by_username?: string | null;
  reversed_at?: string | null;
  reverse_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InpatientConsumableUsageCreateData {
  batch: number;
  quantity_used: number;
  notes?: string;
  used_at?: string;
}

export interface InpatientConsumableUsageReverseData {
  reason: string;
}

export interface KardexUpdateData {
  mobility_status?: string;
  dietary_requirements?: string;
  allergies?: string;
  iv_access?: string;
  maternity_continuity_action?: MaternityContinuityAction;
  maternity_continuity_notes?: string;
  fall_risk?: RiskLevel;
  pressure_sore_risk?: RiskLevel;
  isolation_required?: boolean;
  isolation_type?: string;
}

export interface KardexShiftNoteCreateData {
  shift: ShiftType;
  content: string;
}

export interface KardexHandoverNoteCreateData {
  incoming_nurse: number;
  shift_ending: ShiftType;
  pending_tasks: string;
  escalations?: string;
}

// ============================================================================
// Nursing Care Plan Entry Types (ADPIE structure)
// ============================================================================

export type CarePlanEntryStatus = 'ACTIVE' | 'RESOLVED' | 'ONGOING';

export interface NursingCarePlanEntry {
  id: number;
  kardex: number;
  recorded_at: string;
  recorded_by: number;
  recorded_by_username?: string;
  assessment: string;
  nursing_diagnosis: string;
  goal_and_outcome_criteria: string;
  plan_of_action: string;
  scientific_rationale: string;
  implementation: string;
  evaluation: string;
  status: CarePlanEntryStatus;
  status_display?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NursingCarePlanEntryCreateData {
  recorded_at: string;
  assessment: string;
  nursing_diagnosis: string;
  goal_and_outcome_criteria: string;
  plan_of_action: string;
  scientific_rationale: string;
  implementation?: string;
  evaluation?: string;
  status?: CarePlanEntryStatus;
}

export interface NursingCarePlanEntryUpdateData {
  implementation?: string;
  evaluation?: string;
  status?: CarePlanEntryStatus;
}

// ============================================================================
// Shift Handover Types
// ============================================================================

export type ShiftEndingType = 'DAY' | 'EVENING' | 'NIGHT';

export interface ShiftHandover {
  id: number;
  ward: number;
  ward_name?: string;
  shift_date: string;
  shift_ending: ShiftEndingType;
  shift_ending_display?: string;
  outgoing_nurse: number;
  outgoing_nurse_username?: string;
  incoming_nurse: number;
  incoming_nurse_username?: string;
  total_patients: number;
  critical_patients: number;
  new_admissions: number;
  discharges_pending: number;
  general_notes?: string;
  acknowledged_at?: string | null;
  is_acknowledged?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ShiftHandoverCreateData {
  ward: number;
  shift_date: string;
  shift_ending: ShiftEndingType;
  outgoing_nurse: number;
  incoming_nurse: number;
  total_patients: number;
  critical_patients?: number;
  new_admissions?: number;
  discharges_pending?: number;
  general_notes?: string;
}

// ============================================================================
// List Params Types
// ============================================================================

export interface AdmissionRecommendationListParams {
  status?: string;
  urgency?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface AdmissionListParams {
  admission_status?: string;
  patient?: number;
  ward?: number;
  payer_type?: string;
  ordering?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface BedListParams {
  ward?: number;
  status?: BedStatus;
}

export interface DischargeListParams {
  discharge_type?: DischargeType;
  pharmacy_cleared?: boolean;
  billing_cleared?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface TransferListParams {
  admission?: number;
  source_ward?: number;
  destination_ward?: number;
  reason?: TransferReason;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface WardRoundListParams {
  admission?: number;
  condition_status?: ConditionStatus;
  review_type?: ReviewType;
  requires_consultant_review?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ReviewRequestListParams {
  admission?: number;
  review_type?: Exclude<ReviewType, 'WARD_ROUND'>;
  urgency?: ReviewUrgency;
  status?: ReviewRequestStatus;
  requested_by?: number;
  assigned_to?: number;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface KardexListParams {
  admission?: number;
  fall_risk?: RiskLevel;
  pressure_sore_risk?: RiskLevel;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ShiftHandoverListParams {
  ward?: number;
  shift_date?: string;
  shift_ending?: ShiftEndingType;
  ordering?: string;
  page?: number;
  page_size?: number;
}

// ============================================================================
// Response Types
// ============================================================================

export type AdmissionRecommendationListResponse = PaginatedResponse<AdmissionRecommendation>;
export type AdmissionListResponse = PaginatedResponse<Admission>;
export type DischargeListResponse = PaginatedResponse<Discharge>;
export type TransferListResponse = PaginatedResponse<Transfer>;
export type WardRoundListResponse = PaginatedResponse<WardRound>;
export type ReviewRequestListResponse = PaginatedResponse<ReviewRequest>;
export type KardexListResponse = PaginatedResponse<NursingKardex>;
export type InpatientConsumableUsageListResponse = InpatientConsumableUsage[];
export type ShiftHandoverListResponse = PaginatedResponse<ShiftHandover>;

// ============================================================================
// Ward Compatibility Types
// ============================================================================

export type ConstraintViolationSeverity = 'WARNING' | 'CRITICAL';

export interface CompatibilityViolation {
  code: string;
  message: string;
  severity: ConstraintViolationSeverity;
  override_allowed: boolean;
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  has_critical_violations: boolean;
  violations: CompatibilityViolation[];
}

export interface CompatibleWardInfo {
  ward_id: number;
  ward_name: string;
  ward_type: InpatientWardType;
  available_beds: number;
}

export interface IncompatibleWardInfo extends CompatibleWardInfo {
  violations: string[];
  has_critical: boolean;
}

export interface PatientCompatibilityResult {
  patient_id: number;
  patient_name?: string;
  patient_mrn?: string;
  error?: string;
  compatible_wards: CompatibleWardInfo[];
  incompatible_wards: IncompatibleWardInfo[];
}

export interface BulkCompatibilityResult {
  results: PatientCompatibilityResult[];
}

// ============================================================================
// Ward Updates (Polling Fallback) Types
// ============================================================================

export type WardUpdateEventType =
  | 'ward_constraints_updated'
  | 'compatibility_violation'
  | 'bed_availability_changed';

export interface WardUpdateEvent {
  type: WardUpdateEventType;
  admission_id?: number;
  patient_name?: string;
  violations?: string[];
  timestamp: string;
}

export interface WardCurrentState {
  ward_id: number;
  ward_name: string;
  gender_restriction: string | null;
  min_age_years: number | null;
  max_age_years: number | null;
  isolation_capable: boolean;
  oxygen_equipped: boolean;
  ventilator_capable: boolean;
  maternity_designated: boolean;
  available_beds: number;
}

export interface WardUpdatesResponse {
  events: WardUpdateEvent[];
  current_state: WardCurrentState;
}

// ============================================================================
// Supervisor Alerts Types
// ============================================================================

export interface SupervisorAlert {
  admission_id: number;
  admission_number: string;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  ward_id: number;
  ward_name: string;
  bed_number: string;
  admitted_by: string;
  critical_violations: string[];
  override_reason: string | null;
  timestamp: string;
  // Acknowledgment fields
  is_acknowledged?: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
}

export interface SupervisorAlertsResponse {
  alerts: SupervisorAlert[];
}

// ============================================================================
// Alert Acknowledgment Types
// ============================================================================

export interface AcknowledgeAlertRequest {
  admission_id: number;
  notes?: string;
}

export interface AcknowledgeAlertResponse {
  message: string;
  acknowledgment_id: number;
  acknowledged_at: string;
}

// ============================================================================
// Constraint Override Metrics Types
// ============================================================================

export interface ViolationTypeBreakdown {
  code: string;
  count: number;
}

export interface WardOverrideStats {
  ward_id: number;
  ward_name: string;
  override_count: number;
}

export interface CommonOverrideReason {
  reason: string;
  count: number;
}

export interface ConstraintOverrideMetrics {
  total_admissions: number;
  override_count: number;
  override_rate: number;
  critical_override_count: number;
  acknowledged_count: number;
  pending_acknowledgment_count: number;
  violation_breakdown: ViolationTypeBreakdown[];
  ward_breakdown: WardOverrideStats[];
  common_reasons: CommonOverrideReason[];
}

// ============================================================================
// Admission Orders Types
// ============================================================================

import type { LabOrder } from '@/lib/types/laboratory';
import type { ImagingOrder } from '@/lib/types/imaging';
import type { Prescription } from '@/lib/types/pharmacy';

export interface AdmissionOrdersResponse {
  lab_orders: LabOrder[];
  imaging_orders: ImagingOrder[];
  prescriptions: Prescription[];
}

// ============================================================================
// Observation Chart Types
// ============================================================================

export interface TemperatureReading {
  id: number;
  admission: number;
  recorded_at: string;
  recorded_by: number;
  recorded_by_username?: string;
  temperature: string; // Decimal comes as string from API
  pulse?: number | null;
  respiratory_rate?: number | null;
  notes?: string;
  is_febrile?: boolean;
  is_hypothermic?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TemperatureReadingCreateData {
  admission: number;
  recorded_at: string;
  temperature: number | string;
  pulse?: number | null;
  respiratory_rate?: number | null;
  notes?: string;
}

export type FluidBalanceEntryType =
  | 'INTRAVENOUS'
  | 'ALIMENTARY'
  | 'OTHER_INTAKE'
  | 'VOMIT'
  | 'STOOL'
  | 'NASOGASTRIC'
  | 'OTHER_OUTPUT'
  | 'URINE';

export interface FluidBalanceSheet {
  id: number;
  admission: number;
  chart_date: string;
  recorded_by: number;
  recorded_by_username?: string;
  patient_weight_kg?: string | null;
  intravenous_infusion_notes?: string;
  other_instructions?: string;
  total_intravenous_intake_ml?: number;
  total_alimentary_intake_ml?: number;
  total_other_intake_ml?: number;
  total_intake_ml?: number;
  total_vomit_output_ml?: number;
  total_stool_output_ml?: number;
  total_nasogastric_output_ml?: number;
  total_other_output_ml?: number;
  total_urine_output_ml?: number;
  total_output_ml?: number;
  net_balance_ml?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FluidBalanceSheetCreateData {
  admission: number;
  chart_date: string;
  patient_weight_kg?: number | string | null;
  intravenous_infusion_notes?: string;
  other_instructions?: string;
}

export interface FluidBalanceSheetUpdateData {
  patient_weight_kg?: number | string | null;
  intravenous_infusion_notes?: string;
  other_instructions?: string;
}

export interface FluidBalanceEntry {
  id: number;
  fluid_balance_sheet: number;
  recorded_at: string;
  recorded_by: number;
  recorded_by_username?: string;
  entry_type: FluidBalanceEntryType;
  entry_type_display?: string;
  item_type?: string;
  bottle_number?: string;
  amount_ml?: number | null;
  specific_gravity?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FluidBalanceEntryCreateData {
  fluid_balance_sheet: number;
  recorded_at: string;
  entry_type: FluidBalanceEntryType;
  item_type?: string;
  bottle_number?: string;
  amount_ml?: number | null;
  specific_gravity?: number | string | null;
  notes?: string;
}

export type TransfusionObservationInterval =
  | 'BEFORE'
  | '00_MIN'
  | '15_MIN'
  | '45_MIN'
  | '1HR_15MIN'
  | '1HR_45MIN'
  | '2HR_15MIN'
  | '2HR_45MIN'
  | '3HR_15MIN'
  | '3HR_45MIN'
  | '4HR_15MIN'
  | '4HR_AFTER';

export type BloodProduct =
  | 'WHOLE'
  | 'PACKED_RED_CELLS'
  | 'FFP'
  | 'PLATELETS'
  | 'CRYOPRECIPITATE'
  | 'OTHER';

export type TransfusionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'STOPPED' | 'CANCELLED';

export interface TransfusionObservationEntry {
  id: number;
  transfusion: number;
  observation_interval: TransfusionObservationInterval;
  observation_interval_display?: string;
  exact_time: string;
  recorded_by: number;
  recorded_by_username?: string;
  blood_pressure?: string;
  temperature?: string | null;
  pulse?: number | null;
  respiratory_rate?: number | null;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TransfusionObservationEntryCreateData {
  observation_interval: TransfusionObservationInterval;
  exact_time: string;
  blood_pressure?: string;
  temperature?: number | string | null;
  pulse?: number | null;
  respiratory_rate?: number | null;
  remarks?: string;
}

export interface BloodTransfusion {
  id: number;
  admission: number;
  patient_name?: string;
  blood_product: BloodProduct;
  blood_product_display?: string;
  blood_product_other?: string;
  blood_unit_number: string;
  blood_group?: string;
  amount_ml: number;
  transfusion_date: string;
  time_started?: string | null;
  time_ended?: string | null;
  started_by: number;
  started_by_username?: string;
  counter_checked_by?: number | null;
  counter_checked_by_username?: string | null;
  diagnosis?: string;
  status: TransfusionStatus;
  status_display?: string;
  reaction_occurred: boolean;
  reaction_type?: string;
  reaction_action_taken?: string;
  observations?: TransfusionObservationEntry[];
  created_at?: string;
  updated_at?: string;
}

export interface BloodTransfusionCreateData {
  admission: number;
  blood_product: BloodProduct;
  blood_product_other?: string;
  blood_unit_number: string;
  blood_group?: string;
  amount_ml: number;
  transfusion_date: string;
  time_started?: string;
  diagnosis?: string;
}

export type BPPosition = 'SITTING' | 'STANDING' | 'LYING' | 'LEFT_LATERAL';

export interface BPMonitoringReading {
  id: number;
  admission: number;
  recorded_at: string;
  recorded_by: number;
  recorded_by_username?: string;
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  position: BPPosition;
  position_display?: string;
  arm?: string;
  notes?: string;
  mean_arterial_pressure?: number;
  bp_display?: string;
  is_hypertensive?: boolean;
  is_hypotensive?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BPMonitoringReadingCreateData {
  admission: number;
  recorded_at: string;
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  position?: BPPosition;
  arm?: string;
  notes?: string;
}

export type TemperatureReadingListResponse = PaginatedResponse<TemperatureReading>;
export type FluidBalanceSheetListResponse = PaginatedResponse<FluidBalanceSheet>;
export type FluidBalanceEntryListResponse = PaginatedResponse<FluidBalanceEntry>;
export type BloodTransfusionListResponse = PaginatedResponse<BloodTransfusion>;
export type BPMonitoringReadingListResponse = PaginatedResponse<BPMonitoringReading>;

// ============================================================================
// Rule-Based Bed Assignment Types (Phase B)
// ============================================================================

export interface BedCandidateEvaluation {
  bed_id: number;
  bed_number: string;
  ward_id: number;
  ward_name: string;
  ward_code: string;
  passed: boolean;
  matched_constraints: string[];
  failed_constraints: string[];
  compatibility_violations: Record<string, unknown>[];
  rejection_reason: string;
  score: number;
  scoring_breakdown: Record<string, unknown>;
}

export interface RuleBasedBedAssignmentResponse {
  success: boolean;
  assigned_bed_id: number | null;
  assigned_bed_number: string | null;
  assigned_ward_name: string | null;
  rule_applied: string | null;
  decision_id: number | null;
  decision_outcome: string;
  decision_reason: string;
  evaluation_time_ms: number;
  candidates_evaluated: BedCandidateEvaluation[];
  scoring_details: Record<string, unknown>;
  error: string | null;
}

export type OverrideReason =
  | 'PATIENT_REQUEST'
  | 'STAFF_UNAVAILABLE'
  | 'EMERGENCY'
  | 'SPECIALIZATION_NEEDED'
  | 'LOAD_BALANCING'
  | 'ADMINISTRATIVE'
  | 'OTHER';

export interface BedOverrideRequest {
  new_bed_id: number;
  override_reason: OverrideReason;
  justification: string;
  requires_approval?: boolean;
}

export interface BedOverrideResponse {
  admission: Admission;
  override_id: number;
  old_bed: string;
  new_bed: string;
}

// ============================================================================
// Smart Allocation Types (Phase C)
// ============================================================================

export type SmartAdmissionType = 'ELECTIVE' | 'EMERGENCY' | 'TRANSFER';

export interface PredictedDischarge {
  admission_id: number;
  admission_number: string;
  patient_name: string;
  ward_id: number;
  ward_name: string;
  bed_id: number;
  bed_number: string;
  admission_date: string;
  expected_discharge_date: string | null;
  estimated_discharge_date: string | null;
  source: string;
  hours_until_available: number | null;
}

export interface PredictedDischargesResponse {
  ward_id: number;
  ward_name: string;
  hours_ahead: number;
  count: number;
  predictions: PredictedDischarge[];
}

export interface BedUtilization {
  ward_id: number;
  ward_name: string;
  ward_code: string;
  capacity: number;
  occupied: number;
  available: number;
  cleaning: number;
  reserved: number;
  maintenance: number;
  occupancy_rate: number;
  emergency_buffer_percent: number;
  emergency_buffer_beds: number;
  effective_available: number;
  avg_length_of_stay_days: number | null;
  predicted_discharges_next_4h: number;
  predicted_discharges_next_24h: number;
  workload_score: number;
}

export interface SmartRecommendBedRequest {
  patient_id: number;
  requires_isolation?: boolean;
  requires_oxygen?: boolean;
  requires_ventilator?: boolean;
  admission_type?: SmartAdmissionType;
}

export interface SmartRecommendBedResponse {
  success: boolean;
  assigned_bed_id: number | null;
  assigned_bed_number: string | null;
  smart_scores: Record<string, unknown>;
  emergency_buffer_enforced: boolean;
  cohort_match_score: number;
  infection_isolation_triggered: boolean;
  workload_score: number;
  predicted_discharges: PredictedDischarge[];
  evaluation_time_ms: number;
  error: string | null;
}

export interface SetExpectedDischargeRequest {
  expected_discharge_date: string;
}

export interface SetExpectedDischargeResponse {
  admission_id: number;
  admission_number: string;
  expected_discharge_date: string;
}

// --- Ward Recommendation ---

export interface WardRecommendationRankedWard {
  ward_id: number;
  ward_name: string;
  ward_code: string;
  ward_type: string;
  ward_type_display: string;
  compatible: boolean;
  score: number;
  scores: Record<string, number>;
  total_beds: number;
  available_beds: number;
  effective_available: number;
  occupancy_rate: number;
  violations: string[];
  rejection_reason: string;
  reason: string;
  recommended: boolean;
}

export interface WardRecommendationResponse {
  success: boolean;
  recommended_ward_id: number | null;
  recommended_ward_name: string | null;
  ranked_wards: WardRecommendationRankedWard[];
  incompatible_wards: Array<{
    ward_id: number;
    ward_name: string;
    ward_code: string;
    ward_type: string;
    ward_type_display: string;
    compatible: boolean;
    violations: string[];
    rejection_reason: string;
  }>;
  total_evaluated: number;
  infection_isolation_triggered: boolean;
  evaluation_time_ms: number;
  error: string | null;
}

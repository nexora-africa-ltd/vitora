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
  occupancy_rate?: number;
}

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

export interface Bed {
  id: number;
  ward: number;
  ward_name?: string;
  bed_number: string;
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
  reason: string;
  provisional_diagnosis: string;
  provisional_diagnosis_text: string;
  urgency: AdmissionRecommendationUrgency;
  preferred_ward_type: InpatientWardType;
  status: AdmissionRecommendationStatus;
  expires_at: string;
  is_expired?: boolean;
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
  opd_encounter?: number | null;
  ipd_encounter?: number;
  recommendation?: number | null;
  admission_date: string;
  admitting_diagnosis?: string;
  admitting_diagnosis_text?: string;
  admitting_officer?: number;
  admitting_officer_username?: string;
  admitted_by_username?: string; // Alias for admitting_officer_username
  attending_doctor?: number | null;
  attending_doctor_username?: string;
  ward: number;
  ward_name?: string;
  bed: number;
  bed_number?: string;
  admission_status: AdmissionStatus;
  admission_status_display?: string;
  payer_type: AdmissionPayerType;
  payer_type_display?: string;
  insurance_details?: Record<string, unknown>;
  // Additional fields for detail view
  clinical_notes?: string;
  diet?: string;
  special_instructions?: string;
  length_of_stay?: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Discharge Types
// ============================================================================

export type DischargeType =
  | 'NORMAL'
  | 'AGAINST_ADVICE'
  | 'TRANSFERRED'
  | 'DECEASED'
  | 'ABSCONDED';

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
  discharge_type: DischargeType;
  discharge_type_display?: string;
  discharge_date: string;
  discharged_by: number;
  discharged_by_username?: string;
  admission_diagnosis: string;
  final_diagnosis: string;
  final_diagnosis_text: string;
  procedures_performed?: string;
  treatment_summary: string;
  discharge_medications: DischargeMedication[];
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
  procedures_performed?: string;
  treatment_summary: string;
  discharge_medications?: DischargeMedication[];
  follow_up_date?: string;
  follow_up_instructions?: string;
  referral_facility?: string;
  referral_reason?: string;
  patient_instructions: string;
  pharmacy_cleared?: boolean;
  billing_cleared?: boolean;
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
  from_ward: number;
  from_bed: number;
  to_ward: number;
  to_bed: number;
  transfer_reason: TransferReason;
  clinical_justification: string;
  transferred_by?: number;
}

// ============================================================================
// Ward Round Types
// ============================================================================

export type ConditionStatus = 'STABLE' | 'IMPROVING' | 'DETERIORATING' | 'CRITICAL';

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
  // SOAP notes - required per SHA/FHIR
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
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
  subjective: string;       // Required - SOAP 'S' (SHA/FHIR compliance)
  objective: string;        // Required - SOAP 'O' (SHA/FHIR compliance)
  assessment: string;       // Required - SOAP 'A' (SHA/FHIR compliance)
  plan: string;             // Required - SOAP 'P' (SHA/FHIR compliance)
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
  // Nursing care plan
  nursing_problems?: string;
  nursing_notes?: string; // Legacy alias
  interventions?: string;
  monitoring_requirements?: string;
  care_task_frequency?: string;
  // Risk assessments (CharFields with LOW/MODERATE/HIGH choices)
  fall_risk: RiskLevel;
  fall_risk_display?: string;
  pressure_sore_risk: RiskLevel;
  pressure_sore_risk_display?: string;
  // Isolation
  isolation_required: boolean;
  isolation_type?: string;
  // Related notes
  shift_notes?: KardexShiftNote[];
  handover_notes?: KardexHandoverNote[];
  created_at?: string;
  updated_at?: string;
}

export interface KardexUpdateData {
  mobility_status?: string;
  dietary_requirements?: string;
  allergies?: string;
  iv_access?: string;
  nursing_problems?: string;
  interventions?: string;
  monitoring_requirements?: string;
  care_task_frequency?: string;
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
  from_shift: ShiftType;
  to_shift: ShiftType;
  content: string;
  nurse?: number;
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
  requires_consultant_review?: boolean;
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
export type KardexListResponse = PaginatedResponse<NursingKardex>;
export type ShiftHandoverListResponse = PaginatedResponse<ShiftHandover>;

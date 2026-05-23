import type { ClinicType } from '@/lib/types/clinic';

/**
 * Referral types for Vitora HMIS.
 *
 * Defines the unified referral system that cleanly separates
 * clinician input (creating a referral) from specialist work
 * (performing the consultation/assessment).
 */

// =============================================================================
// Enums & Constants
// =============================================================================

export type ReferralType =
  | 'ALLIED_HEALTH'
  | 'SPECIALTY_CLINIC'
  | 'ADMISSION'
  | 'EXTERNAL';

export type ReferralTargetService =
  // Allied Health
  | 'PHYSIOTHERAPY'
  | 'NUTRITION'
  | 'OCCUPATIONAL_THERAPY'
  | 'COUNSELLING'
  | 'SOCIAL_WORK'
  // Specialty Clinics
  | 'DENTAL'
  | 'EYE'
  | 'ENT'
  | 'SURGICAL'
  | 'ORTHO'
  | 'DERM'
  | 'CARDIOLOGY'
  | 'ONCOLOGY'
  | 'MENTAL_HEALTH'
  | 'DIALYSIS'
  // MCH
  | 'ANC'
  | 'PNC'
  | 'FP'
  | 'CWC'
  // Chronic Care
  | 'CCC'
  | 'TB'
  | 'DIABETIC'
  | 'HYPERTENSION'
  // Inpatient
  | 'GENERAL_WARD'
  | 'MEDICAL_WARD'
  | 'SURGICAL_WARD'
  | 'MATERNITY_WARD'
  | 'PEDIATRIC_WARD'
  | 'ICU'
  | 'HDU'
  // Other
  | 'PROCEDURE_ROOM'
  | 'OTHER';

export type ReferralPriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export type ReferralStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

// =============================================================================
// Display Config
// =============================================================================

export const REFERRAL_TYPE_DISPLAY: Record<ReferralType, string> = {
  ALLIED_HEALTH: 'Allied Health',
  SPECIALTY_CLINIC: 'Specialty Clinic',
  ADMISSION: 'Admission',
  EXTERNAL: 'External Facility',
};

export const REFERRAL_STATUS_CONFIG: Record<
  ReferralStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  DRAFT: { label: 'Draft', variant: 'outline' },
  PENDING: { label: 'Pending', variant: 'secondary' },
  ACCEPTED: { label: 'Accepted', variant: 'default' },
  DECLINED: { label: 'Declined', variant: 'destructive' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default' },
  COMPLETED: { label: 'Completed', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
  EXPIRED: { label: 'Expired', variant: 'outline' },
};

export const REFERRAL_PRIORITY_CONFIG: Record<
  ReferralPriority,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  ROUTINE: { label: 'Routine', variant: 'secondary' },
  URGENT: { label: 'Urgent', variant: 'default' },
  EMERGENCY: { label: 'Emergency', variant: 'destructive' },
};

/** Target services grouped by category for the referral form */
export const TARGET_SERVICE_GROUPS = [
  {
    label: 'Allied Health',
    options: [
      { value: 'PHYSIOTHERAPY', label: 'Physiotherapy' },
      { value: 'NUTRITION', label: 'Nutrition / Dietetics' },
      { value: 'OCCUPATIONAL_THERAPY', label: 'Occupational Therapy' },
      { value: 'COUNSELLING', label: 'Counselling' },
      { value: 'SOCIAL_WORK', label: 'Social Work' },
    ],
  },
  {
    label: 'Specialty Clinics',
    options: [
      { value: 'DENTAL', label: 'Dental' },
      { value: 'EYE', label: 'Eye / Ophthalmology' },
      { value: 'ENT', label: 'ENT' },
      { value: 'SURGICAL', label: 'Surgical' },
      { value: 'ORTHO', label: 'Orthopedic' },
      { value: 'DERM', label: 'Dermatology' },
      { value: 'CARDIOLOGY', label: 'Cardiology' },
      { value: 'ONCOLOGY', label: 'Oncology' },
      { value: 'MENTAL_HEALTH', label: 'Mental Health / Psychiatry' },
      { value: 'DIALYSIS', label: 'Dialysis' },
    ],
  },
  {
    label: 'Maternal & Child Health',
    options: [
      { value: 'ANC', label: 'Antenatal Care' },
      { value: 'PNC', label: 'Postnatal Care' },
      { value: 'FP', label: 'Family Planning' },
      { value: 'CWC', label: 'Child Welfare' },
    ],
  },
  {
    label: 'Chronic Care',
    options: [
      { value: 'CCC', label: 'Comprehensive Care (HIV)' },
      { value: 'TB', label: 'TB Clinic' },
      { value: 'DIABETIC', label: 'Diabetic Clinic' },
      { value: 'HYPERTENSION', label: 'Hypertension Clinic' },
    ],
  },
  {
    label: 'Inpatient Admission',
    options: [
      { value: 'GENERAL_WARD', label: 'General Ward' },
      { value: 'MEDICAL_WARD', label: 'Medical Ward' },
      { value: 'SURGICAL_WARD', label: 'Surgical Ward' },
      { value: 'MATERNITY_WARD', label: 'Maternity Ward' },
      { value: 'PEDIATRIC_WARD', label: 'Pediatric Ward' },
      { value: 'ICU', label: 'Intensive Care Unit' },
      { value: 'HDU', label: 'High Dependency Unit' },
    ],
  },
  {
    label: 'Other',
    options: [
      { value: 'PROCEDURE_ROOM', label: 'Procedure Room' },
      { value: 'OTHER', label: 'Other (External)' },
    ],
  },
];

// Which target services are admission types
export const ADMISSION_SERVICES: ReferralTargetService[] = [
  'GENERAL_WARD',
  'MEDICAL_WARD',
  'SURGICAL_WARD',
  'MATERNITY_WARD',
  'PEDIATRIC_WARD',
  'ICU',
  'HDU',
];

export const SPECIALTY_CLINIC_SERVICES: ReferralTargetService[] = [
  'DENTAL',
  'EYE',
  'ENT',
  'SURGICAL',
  'ORTHO',
  'DERM',
  'CARDIOLOGY',
  'ONCOLOGY',
  'MENTAL_HEALTH',
  'DIALYSIS',
];

export const REFERRAL_SPECIALTY_TO_CLINIC_TYPE: Partial<Record<ReferralTargetService, ClinicType>> = {
  DENTAL: 'DENTAL',
  EYE: 'EYE',
  ENT: 'ENT',
  SURGICAL: 'SURGICAL',
  ORTHO: 'ORTHO',
  DERM: 'DERM',
  ONCOLOGY: 'ONCOLOGY',
  MENTAL_HEALTH: 'MENTAL_HEALTH',
  DIALYSIS: 'DIALYSIS',
};

// =============================================================================
// Interfaces
// =============================================================================

export interface ReferralDiagnosisSnapshot {
  code: string;
  description: string;
  diagnosis_type: string;
}

export interface ReferralVitalsSnapshot {
  temperature?: string;
  pulse?: string;
  blood_pressure?: string;
  respiratory_rate?: string;
  spo2?: string;
  weight?: string;
  height?: string;
}

/** Full clinical referral detail */
export interface ClinicalReferral {
  id: number;
  referral_number: string;
  referral_type: ReferralType;
  referral_type_display: string;
  target_service: ReferralTargetService;
  target_service_display: string;
  // Patient
  patient: number;
  patient_name: string;
  patient_mrn: string;
  patient_gender: string;
  patient_date_of_birth: string | null;
  patient_phone: string;
  encounter: number;
  destination_clinic: number | null;
  destination_clinic_name: string;
  // Clinician input
  reason: string;
  clinical_notes: string;
  hospital_course: string;
  priority: ReferralPriority;
  priority_display: string;
  // Clinical context
  relevant_diagnoses: ReferralDiagnosisSnapshot[];
  relevant_vitals: ReferralVitalsSnapshot;
  // Admission fields
  provisional_diagnosis: string;
  provisional_diagnosis_text: string;
  preferred_ward_type: string;
  // External fields
  external_facility_name: string;
  external_facility_code: string;
  referral_letter: string;
  // Status & tracking
  status: ReferralStatus;
  status_display: string;
  referred_by: number;
  referred_by_name: string;
  accepted_by: number | null;
  accepted_by_name: string;
  declined_by: number | null;
  declined_by_name: string;
  decline_reason: string;
  cancelled_by: number | null;
  cancelled_by_name: string;
  cancel_reason: string;
  // Timestamps
  accepted_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  expires_at: string;
  // Linked specialist record
  linked_module: string;
  linked_model: string;
  linked_object_id: number | null;
  // Other
  clinic_visit: number | null;
  is_sensitive: boolean;
  is_active: boolean;
  is_terminal: boolean;
  created_at: string;
  updated_at: string;
}

/** List item (compact) */
export interface ClinicalReferralListItem {
  id: number;
  referral_number: string;
  referral_type: ReferralType;
  referral_type_display: string;
  target_service: ReferralTargetService;
  target_service_display: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number;
  destination_clinic: number | null;
  destination_clinic_name: string;
  priority: ReferralPriority;
  priority_display: string;
  status: ReferralStatus;
  status_display: string;
  referred_by: number;
  referred_by_name: string;
  is_sensitive: boolean;
  created_at: string;
  updated_at: string;
}

/** Compact referral shown in encounter detail tab */
export interface EncounterReferralItem {
  id: number;
  referral_number: string;
  referral_type: ReferralType;
  referral_type_display: string;
  target_service: ReferralTargetService;
  target_service_display: string;
  destination_clinic: number | null;
  destination_clinic_name: string;
  reason: string;
  priority: ReferralPriority;
  priority_display: string;
  status: ReferralStatus;
  status_display: string;
  referred_by_name: string;
  is_sensitive: boolean;
  created_at: string;
}

/** Data for creating a referral (clinician fills this) */
export interface ReferralCreateData {
  encounter: number;
  target_service: ReferralTargetService;
  destination_clinic?: number;
  reason: string;
  clinical_notes?: string;
  hospital_course?: string;
  priority?: ReferralPriority;
  // Admission (optional)
  provisional_diagnosis?: string;
  provisional_diagnosis_text?: string;
  preferred_ward_type?: string;
  // External (optional)
  external_facility_name?: string;
  external_facility_code?: string;
  referral_letter?: string;
  // Sensitivity
  is_sensitive?: boolean;
}

/** Query params for listing referrals */
export interface ReferralListParams {
  patient?: number;
  encounter?: number;
  referral_type?: ReferralType;
  target_service?: ReferralTargetService;
  status?: ReferralStatus;
  priority?: ReferralPriority;
  referred_by?: number;
  is_sensitive?: boolean;
  created_from?: string;
  created_to?: string;
  search?: string;
  ordering?: string;
  page?: number;
}

/** Referral stats response */
export interface ReferralStats {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
}

/** Paginated response reuse */
export interface PaginatedReferralResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ClinicalReferralListItem[];
}

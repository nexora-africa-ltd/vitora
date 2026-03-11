export type CheckInVisitType = 'NEW' | 'RETURN' | 'FOLLOW_UP' | 'EMERGENCY' | 'SCHEDULED';

export type CheckInVisitReason =
  | 'NEW_COMPLAINT'
  | 'FOLLOW_UP'
  | 'CHRONIC_CARE'
  | 'PROCEDURE_REVIEW'
  | 'REFILL_ONLY'
  | 'LAB_REVIEW'
  | 'REFERRAL_VISIT'
  | 'OTHER';

export type CheckInIdentityMethod = 'MRN' | 'NATIONAL_ID' | 'PHONE' | 'BIOMETRIC' | 'MANUAL';

export type CheckInStatus = 'WAITING' | 'IN_TRIAGE' | 'TRIAGED' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface ClinicalSnapshot {
  allergies: string[];
  active_conditions: string[];
  current_medications: string[];
  last_visit_date?: string | null;
  last_visit_clinic?: string | null;
  pending_results: Record<string, unknown>[];
  alerts: string[];
}

export interface CheckInPatientSearchResult {
  id: number;
  mrn: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  age: number;
  gender: string;
  phone_number?: string | null;
  identification_type?: string | null;
  identification_number?: string | null;
  county: number;
  sub_county: number;
  last_visit_date?: string | null;
}

export interface CheckInPatientLookup extends CheckInPatientSearchResult {
  ward?: number | null;
  clinical_snapshot: ClinicalSnapshot;
  suggested_visit_type?: CheckInVisitType | null;
  suggested_visit_reason?: CheckInVisitReason | null;
  last_encounter_date?: string | null;
  linkable_encounter_id?: number | null;
}

export interface CheckInRequest {
  destination: 'TRIAGE' | string;
  visit_type?: CheckInVisitType | null;
  visit_reason?: CheckInVisitReason;
  skip_triage?: boolean;
  chief_complaint?: string;
  notes?: string;
  linked_encounter_id?: number | null;
  identity_method?: CheckInIdentityMethod;
}

export type CheckInRoutingMode = 'TRIAGE' | 'CLINIC';

export interface CheckInResponse {
  checkin_id: number;
  patient_name: string;
  patient_mrn: string;
  destination: string;
  destination_clinic_id?: number | null;
  destination_clinic_name?: string | null;
  visit_type: CheckInVisitType;
  visit_reason: CheckInVisitReason;
  skip_triage: boolean;
  status: CheckInStatus;
  queue_position: number;
  estimated_wait_minutes: number;
  checked_in_at: string;
  encounter_id?: number | null;
  linked_encounter_id?: number | null;
  clinic_visit_id?: number | null;
  warning?: string | null;
}
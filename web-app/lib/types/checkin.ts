/**
 * Check-in types for Vitora HMIS
 *
 * Sprint: Returning Patient Workflow - Sprint 1
 */

import type { VisitReason } from './encounter';

// Re-export for backward compatibility
export type { VisitReason } from './encounter';

/**
 * Clinical snapshot containing summary of patient's clinical information
 */
export interface ClinicalSnapshot {
  allergies: string[];
  active_conditions: string[];
  current_medications: string[];
  last_visit_date: string | null;
  last_visit_clinic: string | null;
  pending_results: PendingResult[];
  alerts: string[];
}

/**
 * Pending lab result info
 */
export interface PendingResult {
  test_name: string;
  ordered_date: string | null;
  status: string;
}

/**
 * Patient lookup response with clinical snapshot
 */
export interface PatientLookupResponse {
  id: number;
  mrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  age: number;
  gender: string;
  phone_number?: string;
  identification_type?: string;
  identification_number?: string;
  county?: number;
  sub_county?: number;
  ward?: number;
  clinical_snapshot: ClinicalSnapshot;
  suggested_visit_type: VisitType;
  suggested_visit_reason: VisitReason;
  last_encounter_date: string | null;
}

/**
 * Patient search result (lightweight, no clinical snapshot)
 * Used for listing multiple matches before selection
 */
export interface PatientSearchResult {
  id: number;
  mrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  age: number;
  gender: string;
  phone_number?: string;
  identification_type?: string;
  identification_number?: string;
  county?: number;
  sub_county?: number;
  last_visit_date: string | null;
}

/**
 * Patient search response (paginated list)
 */
export interface PatientSearchResponse {
  count: number;
  results: PatientSearchResult[];
}

/**
 * Visit type options
 */
export type VisitType = 'NEW' | 'RETURN' | 'FOLLOW_UP' | 'EMERGENCY' | 'SCHEDULED';

/**
 * Visit reason options - re-exported from encounter.ts
 */

/**
 * Check-in request data
 */
export interface CheckInRequest {
  destination: 'TRIAGE' | 'EMERGENCY' | number;
  visit_type?: VisitType;
  visit_reason?: VisitReason;
  skip_triage?: boolean;
  chief_complaint?: string;
  notes?: string;
  linked_encounter_id?: number;
  identity_method?: 'MRN' | 'NATIONAL_ID' | 'PHONE' | 'BIOMETRIC' | 'MANUAL';
  procedure_order?: number;
}

/**
 * Check-in response
 */
export interface CheckInResponse {
  checkin_id: number;
  patient_name: string;
  patient_mrn: string;
  destination: string;
  destination_clinic_id: number | null;
  destination_clinic_name: string | null;
  visit_type: VisitType;
  visit_reason: VisitReason;
  skip_triage: boolean;
  status: string;
  queue_position: number;
  estimated_wait_minutes: number;
  checked_in_at: string;
  encounter_id: number | null;
  linked_encounter_id: number | null;
  clinic_visit_id: number | null;
  warning?: string;
}

/**
 * Today's check-in list item
 */
export interface TodayCheckin {
  id: number;
  patient_name: string;
  patient_mrn: string;
  destination: string;
  destination_clinic_id: number | null;
  visit_type: VisitType;
  visit_reason: VisitReason;
  status: string;
  checked_in_at: string;
  checked_in_by_name: string | null;
  skip_triage: boolean;
}

/**
 * Paginated today's check-ins response
 */
export interface TodayCheckinsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: TodayCheckin[];
}

/**
 * Visit type options for UI dropdowns
 */
export const VISIT_TYPE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: 'NEW', label: 'New Patient' },
  { value: 'RETURN', label: 'Returning Patient' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'SCHEDULED', label: 'Scheduled Appointment' },
];

/**
 * Visit reason options for UI dropdowns
 */
export const VISIT_REASON_OPTIONS: { value: VisitReason; label: string; skipTriage?: boolean; emergency?: boolean }[] = [
  { value: 'NEW_COMPLAINT', label: 'New Complaint' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'EMERGENCY', label: 'Emergency', emergency: true },
  { value: 'CHRONIC_CARE', label: 'Chronic Care Review' },
  { value: 'SCHEDULED_PROCEDURE', label: 'Scheduled Procedure', skipTriage: true },
  { value: 'PROCEDURE_REVIEW', label: 'Post-Procedure Review' },
  { value: 'REFILL_ONLY', label: 'Medication Refill Only', skipTriage: true },
  { value: 'LAB_REVIEW', label: 'Lab Results Review', skipTriage: true },
  { value: 'REFERRAL_VISIT', label: 'Referral from Another Facility' },
  { value: 'OTHER', label: 'Other' },
];

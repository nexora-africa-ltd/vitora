/**
 * Version History Types for Vitora HMIS
 *
 * Types for model version tracking and audit trail display.
 * Supports DHA compliance requirement for field-level change tracking.
 */

/**
 * Represents a single field change between versions
 */
export interface FieldChange {
  /** Previous value (null for creation) */
  old: string | number | boolean | null;
  /** New value */
  new: string | number | boolean | null;
}

/**
 * Map of field names to their changes
 */
export type FieldChanges = Record<string, FieldChange>;

/**
 * Type of history operation
 */
export type HistoryType = 'created' | 'updated' | 'deleted';

/**
 * A single version in the history timeline
 */
export interface VersionHistoryItem {
  /** Unique version identifier */
  version_id: number;
  /** Type of change: created, updated, or deleted */
  history_type: HistoryType;
  /** ISO timestamp of when the change occurred */
  history_date: string;
  /** User ID who made the change (null for system changes) */
  history_user_id: number | null;
  /** Username of the user who made the change */
  history_user: string | null;
  /** Field-level changes (empty for creation) */
  changes: FieldChanges;
}

/**
 * Response from version count endpoint
 */
export interface VersionCountResponse {
  /** Total number of versions */
  count: number;
}

/**
 * Parameters for fetching history
 */
export interface HistoryParams {
  /** Maximum number of versions to return */
  limit?: number;
}

/**
 * Field metadata for display purposes
 */
export interface FieldDisplayConfig {
  /** Human-readable label */
  label: string;
  /** How to format the value */
  format?: 'date' | 'datetime' | 'phone' | 'currency' | 'boolean' | 'text';
  /** Whether this is a sensitive field (mask in UI) */
  sensitive?: boolean;
}

/**
 * Field display configuration for different models
 */
export const PATIENT_FIELD_LABELS: Record<string, FieldDisplayConfig> = {
  first_name: { label: 'First Name' },
  middle_name: { label: 'Middle Name' },
  last_name: { label: 'Last Name' },
  date_of_birth: { label: 'Date of Birth', format: 'date' },
  gender: { label: 'Gender' },
  phone_number: { label: 'Phone Number', format: 'phone', sensitive: true },
  email: { label: 'Email' },
  national_id: { label: 'National ID', sensitive: true },
  identification_type: { label: 'ID Type' },
  identification_number: { label: 'ID Number', sensitive: true },
  address: { label: 'Address' },
  county: { label: 'County' },
  sub_county: { label: 'Sub-County' },
  ward: { label: 'Ward' },
  village: { label: 'Village' },
  is_sensitive: { label: 'Sensitive Patient', format: 'boolean' },
  consent_given: { label: 'Consent Given', format: 'boolean' },
  consent_date: { label: 'Consent Date', format: 'datetime' },
  emergency_contact_name: { label: 'Emergency Contact Name' },
  emergency_contact_phone: { label: 'Emergency Contact Phone', format: 'phone' },
  emergency_contact_relationship: { label: 'Emergency Contact Relationship' },
  sha_number: { label: 'SHA Number' },
  cr_number: { label: 'CR Number' },
};

export const ENCOUNTER_FIELD_LABELS: Record<string, FieldDisplayConfig> = {
  patient: { label: 'Patient ID' },
  encounter_type: { label: 'Encounter Type' },
  encounter_date: { label: 'Encounter Date', format: 'date' },
  visit_reason: { label: 'Visit Reason' },
  chief_complaint: { label: 'Chief Complaint' },
  temperature: { label: 'Temperature (°C)' },
  pulse: { label: 'Pulse (bpm)' },
  blood_pressure: { label: 'Blood Pressure' },
  respiratory_rate: { label: 'Respiratory Rate' },
  spo2: { label: 'SpO2 (%)' },
  weight: { label: 'Weight (kg)' },
  height: { label: 'Height (cm)' },
  vitals_source: { label: 'Vitals Source' },
  vitals_recorded_by: { label: 'Vitals Recorded By' },
  vitals_recorded_at: { label: 'Vitals Recorded At', format: 'datetime' },
  notes: { label: 'Clinical Notes' },
  status: { label: 'Status' },
  disposition: { label: 'Disposition' },
  disposition_notes: { label: 'Disposition Notes' },
  finalized_by: { label: 'Finalized By' },
  finalized_at: { label: 'Finalized At', format: 'datetime' },
  cancellation_reason: { label: 'Cancellation Reason' },
  triage_requirement: { label: 'Triage Requirement' },
  triage_status: { label: 'Triage Status' },
  triage_bypass_reason: { label: 'Triage Bypass Reason' },
  triage_bypassed_by: { label: 'Triage Bypassed By' },
  triage_bypassed_at: { label: 'Triage Bypassed At', format: 'datetime' },
  consultation_status: { label: 'Consultation Status' },
  called_at: { label: 'Called At', format: 'datetime' },
  consultation_started_at: { label: 'Consultation Started At', format: 'datetime' },
  assigned_clinician: { label: 'Assigned Clinician' },
  claimed_at: { label: 'Claimed At', format: 'datetime' },
  linked_encounter: { label: 'Linked Encounter' },
  chief_complaint_original: { label: 'Original Chief Complaint' },
  chief_complaint_edited: { label: 'Chief Complaint Edited', format: 'boolean' },
  chief_complaint_edit_reason: { label: 'Chief Complaint Edit Reason' },
  chief_complaint_edit_reason_other: { label: 'Chief Complaint Edit Reason (Other)' },
  chief_complaint_edited_by: { label: 'Chief Complaint Edited By' },
  chief_complaint_edited_at: { label: 'Chief Complaint Edited At', format: 'datetime' },
  allergies: { label: 'Allergies' },
  chronic_conditions: { label: 'Chronic Conditions' },
  current_medications: { label: 'Current Medications' },
  past_surgeries: { label: 'Past Surgeries' },
  family_history: { label: 'Family History' },
  social_history: { label: 'Social History' },
  history_of_present_illness: { label: 'History of Present Illness' },
  physical_examination: { label: 'Physical Examination' },
  assessment: { label: 'Clinical Assessment' },
  created_by: { label: 'Created By' },
};

export const PRESCRIPTION_FIELD_LABELS: Record<string, FieldDisplayConfig> = {
  status: { label: 'Status' },
  valid_until: { label: 'Valid Until', format: 'date' },
  clinical_notes: { label: 'Clinical Notes' },
  dispensing_notes: { label: 'Dispensing Notes' },
};

export const DIAGNOSIS_FIELD_LABELS: Record<string, FieldDisplayConfig> = {
  diagnosis_type: { label: 'Diagnosis Type' },
  notes: { label: 'Notes' },
  is_confirmed: { label: 'Confirmed', format: 'boolean' },
};

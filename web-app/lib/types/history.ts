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
  encounter_type: { label: 'Encounter Type' },
  encounter_date: { label: 'Encounter Date', format: 'date' },
  chief_complaint: { label: 'Chief Complaint' },
  temperature: { label: 'Temperature (°C)' },
  pulse: { label: 'Pulse (bpm)' },
  blood_pressure: { label: 'Blood Pressure' },
  respiratory_rate: { label: 'Respiratory Rate' },
  spo2: { label: 'SpO2 (%)' },
  weight: { label: 'Weight (kg)' },
  height: { label: 'Height (cm)' },
  notes: { label: 'Clinical Notes' },
  status: { label: 'Status' },
  allergies: { label: 'Allergies' },
  chronic_conditions: { label: 'Chronic Conditions' },
  current_medications: { label: 'Current Medications' },
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

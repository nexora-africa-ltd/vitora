/**
 * Patient type definitions for Vitora HMIS
 */

// Supported identification types (aligned with SHA/CR)
export type IdentificationType =
  | 'national_id'
  | 'cr_number'
  | 'mandate_number'
  | 'alien_id'
  | 'kra_pin'
  | 'temporary_id'
  | 'passport'
  | 'birth_certificate';

export const IDENTIFICATION_TYPE_OPTIONS: Array<{ value: IdentificationType; label: string }> = [
  { value: 'national_id', label: 'National ID' },
  { value: 'cr_number', label: 'HIE Patient ID' },
  { value: 'mandate_number', label: 'Mandate Number' },
  { value: 'alien_id', label: 'Alien ID' },
  { value: 'kra_pin', label: 'KRA PIN' },
  { value: 'temporary_id', label: 'Temporary ID' },
  { value: 'passport', label: 'Passport Number' },
  { value: 'birth_certificate', label: 'Birth Certificate' },
];

// Title options
export type PatientTitle = 'Mr' | 'Mrs' | 'Miss' | 'Ms' | 'Dr' | 'Prof' | 'Hon' | 'Rev' | '';

export const TITLE_OPTIONS: Array<{ value: PatientTitle; label: string }> = [
  { value: '', label: 'None' },
  { value: 'Mr', label: 'Mr' },
  { value: 'Mrs', label: 'Mrs' },
  { value: 'Miss', label: 'Miss' },
  { value: 'Ms', label: 'Ms' },
  { value: 'Dr', label: 'Dr' },
  { value: 'Prof', label: 'Prof' },
  { value: 'Hon', label: 'Hon' },
  { value: 'Rev', label: 'Rev' },
];

export interface Patient {
  id: number;
  mrn: string;
  // Client Registry
  cr_number?: string;
  cr_synced_at?: string | null;
  // SHA Integration
  sha_number?: string;
  // Personal Information
  title?: PatientTitle;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name?: string;
  date_of_birth: string;
  place_of_birth?: string;
  age?: number;
  gender: 'M' | 'F' | 'O';
  citizenship?: string;
  is_person_with_disability?: boolean;
  // Identification
  identification_type?: IdentificationType;
  identification_number?: string;
  national_id?: string; // Legacy, kept for backward compatibility
  // Contact Information
  phone_number?: string;
  email?: string;
  address?: string;
  // Location
  county: number;
  county_name?: string;
  sub_county: number;
  sub_county_name?: string;
  ward?: number;
  ward_name?: string;
  village?: string;
  // Consent
  is_sensitive: boolean;
  consent_given: boolean;
  consent_date?: string;
  consent_deferred?: boolean;
  referral_source: 'self' | 'clinic' | 'other_facility';
  referred_from_facility?: string;
  // Emergency contacts (nested array)
  emergency_contacts?: EmergencyContact[];
  // Primary emergency contact convenience fields
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  // Clinical summary (read-only, computed from Allergy model + latest encounter)
  allergy_summary?: string[];
  chronic_conditions_summary?: string;
  registered_by: number;
  registered_by_username?: string;
  registered_at_facility?: number | null;
  registered_at_facility_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientCreateData {
  // Client Registry (readonly after creation if from CR)
  cr_number?: string;
  // SHA (Social Health Authority) - readonly, populated from SHA lookup
  sha_number?: string;
  // Personal Information
  title?: PatientTitle;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth: string;
  place_of_birth?: string;
  gender: 'M' | 'F' | 'O';
  citizenship?: string;
  is_person_with_disability?: boolean;
  // Identification
  identification_type?: IdentificationType;
  identification_number?: string;
  national_id?: string; // Legacy
  // Contact Information
  phone_number?: string;
  email?: string;
  address?: string;
  // Location
  county: number;
  sub_county: number;
  ward?: number;
  village?: string;
  // Payment
  payment_mode?: PaymentMode;
  insurance_provider?: string;
  insurance_member_number?: string;
  // Other
  referral_source?: 'self' | 'clinic' | 'other_facility';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  consent_given?: boolean;
  consent_date?: string;
  consent_deferred?: boolean;
}

// Payment mode options
export type PaymentMode = 'cash' | 'sha' | 'insurance_private' | 'insurance_corporate';

export const PAYMENT_MODE_OPTIONS: Array<{ value: PaymentMode; label: string; description?: string }> = [
  { value: 'cash', label: 'Cash', description: 'Patient pays out of pocket' },
  { value: 'sha', label: 'SHA (Social Health Authority)', description: 'Government health insurance' },
  { value: 'insurance_private', label: 'Private Insurance', description: 'Individual private health cover' },
  { value: 'insurance_corporate', label: 'Corporate Insurance', description: 'Employer-provided health cover' },
];

export interface PatientUpdateData extends Partial<PatientCreateData> {
  is_sensitive?: boolean;
}

export interface EmergencyContact {
  id: number;
  full_name: string;
  relationship: string;
  phone_number: string;
  alternative_phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientListParams {
  page?: number;
  page_size?: number;
  search?: string;
  gender?: string;
  county?: number;
  is_sensitive?: boolean;
  current_facility_only?: boolean;
  ordering?: string;
}

export interface PatientEncounter {
  id: number;
  encounter_type: string;
  status: 'CREATED' | 'CHECKED_IN' | 'TRIAGED' | 'IN_PROGRESS' | 'ON_HOLD' | 'ORDERS_PLACED' | 'RESULTS_PENDING' | 'READY_TO_CLOSE' | 'CLOSED' | 'COMPLETED' | 'CANCELLED';
  encounter_date: string;
  chief_complaint: string;
  created_at: string;
}

/**
 * Duplicate check result from /api/patients/check-duplicate/
 */
export interface DuplicateCheckResult {
  has_duplicate: boolean;
  match_type: 'exact_id' | 'demographic' | 'partial' | null;
  matches: DuplicateMatch[];
}

export interface DuplicateMatch {
  id: number;
  mrn: string;
  full_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  match_confidence: number;
  match_reason: string;
}

export interface DuplicateCheckParams {
  identification_number?: string;
  identification_type?: IdentificationType;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: 'M' | 'F' | 'O';
}

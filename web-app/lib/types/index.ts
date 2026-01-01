/**
 * Type definitions for Vitora HMIS
 */

// Re-export enhanced encounter types
export type {
  Encounter as EnhancedEncounter,
  Diagnosis,
  TreatmentPlan,
  Medication,
  VitalSign,
  EncounterListParams,
} from './encounter';

// Re-export patient types
export type {
  Patient as EnhancedPatient,
  PatientCreateData,
  PatientUpdateData,
  EmergencyContact,
  PatientListParams,
  PatientEncounter,
} from './patient';

// User types
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  permissions: string[];
}

// Patient types
export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  national_id?: string;
  phone_number?: string;
  county: number;
  county_name?: string;
  sub_county: number;
  sub_county_name?: string;
  ward?: number;
  ward_name?: string;
  is_sensitive: boolean;
  consent_given: boolean;
  consent_date?: string;
  referral_source: 'self' | 'clinic' | 'other_facility';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  registered_by: number;
  created_at: string;
  updated_at: string;
}

// Encounter types
export interface Encounter {
  id: number;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  encounter_type: 'OPD' | 'IPD' | 'EMERGENCY';
  encounter_date: string;
  chief_complaint: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  past_surgeries?: string;
  family_history?: string;
  social_history?: string;
  created_at: string;
  updated_at: string;
}

// Kenya Location types
export interface County {
  id: number;
  code: number;
  name: string;
}

export interface SubCounty {
  id: number;
  county: number;
  name: string;
}

export interface Ward {
  id: number;
  sub_county: number;
  name: string;
}

// Pagination
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// API Error
export interface APIError {
  detail?: string;
  [key: string]: string | string[] | undefined;
}

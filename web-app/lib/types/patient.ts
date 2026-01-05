/**
 * Patient type definitions for Vitora HMIS
 */

export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name?: string;
  date_of_birth: string;
  age?: number;
  gender: 'M' | 'F' | 'O';
  national_id?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  county: number;
  county_name?: string;
  sub_county: number;
  sub_county_name?: string;
  ward?: number;
  ward_name?: string;
  village?: string;
  is_sensitive: boolean;
  consent_given: boolean;
  consent_date?: string;
  referral_source: 'self' | 'clinic' | 'other_facility';
  referred_from_facility?: string;
  // Emergency contacts (nested array)
  emergency_contacts?: EmergencyContact[];
  // Primary emergency contact convenience fields
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  registered_by: number;
  registered_by_username?: string;
  created_at: string;
  updated_at: string;
}

export interface PatientCreateData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  national_id?: string;
  phone_number?: string;
  email?: string;
  county: number;
  sub_county: number;
  ward?: number;
  village?: string;
  referral_source?: 'self' | 'clinic' | 'other_facility';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  consent_given?: boolean;
  consent_date?: string;
}

export interface PatientUpdateData extends Partial<PatientCreateData> {
  is_sensitive?: boolean;
}

export interface EmergencyContact {
  id: number;
  full_name: string;
  relationship: string;
  phone_number: string;
  alternative_phone?: string;
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
  ordering?: string;
}

export interface PatientEncounter {
  id: number;
  encounter_type: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  encounter_date: string;
  chief_complaint: string;
  created_at: string;
}

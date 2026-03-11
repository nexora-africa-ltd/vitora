import type { EncounterStatus, Gender, ReferralSource } from './common';

export interface Patient {
  id: number;
  mrn: string;
  cr_number?: string | null;
  sha_number?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  full_name?: string | null;
  date_of_birth: string;
  age?: number | null;
  gender: Gender;
  identification_type?: string | null;
  identification_number?: string | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  county: number;
  county_name?: string;
  sub_county: number;
  sub_county_name?: string;
  ward?: number | null;
  ward_name?: string | null;
  village?: string | null;
  is_sensitive: boolean;
  consent_given: boolean;
  consent_date?: string | null;
  referral_source: ReferralSource;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientCreateData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth: string;
  gender: Gender;
  phone_number?: string;
  identification_type?: string;
  identification_number?: string;
  county: number;
  sub_county: number;
  ward?: number;
  village?: string;
  referral_source?: ReferralSource;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

export interface PatientListParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  modified_after?: string;
}

export interface PatientEncounter {
  id: number;
  encounter_type: string;
  status: EncounterStatus;
  encounter_date: string;
  chief_complaint: string;
  created_at: string;
}
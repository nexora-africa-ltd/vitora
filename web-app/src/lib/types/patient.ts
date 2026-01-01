/**
 * Patient-related TypeScript types.
 */

export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  phone_number: string | null;
  national_id: string | null;
  email: string | null;
  
  // Address
  county: number | null;
  county_name?: string;
  sub_county: number | null;
  sub_county_name?: string;
  ward: number | null;
  ward_name?: string;
  village: string;
  
  // Emergency contact
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  
  // Referral
  referral_source: 'self' | 'clinic' | 'other_facility';
  referred_from_facility: string;
  
  // Consent
  consent_given: boolean;
  consent_date: string | null;
  
  // Sensitive
  is_sensitive: boolean;
  
  // Metadata
  registered_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PatientListParams {
  page?: number;
  page_size?: number;
  search?: string;
  gender?: string;
  county?: number;
  ordering?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

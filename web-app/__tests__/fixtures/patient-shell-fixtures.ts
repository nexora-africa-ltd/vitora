/**
 * Shared test fixtures for Patient Shell pattern tests
 *
 * These fixtures are type-complete to satisfy TypeScript strict mode.
 */
import type { Patient } from '@/lib/types/patient';
import type { Encounter } from '@/lib/types/encounter';

// =============================================================================
// Patient Fixtures
// =============================================================================

export const mockPatient: Patient = {
  id: 1,
  mrn: 'MRN-20260115-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1985-05-20',
  gender: 'F',
  phone_number: '+254712345678',
  email: 'jane.doe@example.com',
  county: 1,
  county_name: 'Nairobi',
  sub_county: 1,
  sub_county_name: 'Westlands',
  ward: 1,
  ward_name: 'Parklands',
  is_sensitive: false,
  consent_given: true,
  cr_number: 'CR-12345',
  sha_number: 'SHA-67890',
  referral_source: 'self',
  registered_by: 1,
  registered_by_username: 'admin',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
};

export const mockSensitivePatient: Patient = {
  ...mockPatient,
  id: 2,
  mrn: 'MRN-20260115-0002',
  is_sensitive: true,
};

export const mockUnverifiedPatient: Patient = {
  ...mockPatient,
  id: 3,
  mrn: 'MRN-20260115-0003',
  cr_number: undefined,
  sha_number: undefined,
};

// Minimal patient for layout tests (requires less fields in mock API responses)
export const mockPatientMinimal = {
  id: 1,
  mrn: 'MRN-20260115-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1985-05-20',
  gender: 'F' as const,
  phone_number: '+254712345678',
  county: 1,
  sub_county: 1,
  is_sensitive: false,
  consent_given: true,
  cr_number: 'CR-12345',
  sha_number: 'SHA-67890',
  referral_source: 'self' as const,
  registered_by: 1,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
};

// =============================================================================
// Encounter Fixtures
// =============================================================================

export const mockEncounter: Encounter = {
  id: 100,
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260115-0001',
  encounter_type: 'OPD',
  encounter_date: '2026-01-15',
  status: 'IN_PROGRESS',
  triage_status: 'COMPLETED',
  chief_complaint: 'Persistent headache',
  temperature: 37.2,
  pulse: 72,
  blood_pressure: '120/80',
  respiratory_rate: 16,
  spo2: 98,
  weight: 65,
  height: 165,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  notes: 'Patient presents with 3-day history of headache',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T11:30:00Z',
};

export const mockEncounterCompleted: Encounter = {
  ...mockEncounter,
  status: 'COMPLETED' as const,
};

export const mockEncounterCancelled: Encounter = {
  ...mockEncounter,
  status: 'CANCELLED' as const,
};

// Minimal encounter for tests that don't need all vitals
export const mockEncounterMinimal = {
  id: 100,
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260115-0001',
  encounter_type: 'OPD',
  encounter_date: '2026-01-15',
  status: 'IN_PROGRESS' as const,
  triage_status: 'COMPLETED' as const,
  chief_complaint: 'Persistent headache',
  temperature: null,
  pulse: null,
  blood_pressure: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  notes: '',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T11:30:00Z',
};

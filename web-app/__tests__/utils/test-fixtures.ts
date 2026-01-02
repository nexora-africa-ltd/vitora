/**
 * Test Fixtures
 * Factory functions for creating mock data in tests
 */
import { Patient } from '@/lib/types/patient';
import { Encounter } from '@/lib/types/encounter';

/**
 * Create a mock patient with optional overrides
 */
export function createMockPatient(overrides?: Partial<Patient>): Patient {
  return {
    id: 1,
    mrn: 'MRN-20260101-0001',
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
    ward_name: 'Kitisuru',
    national_id: '12345678',
    is_sensitive: false,
    consent_given: true,
    consent_date: '2026-01-01T00:00:00Z',
    referral_source: 'self',
    emergency_contact_name: 'John Doe',
    emergency_contact_phone: '+254712345679',
    emergency_contact_relationship: 'spouse',
    registered_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create multiple mock patients
 */
export function createMockPatients(count: number, overrides?: Partial<Patient>[]): Patient[] {
  return Array.from({ length: count }, (_, index) => 
    createMockPatient({
      id: index + 1,
      mrn: `MRN-20260101-${String(index + 1).padStart(4, '0')}`,
      first_name: `Patient${index + 1}`,
      last_name: `Test`,
      ...overrides?.[index],
    })
  );
}

/**
 * Create a mock encounter with optional overrides
 */
export function createMockEncounter(overrides?: Partial<Encounter>): Encounter {
  return {
    id: 1,
    patient: 1,
    patient_name: 'Jane Doe',
    patient_mrn: 'MRN-20260101-0001',
    encounter_type: 'OPD',
    encounter_date: '2026-01-01',
    chief_complaint: 'Headache and fever',
    status: 'IN_PROGRESS',
    
    // Vitals
    temperature: 37.5,
    pulse: 80,
    blood_pressure: '120/80',
    respiratory_rate: 18,
    spo2: 98,
    weight: 70,
    height: 170,
    
    // Medical history
    allergies: 'Penicillin',
    chronic_conditions: 'None',
    current_medications: 'None',
    past_surgeries: 'Appendectomy 2015',
    family_history: 'Hypertension (father)',
    social_history: 'Non-smoker, occasional alcohol',
    
    // Clinical notes
    notes: '',
    history_of_present_illness: 'Patient reports headache for 3 days',
    physical_examination: 'Alert, oriented. Temp elevated.',
    assessment: 'Possible viral infection',
    plan: 'Rest, fluids, paracetamol PRN',
    
    // Metadata
    created_by: 1,
    created_by_name: 'Dr. Test User',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:30:00Z',
    
    ...overrides,
  };
}

/**
 * Create multiple mock encounters
 */
export function createMockEncounters(count: number, overrides?: Partial<Encounter>[]): Encounter[] {
  return Array.from({ length: count }, (_, index) =>
    createMockEncounter({
      id: index + 1,
      encounter_date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      ...overrides?.[index],
    })
  );
}

/**
 * Create mock ICD-10 diagnosis
 */
export function createMockDiagnosis(overrides?: Partial<any>) {
  return {
    id: 1,
    encounter: 1,
    icd10_code: 'J06.9',
    icd10_name: 'Acute upper respiratory infection, unspecified',
    diagnosis_type: 'primary',
    notes: 'Provisional diagnosis',
    created_at: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

/**
 * Create mock treatment plan
 */
export function createMockTreatmentPlan(overrides?: Partial<any>) {
  return {
    id: 1,
    encounter: 1,
    template_name: 'Standard OPD Treatment',
    instructions: 'Rest and hydration',
    follow_up_date: '2026-01-08',
    follow_up_instructions: 'Return if symptoms worsen',
    referral_needed: false,
    referral_specialty: null,
    referral_notes: null,
    created_at: '2026-01-01T10:00:00Z',
    medications: [
      {
        id: 1,
        name: 'Paracetamol',
        dosage: '500mg',
        frequency: 'TDS',
        duration: '5 days',
        instructions: 'Take after meals',
      },
    ],
    ...overrides,
  };
}

/**
 * Create mock Kenya county
 */
export function createMockCounty(overrides?: Partial<any>) {
  return {
    id: 1,
    code: 47,
    name: 'Nairobi',
    ...overrides,
  };
}

/**
 * Create mock Kenya sub-county
 */
export function createMockSubCounty(overrides?: Partial<any>) {
  return {
    id: 1,
    county: 1,
    name: 'Westlands',
    ...overrides,
  };
}

/**
 * Create mock Kenya ward
 */
export function createMockWard(overrides?: Partial<any>) {
  return {
    id: 1,
    sub_county: 1,
    name: 'Kitisuru',
    ...overrides,
  };
}

/**
 * Create mock user
 */
export function createMockUser(overrides?: Partial<any>) {
  return {
    id: 1,
    username: 'testuser',
    email: 'testuser@vitora.health',
    first_name: 'Test',
    last_name: 'User',
    is_staff: false,
    is_superuser: false,
    ...overrides,
  };
}

/**
 * Create mock auth tokens
 */
export function createMockTokens() {
  return {
    access: 'mock-access-token-12345',
    refresh: 'mock-refresh-token-67890',
  };
}

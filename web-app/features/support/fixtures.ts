/**
 * BDD Test Support - Test Fixtures
 * 
 * Factory functions for creating test data.
 * Mirrors backend conftest.py fixtures for consistency.
 */

import { PatientContext, EncounterContext, UserContext } from './world';

/**
 * Type-safe DataTable row with guaranteed string values
 */
export type DataTableRow = Record<string, string>;

/**
 * Ensures DataTable hash values are strings (not undefined)
 * Use this when accessing values from dataTable.hashes() or dataTable.rowsHash()
 */
export function ensureString(value: string | undefined, defaultValue = ''): string {
  return value ?? defaultValue;
}

/**
 * Converts DataTable hashes to type-safe rows with guaranteed string values
 */
export function safeHashes(hashes: Array<Record<string, string | undefined>>): DataTableRow[] {
  return hashes.map(row => {
    const safeRow: DataTableRow = {};
    for (const [key, value] of Object.entries(row)) {
      safeRow[key] = value ?? '';
    }
    return safeRow;
  });
}

/**
 * Converts DataTable rowsHash to type-safe record with guaranteed string values
 */
export function safeRowsHash(rowsHash: Record<string, string | undefined>): DataTableRow {
  const safeRow: DataTableRow = {};
  for (const [key, value] of Object.entries(rowsHash)) {
    safeRow[key] = value ?? '';
  }
  return safeRow;
}

/**
 * Kenya counties for location hierarchy tests
 */
export const KENYA_COUNTIES = [
  { id: 1, code: 1, name: 'Mombasa' },
  { id: 2, code: 2, name: 'Kwale' },
  { id: 47, code: 47, name: 'Nairobi' },
] as const;

/**
 * Sample sub-counties (Nairobi)
 */
export const NAIROBI_SUB_COUNTIES = [
  { id: 1, name: 'Westlands', countyId: 47 },
  { id: 2, name: 'Langata', countyId: 47 },
  { id: 3, name: 'Kibra', countyId: 47 },
  { id: 4, name: 'Starehe', countyId: 47 },
] as const;

/**
 * User permission sets by role
 */
export const PERMISSIONS = {
  receptionist: [
    'patients.add_patient',
    'patients.change_patient',
    'patients.view_patient',
    'core.add_queue',
    'core.view_queue',
  ],
  nurse: [
    'patients.view_patient',
    'encounters.add_encounter',
    'encounters.change_encounter',
    'encounters.view_encounter',
  ],
  doctor: [
    'patients.view_patient',
    'patients.view_sensitive_patient',
    'encounters.add_encounter',
    'encounters.change_encounter',
    'encounters.view_encounter',
    'encounters.add_prescription',
  ],
  pharmacist: [
    'pharmacy.view_drug',
    'pharmacy.view_stock',
    'pharmacy.add_dispensing',
    'pharmacy.change_dispensing',
    'pharmacy.view_prescription',
  ],
  admin: [
    'patients.add_patient',
    'patients.change_patient',
    'patients.view_patient',
    'patients.view_sensitive_patient',
    'encounters.add_encounter',
    'encounters.change_encounter',
    'encounters.view_encounter',
    'pharmacy.view_drug',
    'pharmacy.add_stock',
    'core.view_auditlog',
  ],
} as const;

/**
 * Create a test user with specified role
 */
export function createUser(
  role: keyof typeof PERMISSIONS,
  overrides: Partial<UserContext> = {}
): UserContext {
  return {
    id: Math.floor(Math.random() * 10000),
    username: `${role}_user`,
    email: `${role}@vitora.health`,
    permissions: [...PERMISSIONS[role]],
    ...overrides,
  };
}

/**
 * Create a test patient
 */
export function createPatient(overrides: Partial<PatientContext> = {}): PatientContext {
  const today = new Date();
  const dateParts = today.toISOString().split('T')[0];
  const dateStr = dateParts ? dateParts.replace(/-/g, '') : '20260107';
  const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  
  return {
    mrn: `MRN-${dateStr}-${seq}`,
    firstName: 'Jane',
    lastName: 'Wanjiku',
    dateOfBirth: '1985-05-20',
    gender: 'F',
    county: 'Nairobi',
    subCounty: 'Westlands',
    ...overrides,
  };
}

/**
 * Create valid patient registration data
 */
export function createPatientData(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'First Name': 'Jane',
    'Last Name': 'Wanjiku',
    'Date of Birth': '1985-05-20',
    'Gender': 'Female',
    'National ID': '12345678',
    'Phone Number': '+254712345678',
    'County': 'Nairobi',
    'Sub-County': 'Westlands',
    ...overrides,
  };
}

/**
 * Create a test encounter
 */
export function createEncounter(overrides: Partial<EncounterContext> = {}): EncounterContext {
  return {
    type: 'OPD',
    status: 'IN_PROGRESS',
    vitals: {
      temperature: 37.2,
      pulse: 78,
      bloodPressure: '120/80',
      respiratoryRate: 18,
      spo2: 98,
      weight: 65.5,
      height: 165,
    },
    diagnoses: [
      { code: 'B50.9', description: 'Plasmodium falciparum malaria, unspecified', primary: true },
    ],
    ...overrides,
  };
}

/**
 * Create vitals data
 */
export function createVitals(overrides: Record<string, number | string> = {}): Record<string, number | string> {
  return {
    Temperature: 37.2,
    Pulse: 78,
    'Blood Pressure': '120/80',
    'Respiratory Rate': 18,
    SpO2: 98,
    Weight: 65.5,
    Height: 165,
    ...overrides,
  };
}

/**
 * Create critical vitals (for alert testing)
 */
export function createCriticalVitals(): Record<string, number | string> {
  return {
    Temperature: 39.5,
    Pulse: 120,
    'Blood Pressure': '90/60',
    'Respiratory Rate': 28,
    SpO2: 88, // Critical - below 95%
    Weight: 65.5,
    Height: 165,
  };
}

/**
 * Sample ICD-10 codes for diagnosis tests
 */
export const ICD10_CODES = [
  { code: 'B50.9', description: 'Plasmodium falciparum malaria, unspecified' },
  { code: 'B51.9', description: 'Plasmodium vivax malaria, unspecified' },
  { code: 'B54', description: 'Unspecified malaria' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { code: 'I10', description: 'Essential (primary) hypertension' },
] as const;

/**
 * Sample drugs for pharmacy tests
 */
export const SAMPLE_DRUGS = [
  { id: 1, name: 'Paracetamol 500mg', genericName: 'Paracetamol', schedule: 'OTC' },
  { id: 2, name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', schedule: 'POM' },
  { id: 3, name: 'Artemether-Lumefantrine 20/120mg', genericName: 'AL', schedule: 'POM' },
  { id: 4, name: 'Morphine 10mg', genericName: 'Morphine Sulfate', schedule: 'CD' },
] as const;

/**
 * Create prescription data
 */
export function createPrescriptionItem(
  drug: typeof SAMPLE_DRUGS[number],
  overrides: Record<string, string | number> = {}
): Record<string, string | number> {
  return {
    drug: drug.name,
    dosage: '1 tablet',
    frequency: 'Twice daily',
    duration: '7 days',
    quantity: 14,
    ...overrides,
  };
}

/**
 * Ward data for IPD tests
 */
export const SAMPLE_WARDS = [
  { id: 1, name: 'Medical Ward', type: 'Medical', totalBeds: 20, dailyRate: 2000 },
  { id: 2, name: 'Surgical Ward', type: 'Surgical', totalBeds: 15, dailyRate: 2500 },
  { id: 3, name: 'Pediatric Ward', type: 'Pediatric', totalBeds: 10, dailyRate: 1800 },
  { id: 4, name: 'ICU', type: 'Intensive', totalBeds: 6, dailyRate: 10000 },
] as const;

/**
 * Queue priority levels
 */
export const QUEUE_PRIORITIES = [
  { level: 'Emergency', color: 'red', order: 1 },
  { level: 'Urgent', color: 'orange', order: 2 },
  { level: 'Pregnant', color: 'purple', order: 3 },
  { level: 'Elderly', color: 'blue', order: 4 },
  { level: 'Child', color: 'green', order: 5 },
  { level: 'Standard', color: 'white', order: 6 },
] as const;

/**
 * Triage categories (SATS)
 */
export const TRIAGE_CATEGORIES = [
  { code: 'RED', name: 'Emergency', color: '#EF4444', maxWait: 0 },
  { code: 'ORANGE', name: 'Very Urgent', color: '#F97316', maxWait: 10 },
  { code: 'YELLOW', name: 'Urgent', color: '#EAB308', maxWait: 60 },
  { code: 'GREEN', name: 'Standard', color: '#22C55E', maxWait: 240 },
  { code: 'BLUE', name: 'Non-Urgent', color: '#3B82F6', maxWait: 480 },
] as const;

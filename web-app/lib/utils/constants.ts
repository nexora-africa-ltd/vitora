// API URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';

// App info
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Vitora HMIS';
export const APP_ENV = process.env.NEXT_PUBLIC_ENV || 'development';

// Gender options
export const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
] as const;

// Referral source options
export const REFERRAL_SOURCE_OPTIONS = [
  { value: 'self', label: 'Self' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'other_facility', label: 'Other Facility' },
] as const;

// Emergency contact relationship options
export const RELATIONSHIP_OPTIONS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'uncle_aunt', label: 'Uncle/Aunt' },
  { value: 'friend', label: 'Friend' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'employer', label: 'Employer' },
  { value: 'other', label: 'Other' },
] as const;

// Encounter types - grouped by triage requirement
// Walk-in: MANDATORY triage | Scheduled: OPTIONAL triage | Pre-assessed: NOT_REQUIRED triage
export const ENCOUNTER_TYPES = [
  // Walk-in / Mandatory triage
  { value: 'OPD', label: 'Outpatient (Walk-in)', group: 'walk-in' },
  { value: 'EMERGENCY', label: 'Emergency', group: 'walk-in' },
  { value: 'IPD', label: 'Inpatient', group: 'walk-in' },
  { value: 'ANC', label: 'Antenatal Clinic', group: 'walk-in' },
  { value: 'PAEDIATRIC', label: 'Paediatric Clinic', group: 'walk-in' },
  { value: 'DIALYSIS', label: 'Dialysis Unit', group: 'walk-in' },
  { value: 'ONCOLOGY', label: 'Oncology Clinic', group: 'walk-in' },
  // Scheduled / Optional triage
  { value: 'SCHEDULED_OPD', label: 'Scheduled Outpatient', group: 'scheduled' },
  { value: 'FOLLOW_UP', label: 'Follow-up Visit', group: 'scheduled' },
  { value: 'CONSULTANT_REVIEW', label: 'Consultant Review', group: 'scheduled' },
  { value: 'CHRONIC_STABLE', label: 'Stable Chronic Care', group: 'scheduled' },
  { value: 'SPECIALIST_CLINIC', label: 'Specialist Clinic', group: 'scheduled' },
  // Pre-assessed / Not required triage
  { value: 'PROCEDURE', label: 'Scheduled Procedure', group: 'pre-assessed' },
  { value: 'DAY_CASE', label: 'Day Case', group: 'pre-assessed' },
  { value: 'WARD_ROUND', label: 'Ward Round', group: 'pre-assessed' },
  { value: 'DISCHARGE_REVIEW', label: 'Discharge Review', group: 'pre-assessed' },
] as const;

// Group labels for encounter types
export const ENCOUNTER_TYPE_GROUPS = {
  'walk-in': { label: 'Walk-in (Triage Required)', description: 'Patients need to be triaged' },
  'scheduled': { label: 'Scheduled (Triage Optional)', description: 'Pre-booked appointments' },
  'pre-assessed': { label: 'Pre-assessed (No Triage)', description: 'Already assessed patients' },
} as const;

// Helper to get encounter types by group
export const getEncounterTypesByGroup = (group: keyof typeof ENCOUNTER_TYPE_GROUPS) => 
  ENCOUNTER_TYPES.filter(t => t.group === group);

// Triage requirement mapping
export const ENCOUNTER_TRIAGE_REQUIREMENT: Record<string, 'MANDATORY' | 'OPTIONAL' | 'NOT_REQUIRED'> = {
  // Mandatory
  OPD: 'MANDATORY',
  EMERGENCY: 'MANDATORY',
  IPD: 'MANDATORY',
  ANC: 'MANDATORY',
  PAEDIATRIC: 'MANDATORY',
  DIALYSIS: 'MANDATORY',
  ONCOLOGY: 'MANDATORY',
  // Optional
  SCHEDULED_OPD: 'OPTIONAL',
  FOLLOW_UP: 'OPTIONAL',
  CONSULTANT_REVIEW: 'OPTIONAL',
  CHRONIC_STABLE: 'OPTIONAL',
  SPECIALIST_CLINIC: 'OPTIONAL',
  // Not required
  PROCEDURE: 'NOT_REQUIRED',
  DAY_CASE: 'NOT_REQUIRED',
  WARD_ROUND: 'NOT_REQUIRED',
  DISCHARGE_REVIEW: 'NOT_REQUIRED',
};

// Encounter status
export const ENCOUNTER_STATUS = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
] as const;

// Vital sign ranges (for display and validation)
export const VITAL_RANGES = {
  temperature: { min: 36.1, max: 37.2, unit: '°C' },
  pulse: { min: 60, max: 100, unit: 'bpm' },
  respiratoryRate: { min: 12, max: 20, unit: '/min' },
  spo2: { min: 95, max: 100, unit: '%', critical: 95 },
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Type exports for TypeScript
export type Gender = (typeof GENDER_OPTIONS)[number]['value'];
export type ReferralSource = (typeof REFERRAL_SOURCE_OPTIONS)[number]['value'];
export type Relationship = (typeof RELATIONSHIP_OPTIONS)[number]['value'];
export type EncounterType = (typeof ENCOUNTER_TYPES)[number]['value'];
export type EncounterStatusType = (typeof ENCOUNTER_STATUS)[number]['value'];

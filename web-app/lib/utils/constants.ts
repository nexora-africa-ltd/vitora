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

// Encounter types
export const ENCOUNTER_TYPES = [
  { value: 'OPD', label: 'Outpatient' },
  { value: 'IPD', label: 'Inpatient' },
  { value: 'EMERGENCY', label: 'Emergency' },
] as const;

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

/**
 * Constants used throughout the application.
 */

export const ENCOUNTER_TYPES = [
  { value: 'OPD', label: 'Outpatient' },
  { value: 'IPD', label: 'Inpatient' },
  { value: 'EMERGENCY', label: 'Emergency' },
] as const;

export const ENCOUNTER_STATUS = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
] as const;

export const VITAL_RANGES = {
  temperature: { normal: [36.1, 37.2], critical: [35, 39], unit: '°C' },
  pulse: { normal: [60, 100], critical: [50, 120], unit: 'bpm' },
  respiratoryRate: { normal: [12, 20], critical: [8, 30], unit: '/min' },
  spo2: { normal: [95, 100], critical: [90, 100], unit: '%' },
} as const;

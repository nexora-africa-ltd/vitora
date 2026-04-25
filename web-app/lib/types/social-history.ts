/**
 * Social History Observation type definitions.
 *
 * Structured social-history observations for FHIR R4 interoperability.
 * Maps to backend SocialHistoryObservation model in encounters/models.py.
 */

// =============================================================================
// ENUM TYPES
// =============================================================================

export type ObservationType = 'ALCOHOL_USE' | 'TOBACCO_USE' | 'OCCUPATION' | 'LIFESTYLE';

export type UsageStatus = 'CURRENT' | 'FORMER' | 'NEVER' | 'UNKNOWN';

// =============================================================================
// SOCIAL HISTORY OBSERVATION INTERFACE
// =============================================================================

export interface SocialHistoryObservation {
  id: number;
  patient: number;
  encounter: number | null;
  observation_type: ObservationType;
  observation_type_display: string;
  status: UsageStatus;
  status_display: string;
  value_text: string;
  effective_date: string;
  recorded_by: number | null;
  recorded_by_username: string | null;
  patient_name: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CREATE / UPDATE PAYLOADS
// =============================================================================

export interface SocialHistoryCreatePayload {
  observation_type: ObservationType;
  status: UsageStatus;
  value_text: string;
  effective_date: string;
  encounter?: number | null;
}

export interface SocialHistoryUpdatePayload {
  observation_type?: ObservationType;
  status?: UsageStatus;
  value_text?: string;
  effective_date?: string;
  encounter?: number | null;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

export const OBSERVATION_TYPE_OPTIONS: { value: ObservationType; label: string; icon: string }[] = [
  { value: 'ALCOHOL_USE', label: 'Alcohol use', icon: '🍺' },
  { value: 'TOBACCO_USE', label: 'Tobacco use', icon: '🚬' },
  { value: 'OCCUPATION', label: 'Occupation', icon: '💼' },
  { value: 'LIFESTYLE', label: 'Lifestyle', icon: '🏃' },
];

export const USAGE_STATUS_OPTIONS: { value: UsageStatus; label: string }[] = [
  { value: 'CURRENT', label: 'Current use' },
  { value: 'FORMER', label: 'Former use' },
  { value: 'NEVER', label: 'Never used' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

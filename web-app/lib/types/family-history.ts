/**
 * Family History type definitions.
 *
 * Structured family member history records (FHIR FamilyMemberHistory).
 * Maps to backend FamilyHistory model in encounters/models.py.
 */

export type FamilyRelationship =
  | 'FATHER'
  | 'MOTHER'
  | 'SIBLING'
  | 'GRANDPARENT'
  | 'CHILD'
  | 'UNCLE_AUNT'
  | 'COUSIN'
  | 'OTHER';

export interface FamilyHistory {
  id: number;
  patient: number;
  encounter: number | null;
  relationship: FamilyRelationship;
  relationship_display: string;
  condition_name: string;
  deceased: boolean;
  age_at_onset: string;
  notes: string;
  recorded_by: number | null;
  recorded_by_username: string | null;
  patient_name: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyHistoryCreatePayload {
  relationship: FamilyRelationship;
  condition_name: string;
  deceased?: boolean;
  age_at_onset?: string;
  notes?: string;
  encounter?: number | null;
}

export interface FamilyHistoryUpdatePayload {
  relationship?: FamilyRelationship;
  condition_name?: string;
  deceased?: boolean;
  age_at_onset?: string;
  notes?: string;
}

export const RELATIONSHIP_OPTIONS: { value: FamilyRelationship; label: string; icon: string }[] = [
  { value: 'FATHER', label: 'Father', icon: '👨' },
  { value: 'MOTHER', label: 'Mother', icon: '👩' },
  { value: 'SIBLING', label: 'Sibling', icon: '👫' },
  { value: 'GRANDPARENT', label: 'Grandparent', icon: '👴' },
  { value: 'CHILD', label: 'Child', icon: '👶' },
  { value: 'UNCLE_AUNT', label: 'Uncle/Aunt', icon: '🧑' },
  { value: 'COUSIN', label: 'Cousin', icon: '🧑' },
  { value: 'OTHER', label: 'Other', icon: '👤' },
];

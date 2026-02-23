/**
 * Allergy module type definitions.
 *
 * Structured allergy model for clinical decision support and drug-allergy checking.
 * Based on backend models at hmis/apps/patients/models.py (Allergy model)
 */

// =============================================================================
// ENUM TYPES
// =============================================================================

export type SubstanceType = 'medication' | 'food' | 'environmental' | 'biological' | 'other';

export type ReactionType =
  | 'anaphylaxis'
  | 'angioedema'
  | 'bronchospasm'
  | 'cardiac_arrhythmia'
  | 'diarrhea'
  | 'dyspnea'
  | 'hives'
  | 'hypotension'
  | 'itching'
  | 'nausea'
  | 'rash'
  | 'swelling'
  | 'vomiting'
  | 'other';

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';

export type Criticality = 'low' | 'high' | 'unable_to_assess';

export type AllergyStatus = 'active' | 'inactive' | 'resolved';

export type VerificationStatus =
  | 'unconfirmed'
  | 'presumed'
  | 'confirmed'
  | 'refuted'
  | 'entered_in_error';

// =============================================================================
// ALLERGY INTERFACE (Full Detail)
// =============================================================================

export interface Allergy {
  id: number;
  // Patient info (read-only)
  patient?: number | null;
  patient_mrn: string;
  patient_name: string;
  // Substance
  substance: string;
  substance_code?: string;
  substance_code_system?: string;
  substance_type: SubstanceType;
  substance_type_display: string;
  // Drug link
  drug: number | null;
  drug_name: string | null;
  // Reaction
  reaction_type: ReactionType;
  reaction_type_display: string;
  reaction_description?: string;
  severity: AllergySeverity;
  severity_display: string;
  criticality: Criticality;
  criticality_display: string;
  // Dates
  onset_date: string | null;
  last_occurrence: string | null;
  // Status
  status: AllergyStatus;
  status_display: string;
  verification_status: VerificationStatus;
  verification_status_display: string;
  // Computed
  is_high_risk: boolean;
  is_active: boolean;
  // Notes and source
  notes?: string;
  source_encounter: number | null;
  recorded_by: number | null;
  recorded_by_username: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ALLERGY LIST ITEM (Lightweight for listings)
// =============================================================================

export interface AllergyListItem {
  id: number;
  substance: string;
  substance_type: SubstanceType;
  reaction_type: ReactionType;
  severity: AllergySeverity;
  severity_display: string;
  status: AllergyStatus;
  status_display: string;
  is_high_risk: boolean;
  onset_date: string | null;
}

// =============================================================================
// LOOKUP RESULT
// =============================================================================

export interface AllergyLookupResult {
  substance: string;
  code: string;
  code_system: string;
  drug_id: number | null;
  type: string;
  display: string;
}

// =============================================================================
// DRUG INTERACTION CHECK
// =============================================================================

export interface DrugInteraction {
  allergy_id: number;
  substance: string;
  severity: AllergySeverity;
  severity_display: string;
  reaction_type: ReactionType;
  is_high_risk: boolean;
  drug_id?: number;
  drug_name?: string;
  warning: string;
}

export interface DrugInteractionCheck {
  patient_id: number;
  has_interactions: boolean;
  has_high_risk: boolean;
  interactions: DrugInteraction[];
}

// =============================================================================
// CREATE/UPDATE PAYLOADS
// =============================================================================

export interface AllergyCreatePayload {
  substance: string;
  substance_type?: SubstanceType;
  substance_code?: string;
  substance_code_system?: string;
  drug?: number;
  reaction_type?: ReactionType;
  reaction_description?: string;
  severity?: AllergySeverity;
  criticality?: Criticality;
  onset_date?: string;
  last_occurrence?: string;
  verification_status?: VerificationStatus;
  notes?: string;
  source_encounter?: number;
}

export interface AllergyUpdatePayload extends Partial<AllergyCreatePayload> {
  status?: AllergyStatus;
}

// =============================================================================
// DISPLAY OPTIONS (for dropdowns)
// =============================================================================

export const SUBSTANCE_TYPE_OPTIONS: Array<{ value: SubstanceType; label: string }> = [
  { value: 'medication', label: 'Medication' },
  { value: 'food', label: 'Food' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'biological', label: 'Biological' },
  { value: 'other', label: 'Other' },
];

export const REACTION_TYPE_OPTIONS: Array<{ value: ReactionType; label: string }> = [
  { value: 'anaphylaxis', label: 'Anaphylaxis' },
  { value: 'angioedema', label: 'Angioedema' },
  { value: 'bronchospasm', label: 'Bronchospasm' },
  { value: 'cardiac_arrhythmia', label: 'Cardiac Arrhythmia' },
  { value: 'diarrhea', label: 'Diarrhea' },
  { value: 'dyspnea', label: 'Dyspnea' },
  { value: 'hives', label: 'Hives/Urticaria' },
  { value: 'hypotension', label: 'Hypotension' },
  { value: 'itching', label: 'Itching/Pruritus' },
  { value: 'nausea', label: 'Nausea' },
  { value: 'rash', label: 'Rash' },
  { value: 'swelling', label: 'Swelling' },
  { value: 'vomiting', label: 'Vomiting' },
  { value: 'other', label: 'Other' },
];

export const SEVERITY_OPTIONS: Array<{ value: AllergySeverity; label: string }> = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'life_threatening', label: 'Life-Threatening' },
];

export const CRITICALITY_OPTIONS: Array<{ value: Criticality; label: string }> = [
  { value: 'low', label: 'Low Risk' },
  { value: 'high', label: 'High Risk' },
  { value: 'unable_to_assess', label: 'Unable to Assess' },
];

export const ALLERGY_STATUS_OPTIONS: Array<{ value: AllergyStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'resolved', label: 'Resolved' },
];

export const VERIFICATION_STATUS_OPTIONS: Array<{ value: VerificationStatus; label: string }> = [
  { value: 'unconfirmed', label: 'Unconfirmed' },
  { value: 'presumed', label: 'Presumed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'refuted', label: 'Refuted' },
  { value: 'entered_in_error', label: 'Entered in Error' },
];

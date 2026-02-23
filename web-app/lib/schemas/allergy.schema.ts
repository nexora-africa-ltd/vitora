/**
 * Zod schemas for Allergy API response validation
 *
 * Structured allergy model for clinical decision support and drug-allergy checking.
 * See lib/types/allergy.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const SubstanceTypeSchema = z.enum([
  'medication',
  'food',
  'environmental',
  'biological',
  'other',
]);

export const ReactionTypeSchema = z.enum([
  'anaphylaxis',
  'angioedema',
  'bronchospasm',
  'cardiac_arrhythmia',
  'diarrhea',
  'dyspnea',
  'hives',
  'hypotension',
  'itching',
  'nausea',
  'rash',
  'swelling',
  'vomiting',
  'other',
]);

export const SeveritySchema = z.enum(['mild', 'moderate', 'severe', 'life_threatening']);

export const CriticalitySchema = z.enum(['low', 'high', 'unable_to_assess']);

export const AllergyStatusSchema = z.enum(['active', 'inactive', 'resolved']);

export const VerificationStatusSchema = z.enum([
  'unconfirmed',
  'presumed',
  'confirmed',
  'refuted',
  'entered_in_error',
]);

// =============================================================================
// ALLERGY SCHEMA (Full Detail)
// =============================================================================

export const AllergySchema = z.object({
  id: z.number(),
  // Patient info
  patient: z.number().nullable().optional(),
  patient_mrn: z.string(),
  patient_name: z.string(),
  // Substance
  substance: z.string(),
  substance_code: z.string().optional().default(''),
  substance_code_system: z.string().optional().default(''),
  substance_type: SubstanceTypeSchema,
  substance_type_display: z.string(),
  // Drug link
  drug: z.number().nullable(),
  drug_name: z.string().nullable(),
  // Reaction
  reaction_type: ReactionTypeSchema,
  reaction_type_display: z.string(),
  reaction_description: z.string().optional().default(''),
  severity: SeveritySchema,
  severity_display: z.string(),
  criticality: CriticalitySchema,
  criticality_display: z.string(),
  // Dates
  onset_date: z.string().nullable(),
  last_occurrence: z.string().nullable(),
  // Status
  status: AllergyStatusSchema,
  status_display: z.string(),
  verification_status: VerificationStatusSchema,
  verification_status_display: z.string(),
  // Computed
  is_high_risk: z.boolean(),
  is_active: z.boolean(),
  // Notes and source
  notes: z.string().optional().default(''),
  source_encounter: z.number().nullable(),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// ALLERGY LIST SCHEMA (Lightweight for listings)
// =============================================================================

export const AllergyListSchema = z.object({
  id: z.number(),
  substance: z.string(),
  substance_type: SubstanceTypeSchema,
  reaction_type: ReactionTypeSchema,
  severity: SeveritySchema,
  severity_display: z.string(),
  status: AllergyStatusSchema,
  status_display: z.string(),
  is_high_risk: z.boolean(),
  onset_date: z.string().nullable(),
});

// =============================================================================
// SUBSTANCE LOOKUP SCHEMA
// =============================================================================

export const AllergyLookupResultSchema = z.object({
  substance: z.string(),
  code: z.string(),
  code_system: z.string(),
  drug_id: z.number().nullable(),
  type: z.string(),
  display: z.string(),
});

// =============================================================================
// DRUG INTERACTION CHECK SCHEMA
// =============================================================================

export const DrugInteractionSchema = z.object({
  allergy_id: z.number(),
  substance: z.string(),
  severity: SeveritySchema,
  severity_display: z.string(),
  reaction_type: ReactionTypeSchema,
  is_high_risk: z.boolean(),
  drug_id: z.number().optional(),
  drug_name: z.string().optional(),
  warning: z.string(),
});

export const DrugInteractionCheckSchema = z.object({
  patient_id: z.number(),
  has_interactions: z.boolean(),
  has_high_risk: z.boolean(),
  interactions: z.array(DrugInteractionSchema),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Allergy = z.infer<typeof AllergySchema>;
export type AllergyListItem = z.infer<typeof AllergyListSchema>;
export type SubstanceType = z.infer<typeof SubstanceTypeSchema>;
export type ReactionType = z.infer<typeof ReactionTypeSchema>;
export type AllergySeverity = z.infer<typeof SeveritySchema>;
export type AllergyStatus = z.infer<typeof AllergyStatusSchema>;
export type Criticality = z.infer<typeof CriticalitySchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type AllergyLookupResult = z.infer<typeof AllergyLookupResultSchema>;
export type DrugInteraction = z.infer<typeof DrugInteractionSchema>;
export type DrugInteractionCheck = z.infer<typeof DrugInteractionCheckSchema>;

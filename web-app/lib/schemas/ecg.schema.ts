/**
 * Zod schemas for ECG Interpreter API response validation.
 */

import { z } from 'zod';

// =============================================================================
// ECG Interpret
// =============================================================================

export const ECGFindingSchema = z.object({
  component: z.string(),
  value: z.string(),
  interpretation: z.string(),
  severity: z.enum(['normal', 'borderline', 'abnormal']),
});

export const ECGDifferentialSchema = z.object({
  condition: z.string(),
  probability: z.enum(['low', 'moderate', 'high']),
  supporting_evidence: z.array(z.string()),
  icd10: z.string(),
});

export const ECGInterpretResponseSchema = z.object({
  interpretation: z.string(),
  rhythm_diagnosis: z.string(),
  rate_category: z.enum(['bradycardia', 'normal', 'tachycardia']),
  findings: z.array(ECGFindingSchema),
  clinical_significance: z.string(),
  differentials: z.array(ECGDifferentialSchema),
  urgency: z.enum(['emergent', 'urgent', 'routine']),
  action_required: z.array(z.string()),
  sgarbossa_score: z.number().nullable().optional(),
  wellens_criteria: z.boolean().nullable().optional(),
  brugada_pattern: z.boolean().nullable().optional(),
  fhir_diagnostic_report: z.record(z.unknown()).nullable().optional(),
  loinc_codes: z.array(z.string()).optional().default([]),
  icd10_codes: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()).optional().default([]),
  disclaimer: z.string().optional().default(''),
  error: z.string().optional(),
});

// =============================================================================
// ECG Compare
// =============================================================================

export const ECGChangeSchema = z.object({
  component: z.string(),
  baseline_value: z.string(),
  current_value: z.string(),
  interpretation: z.string(),
  significance: z.enum(['insignificant', 'notable', 'critical']),
});

export const ECGCompareResponseSchema = z.object({
  changes: z.array(ECGChangeSchema),
  clinical_significance: z.string(),
  progression: z.enum(['improved', 'stable', 'worsened', 'new_findings']),
  action_required: z.array(z.string()),
  error: z.string().optional(),
});

// =============================================================================
// ECG Upload
// =============================================================================

export const ECGUploadResponseSchema = z.object({
  interpretation: ECGInterpretResponseSchema,
  source_format: z.enum(['image', 'dicom', 'muse_xml', 'hl7_aecg', 'scp_ecg']),
  extracted_parameters: z.record(z.unknown()),
  quality_score: z.number().nullable().optional(),
  warnings: z.array(z.string()).optional().default([]),
  error: z.string().optional(),
});

// =============================================================================
// CHA₂DS₂-VASc Score
// =============================================================================

export const CHA2DS2VAScResponseSchema = z.object({
  score: z.number(),
  max_score: z.number(),
  risk_category: z.string(),
  annual_stroke_risk_percent: z.number(),
  recommendation: z.string(),
  components: z.record(z.number()),
  anticoagulation_indicated: z.boolean(),
  sources: z.array(z.string()),
  error: z.string().optional(),
});

// =============================================================================
// HAS-BLED Score
// =============================================================================

export const HASBLEDResponseSchema = z.object({
  score: z.number(),
  max_score: z.number(),
  risk_category: z.string(),
  annual_bleed_risk_percent: z.number(),
  recommendation: z.string(),
  components: z.record(z.number()),
  sources: z.array(z.string()),
  error: z.string().optional(),
});

// =============================================================================
// ECG Patterns
// =============================================================================

export const ECGPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  criteria: z.string(),
  icd10: z.string(),
});

export const ECGPatternsResponseSchema = z.array(ECGPatternSchema);

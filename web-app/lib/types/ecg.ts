/**
 * ECG Interpreter TypeScript types.
 *
 * Types for the TibaBot ECG Interpreter proxy endpoints.
 */

// =============================================================================
// ECG Interpret
// =============================================================================

export type ECGRhythm = 'regular' | 'irregularly irregular' | 'regularly irregular';
export type ECGAxis = 'normal' | 'LAD' | 'RAD' | 'extreme';
export type ECGUrgency = 'emergent' | 'urgent' | 'routine';
export type ECGRateCategory = 'bradycardia' | 'normal' | 'tachycardia';
export type ECGVerbosity = 'concise' | 'standard' | 'detailed';
export type ECGFindingSeverity = 'normal' | 'borderline' | 'abnormal' | 'critical';
export type ECGDifferentialProbability = 'low' | 'moderate' | 'high';
export type ECGChangeSignificance = 'insignificant' | 'notable' | 'critical';
export type ECGProgression = 'improved' | 'stable' | 'worsened' | 'new_findings';

/** Request body for POST /api/ai/ecg/interpret/ */
export interface ECGInterpretRequest {
  heart_rate?: number | null;
  rhythm?: string | null;
  axis?: string | null;
  pr_interval?: number | null;
  qrs_duration?: number | null;
  qtc_interval?: number | null;
  p_wave?: string | null;
  st_segment?: string | null;
  t_wave?: string | null;
  q_waves?: string | null;
  bundle_branch?: string | null;
  raw_findings?: string | null;
  clinical_context?: string | null;
  medications?: string[];
  age?: number | null;
  sex?: 'male' | 'female' | null;
  include_fhir?: boolean;
  verbosity?: ECGVerbosity;
  provider_role?: string | null;
  facility_level?: string | null;
}

/** A single ECG finding */
export interface ECGFinding {
  component: string;
  value: string;
  interpretation: string;
  severity: ECGFindingSeverity;
}

/** A differential diagnosis from ECG interpretation */
export interface ECGDifferential {
  condition: string;
  probability: ECGDifferentialProbability;
  supporting_evidence: string[];
  icd10: string;
}

/** Response from POST /api/ai/ecg/interpret/ */
export interface ECGInterpretResponse {
  interpretation: string;
  rhythm_diagnosis: string;
  rate_category: ECGRateCategory;
  findings: ECGFinding[];
  clinical_significance: string;
  differentials: ECGDifferential[];
  urgency: ECGUrgency;
  action_required: string[];
  sgarbossa_score: number | null;
  wellens_criteria: boolean | null;
  brugada_pattern: boolean | null;
  fhir_diagnostic_report: Record<string, unknown> | null;
  loinc_codes: string[];
  icd10_codes: string[];
  confidence: number;
  sources: string[];
  disclaimer: string;
  error?: string;
}

// =============================================================================
// ECG Compare
// =============================================================================

/** ECG parameters for baseline or current recording */
export interface ECGParameters {
  heart_rate?: number | null;
  rhythm?: string | null;
  axis?: string | null;
  pr_interval?: number | null;
  qrs_duration?: number | null;
  qtc_interval?: number | null;
  p_wave?: string | null;
  st_segment?: string | null;
  t_wave?: string | null;
  q_waves?: string | null;
  bundle_branch?: string | null;
}

/** Request body for POST /api/ai/ecg/compare/ */
export interface ECGCompareRequest {
  baseline: ECGParameters;
  current: ECGParameters;
  interval_hours?: number | null;
  clinical_context?: string | null;
}

/** A single change detected between two ECGs */
export interface ECGChange {
  component: string;
  baseline_value: string;
  current_value: string;
  interpretation: string;
  significance: ECGChangeSignificance;
}

/** Response from POST /api/ai/ecg/compare/ */
export interface ECGCompareResponse {
  changes: ECGChange[];
  clinical_significance: string;
  progression: ECGProgression;
  action_required: string[];
  error?: string;
}

// =============================================================================
// ECG Upload
// =============================================================================

export type ECGSourceFormat = 'image' | 'dicom' | 'muse_xml' | 'hl7_aecg' | 'scp_ecg';

/** Response from POST /api/ai/ecg/upload/ */
export interface ECGUploadResponse {
  interpretation: ECGInterpretResponse;
  source_format: ECGSourceFormat;
  extracted_parameters: Record<string, unknown>;
  quality_score: number | null;
  warnings: string[];
  error?: string;
}

// =============================================================================
// ECG Report
// =============================================================================

/** Patient context for PDF report header */
export interface ECGReportPatientContext {
  name?: string;
  age?: number;
  sex?: string;
  id?: string;
}

/** Request body for POST /api/ai/ecg/report/ */
export interface ECGReportRequest {
  interpretation: ECGInterpretResponse;
  patient_context?: ECGReportPatientContext;
  facility_name?: string;
  provider_name?: string;
}

// =============================================================================
// CHA₂DS₂-VASc Score
// =============================================================================

/** Request body for POST /api/ai/ecg/scores/cha2ds2-vasc/ */
export interface CHA2DS2VAScRequest {
  age: number;
  sex: 'male' | 'female';
  congestive_heart_failure?: boolean;
  hypertension?: boolean;
  stroke_tia_thromboembolism?: boolean;
  vascular_disease?: boolean;
  diabetes?: boolean;
}

/** Response from POST /api/ai/ecg/scores/cha2ds2-vasc/ */
export interface CHA2DS2VAScResponse {
  score: number;
  max_score: number;
  risk_category: string;
  annual_stroke_risk_percent: number;
  recommendation: string;
  components: Record<string, number>;
  anticoagulation_indicated: boolean;
  sources: string[];
  error?: string;
}

// =============================================================================
// HAS-BLED Score
// =============================================================================

/** Request body for POST /api/ai/ecg/scores/has-bled/ */
export interface HASBLEDRequest {
  hypertension_uncontrolled?: boolean;
  renal_disease?: boolean;
  liver_disease?: boolean;
  stroke_history?: boolean;
  bleeding_history?: boolean;
  labile_inr?: boolean;
  age_over_65?: boolean;
  drugs_predisposing?: boolean;
  alcohol_excess?: boolean;
}

/** Response from POST /api/ai/ecg/scores/has-bled/ */
export interface HASBLEDResponse {
  score: number;
  max_score: number;
  risk_category: string;
  annual_bleed_risk_percent: number;
  recommendation: string;
  components: Record<string, number>;
  sources: string[];
  error?: string;
}

// =============================================================================
// ECG Patterns
// =============================================================================

/** A supported ECG pattern/diagnosis from the catalog */
export interface ECGPattern {
  id: string;
  name: string;
  category: string;
  criteria: string;
  icd10: string;
}

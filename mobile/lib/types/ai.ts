/**
 * AI / TibaBot types for the mobile app.
 *
 * Covers clinical assist (single-turn), AI status, lab interpretation,
 * ICD-10 auto-suggest, and feedback. Multi-turn chat sessions are
 * intentionally excluded — web-only.
 */

// ──────────────────── Status ────────────────────

export interface AIStatus {
  enabled: boolean;
  service_name: string;
  service_available: boolean;
  rag_initialized?: boolean;
  demo_mode?: boolean;
}

// ──────────────────── Clinical Assist ────────────────────

export interface AIPatientContext {
  patient_age: number;
  patient_sex: string;
  facility_level?: number;
  allergies?: string[];
  comorbidities?: string[];
  current_medications?: string[];
}

export interface AIEncounterContext {
  chief_complaint?: string;
  vitals?: {
    spo2?: number;
    pulse?: number;
    temperature?: number;
    rr?: number;
    map?: number;
  };
}

export type AIVerbosity = 'concise' | 'standard' | 'educational';

export interface AIClinicalAssistRequest {
  query: string;
  patient_context?: AIPatientContext;
  encounter_context?: AIEncounterContext;
  verbosity?: AIVerbosity;
}

export interface AIClinicalAssistResponse {
  response: string;
  references?: string[];
  error?: string | null;
}

// ──────────────────── ICD-10 Auto-Suggest ────────────────────

export interface AIICD10Suggestion {
  code: string;
  description: string;
  confidence: number;
}

export interface AIICD10SuggestResponse {
  suggestions: AIICD10Suggestion[];
  clinical_text_preview?: string;
  error?: string;
}

// ──────────────────── Lab Interpretation ────────────────────

export interface AILabResultItem {
  test_name: string;
  value: number;
  unit: string;
  collection_time?: string;
  reference_low?: number;
  reference_high?: number;
}

export interface AILabInterpretRequest {
  lab_results: AILabResultItem[];
  patient_age: number;
  patient_sex: string;
  clinical_context?: string;
}

export interface AILabInterpretFinding {
  test_name: string;
  interpretation: string;
  severity: 'normal' | 'mild' | 'moderate' | 'severe' | 'critical';
  clinical_significance: string;
}

export interface AILabInterpretResponse {
  summary: string;
  findings: AILabInterpretFinding[];
  recommendations?: string[];
  error?: string | null;
}

// ──────────────────── Feedback ────────────────────

export type AIFeedbackDirection = 'up' | 'down';

export interface AIFeedbackRequest {
  message_id: string;
  conversation_id?: string;
  feedback: AIFeedbackDirection;
  user_query?: string;
  bot_response?: string;
  service_type?: string;
}

export interface AIFeedbackResponse {
  status: string;
  message: string;
  feedback_id?: string;
}

/**
 * AI/TibaBot TypeScript types.
 *
 * Types for the AI proxy endpoints that connect to TibaBot services.
 */

/** A single ICD-10 code suggestion from TibaBot AI */
export interface AIICD10Suggestion {
  /** ICD-10 code (e.g., "B50.9") */
  code: string;
  /** Human-readable description */
  description: string;
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
}

/** Response from POST /api/ai/icd10-suggest/ */
export interface AIICD10SuggestResponse {
  suggestions: AIICD10Suggestion[];
  /** Sanitized preview of the input text */
  clinical_text_preview?: string;
  /** Error message when TibaBot is unavailable (graceful degradation) */
  error?: string;
}

/** AI feature status from GET /api/ai/status/ */
export interface AIStatus {
  enabled: boolean;
  service_name: string;
  service_available: boolean;
}

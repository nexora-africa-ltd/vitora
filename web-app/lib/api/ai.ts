/**
 * AI/TibaBot API client.
 *
 * All TibaBot calls are proxied through the Django backend.
 * The frontend never calls TibaBot directly.
 */

import { apiClient } from '@/lib/api/client';
import {
  AIICD10SuggestResponseSchema,
  AIStatusSchema,
  AIClinicalChatResponseSchema,
  AIClinicalAssistResponseSchema,
  AIChatSessionListResponseSchema,
  AIChatSessionDetailResponseSchema,
  AIConditionPredictResponseSchema,
  AIICUPredictResponseSchema,
  AIFeedbackResponseSchema,
  AIFeedbackStatsSchema,
  AISuggestionAuditResponseSchema,
  AIAutopopulateResponseSchema,
  AILabInterpretResponseSchema,
  AIDischargeAssessResponseSchema,
  AIDischargeConditionsResponseSchema,
  AICarePlanResponseSchema,
  AICarePlanConditionsResponseSchema,
  AIClerkingAutocompleteResponseSchema,
  AIClerkingStructureResponseSchema,
  AICDSEvaluateResponseSchema,
} from '@/lib/schemas/ai.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  AIICD10SuggestResponse,
  AIStatus,
  AIClinicalChatRequest,
  AIClinicalChatResponse,
  AIClinicalAssistRequest,
  AIClinicalAssistResponse,
  AIChatSessionListResponse,
  AIChatSessionDetailResponse,
  AIConditionPredictRequest,
  AIConditionPredictResponse,
  AIICUPredictRequest,
  AIICUPredictResponse,
  AIFeedbackRequest,
  AIFeedbackResponse,
  AIFeedbackStats,
  AISuggestionAuditRequest,
  AISuggestionAuditResponse,
  AIAutopopulateRequest,
  AIAutopopulateResponse,
  AILabInterpretRequest,
  AILabInterpretResponse,
  AIDischargeAssessRequest,
  AIDischargeAssessResponse,
  AIDischargeConditionsResponse,
  AICarePlanGenerateRequest,
  AICarePlanResponse,
  AICarePlanConditionsResponse,
  AIClerkingAutocompleteRequest,
  AIClerkingAutocompleteResponse,
  AIClerkingStructureRequest,
  AIClerkingStructureResponse,
  AICDSEvaluateRequest,
  AICDSEvaluateResponse,
} from '@/lib/types/ai';

export const aiApi = {
  // ===========================================================================
  // Phase 1 — ICD-10
  // ===========================================================================

  /**
   * Get ICD-10 code suggestions for clinical text.
   *
   * Sends clinical text to the Django backend, which proxies to TibaBot.
   * Returns ranked ICD-10 codes with confidence scores.
   *
   * Advisory only — clinician must confirm/reject each suggestion.
   *
   * @param clinicalText - Free-text clinical description
   * @returns Ranked ICD-10 suggestions with confidence scores
   */
  suggestICD10: async (clinicalText: string): Promise<AIICD10SuggestResponse> => {
    const response = await apiClient.post('/api/ai/icd10-suggest/', {
      clinical_text: clinicalText,
    });
    return parseResponse(AIICD10SuggestResponseSchema, response.data, {
      context: 'aiApi.suggestICD10',
    });
  },

  /**
   * Check AI feature status.
   *
   * Returns whether AI features are enabled and if TibaBot is reachable.
   * Used to decide whether to render AI components in the UI.
   */
  getStatus: async (): Promise<AIStatus> => {
    const response = await apiClient.get('/api/ai/status/');
    return parseResponse(AIStatusSchema, response.data, {
      context: 'aiApi.getStatus',
    });
  },

  // ===========================================================================
  // Phase 2 — Clinical Chat & Assist
  // ===========================================================================

  /**
   * Send a message in a clinical chat session.
   *
   * If session_id is provided, continues an existing session.
   * Otherwise, creates a new session.
   *
   * @param data - Chat request with message and optional session_id
   * @returns Chat response with session_id and assistant message
   */
  clinicalChat: async (data: AIClinicalChatRequest): Promise<AIClinicalChatResponse> => {
    const response = await apiClient.post('/api/ai/clinical/chat/', data);
    return parseResponse(AIClinicalChatResponseSchema, response.data, {
      context: 'aiApi.clinicalChat',
    });
  },

  /**
   * Get encounter-aware clinical assistance.
   *
   * Sends patient/encounter context (no PII) for contextual clinical reasoning.
   * Used when clinician clicks "Ask about this patient" on an encounter page.
   *
   * @param data - Assist request with query, patient_context, encounter_context
   * @returns Clinical assist response with reasoning and references
   */
  clinicalAssist: async (data: AIClinicalAssistRequest): Promise<AIClinicalAssistResponse> => {
    const response = await apiClient.post('/api/ai/clinical/assist/', data);
    return parseResponse(AIClinicalAssistResponseSchema, response.data, {
      context: 'aiApi.clinicalAssist',
    });
  },

  /**
   * List all chat sessions for the current user.
   *
   * Returns session summaries ordered by most recent update.
   */
  listChatSessions: async (): Promise<AIChatSessionListResponse> => {
    const response = await apiClient.get('/api/ai/clinical/chat/sessions/');
    return parseResponse(AIChatSessionListResponseSchema, response.data, {
      context: 'aiApi.listChatSessions',
    });
  },

  /**
   * Get a specific chat session with its full message history.
   *
   * @param sessionId - Session UUID
   * @returns Session detail with all messages
   */
  getChatSession: async (sessionId: string): Promise<AIChatSessionDetailResponse> => {
    const response = await apiClient.get(`/api/ai/clinical/chat/session/${sessionId}/`);
    return parseResponse(AIChatSessionDetailResponseSchema, response.data, {
      context: 'aiApi.getChatSession',
    });
  },

  /**
   * Delete a chat session and all its messages.
   *
   * @param sessionId - Session UUID
   */
  deleteChatSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/api/ai/clinical/chat/session/${sessionId}/`);
  },

  // ===========================================================================
  // Phase 3 — Condition Predictor
  // ===========================================================================

  /**
   * Predict probable conditions from patient features during triage.
   *
   * Sends patient demographics, vitals, chief complaint, and clinical
   * assessment data to TibaBot for ML-based risk assessment.
   * Advisory only — clinician must review and confirm.
   *
   * @param data - Patient features (age, gender, vitals, complaint, etc.)
   * @returns Predicted condition with confidence, risk factors, and differentials
   */
  predictCondition: async (data: AIConditionPredictRequest): Promise<AIConditionPredictResponse> => {
    const response = await apiClient.post('/api/ai/predict/condition/', data);
    return parseResponse(AIConditionPredictResponseSchema, response.data, {
      context: 'aiApi.predictCondition',
    });
  },

  // ===========================================================================
  // Phase 4 — ICU Predictor
  // ===========================================================================

  /**
   * Predict ICU admission risk for an admitted patient.
   *
   * Sends patient clinical data (vitals, labs, clinical context) to the
   * backend AI proxy for SOFA/qSOFA scoring and ICU risk assessment.
   * Advisory only — clinician must review and confirm.
   *
   * Supports two prediction types:
   * - "predict": ICU admission risk with SOFA/qSOFA scores
   * - "risk-stratify": Sepsis/AKI/deterioration composite risk scores
   *
   * @param data - Patient data (age, gender, vitals, labs, clinical context)
   * @returns ICU risk assessment with SOFA/qSOFA, alerts, escalation
   */
  predictICU: async (data: AIICUPredictRequest): Promise<AIICUPredictResponse> => {
    const response = await apiClient.post('/api/ai/predict/icu/', data);
    return parseResponse(AIICUPredictResponseSchema, response.data, {
      context: 'aiApi.predictICU',
    });
  },

  // ===========================================================================
  // Phase 3 — Feedback
  // ===========================================================================

  /**
   * Submit thumbs-up/down feedback on a TibaBot response.
   *
   * @param data - Feedback payload with message_id and "up" or "down"
   * @returns Acknowledgement with feedback_id
   */
  submitFeedback: async (data: AIFeedbackRequest): Promise<AIFeedbackResponse> => {
    const response = await apiClient.post('/api/ai/feedback/', data);
    return parseResponse(AIFeedbackResponseSchema, response.data, {
      context: 'aiApi.submitFeedback',
    });
  },

  /**
   * Get aggregate feedback statistics (admin dashboard).
   *
   * @returns Counts of thumbs up/down and recent negatives
   */
  getFeedbackStats: async (): Promise<AIFeedbackStats> => {
    const response = await apiClient.get('/api/ai/feedback/stats/');
    return parseResponse(AIFeedbackStatsSchema, response.data, {
      context: 'aiApi.getFeedbackStats',
    });
  },

  /**
   * Record an accepted or applied AI suggestion for accountability.
   */
  auditSuggestionAction: async (data: AISuggestionAuditRequest): Promise<AISuggestionAuditResponse> => {
    const response = await apiClient.post('/api/ai/suggestion-audit/', data);
    return parseResponse(AISuggestionAuditResponseSchema, response.data, {
      context: 'aiApi.auditSuggestionAction',
    });
  },

  // ===========================================================================
  // Phase 4a — Smart Autopopulate
  // ===========================================================================

  /**
   * Get AI-generated field suggestions for an encounter form.
   *
   * Sends encounter context (chief complaint, vitals, patient info) and
   * returns structured field suggestions. All suggestions require explicit
   * user confirmation before being applied.
   *
   * Gated behind both TIBABOT_ENABLED and smart_autopopulate feature flag.
   *
   * @param data - Encounter context for autopopulation
   * @returns Suggested fields and ICD-10 suggestions
   */
  autopopulate: async (data: AIAutopopulateRequest): Promise<AIAutopopulateResponse> => {
    const response = await apiClient.post('/api/ai/autopopulate/', data);
    return parseResponse(AIAutopopulateResponseSchema, response.data, {
      context: 'aiApi.autopopulate',
    });
  },

  // ===========================================================================
  // Phase 5 — Lab Assist
  // ===========================================================================

  /**
   * Interpret lab results with reference ranges and pattern detection.
   *
   * Sends lab results with patient demographics to TibaBot for interpretation.
   * Returns flagged abnormals, detected patterns, and follow-up suggestions.
   * Falls back to local reference range checks when TibaBot is unavailable.
   *
   * @param data - Patient info and lab results
   * @returns Flagged results, patterns, and interpretation summary
   */
  interpretLab: async (data: AILabInterpretRequest): Promise<AILabInterpretResponse> => {
    const response = await apiClient.post('/api/ai/lab/interpret/', data);
    return parseResponse(AILabInterpretResponseSchema, response.data, {
      context: 'aiApi.interpretLab',
    });
  },

  // ===========================================================================
  // Phase 5 — Discharge Readiness
  // ===========================================================================

  /**
   * Assess discharge readiness for an admitted patient.
   *
   * Evaluates clinical, functional, and social criteria against
   * condition-specific checklists. Includes Kenya-specific criteria
   * (NHIF/SHA coverage, CHW referral).
   *
   * @param data - Patient status, vitals history, and social criteria
   * @returns Readiness score, criteria checklist, and recommendations
   */
  assessDischarge: async (data: AIDischargeAssessRequest): Promise<AIDischargeAssessResponse> => {
    const response = await apiClient.post('/api/ai/discharge/assess/', data);
    return parseResponse(AIDischargeAssessResponseSchema, response.data, {
      context: 'aiApi.assessDischarge',
    });
  },

  /**
   * List supported conditions for discharge assessment.
   *
   * Returns the list of conditions that have specific discharge criteria
   * defined. Static data — cacheable.
   */
  listDischargeConditions: async (): Promise<AIDischargeConditionsResponse> => {
    const response = await apiClient.get('/api/ai/discharge/conditions/');
    return parseResponse(AIDischargeConditionsResponseSchema, response.data, {
      context: 'aiApi.listDischargeConditions',
    });
  },

  // ===========================================================================
  // Phase 5 — Care Plan Generator
  // ===========================================================================

  /**
   * Generate a structured care plan for a diagnosis.
   *
   * Creates evidence-based care plans with goals, interventions, and
   * discharge criteria. Includes KEML facility-level medication checks
   * and CDS safety validation.
   *
   * @param data - Diagnosis, patient info, and clinical context
   * @returns Structured care plan with goals, interventions, and follow-up
   */
  generateCarePlan: async (data: AICarePlanGenerateRequest): Promise<AICarePlanResponse> => {
    const response = await apiClient.post('/api/ai/care-plan/generate/', data);
    return parseResponse(AICarePlanResponseSchema, response.data, {
      context: 'aiApi.generateCarePlan',
    });
  },

  /**
   * Generate a care plan as a FHIR R4 CarePlan resource.
   *
   * Same input as generateCarePlan but returns HL7 FHIR R4 output
   * suitable for EMR interoperability.
   *
   * @param data - Same as generateCarePlan
   * @returns FHIR R4 CarePlan resource JSON
   */
  generateCarePlanFHIR: async (data: AICarePlanGenerateRequest): Promise<Record<string, unknown>> => {
    const response = await apiClient.post('/api/ai/care-plan/generate/fhir/', data);
    return response.data as Record<string, unknown>;
  },

  /**
   * List conditions with care plan templates available.
   *
   * Returns condition keys and names for the care plan generator dropdown.
   * Static data — cacheable.
   */
  listCarePlanConditions: async (): Promise<AICarePlanConditionsResponse> => {
    const response = await apiClient.get('/api/ai/care-plan/conditions/');
    return parseResponse(AICarePlanConditionsResponseSchema, response.data, {
      context: 'aiApi.listCarePlanConditions',
    });
  },

  // ===========================================================================
  // Phase 5 — Clerking Assist
  // ===========================================================================

  /**
   * Get context-aware autocomplete suggestions for clinical text fields.
   *
   * Sends the current text and field name for AI-powered completion suggestions.
   * Use with debounced input for real-time autocomplete in encounter forms.
   *
   * @param data - Current text, field name, and optional patient context
   * @returns Ranked autocomplete suggestions with confidence
   */
  clerkingAutocomplete: async (data: AIClerkingAutocompleteRequest): Promise<AIClerkingAutocompleteResponse> => {
    const response = await apiClient.post('/api/ai/clerking/autocomplete/', data);
    return parseResponse(AIClerkingAutocompleteResponseSchema, response.data, {
      context: 'aiApi.clerkingAutocomplete',
    });
  },

  /**
   * Convert free-text clinical notes to structured SOAP/SBAR format.
   *
   * Parses narrative clinical text and organizes it into standard sections.
   * Useful for structuring dictated or free-form encounter notes.
   *
   * @param data - Free-text note and target format (SOAP or SBAR)
   * @returns Structured note with named sections
   */
  clerkingStructure: async (data: AIClerkingStructureRequest): Promise<AIClerkingStructureResponse> => {
    const response = await apiClient.post('/api/ai/clerking/structure/', data);
    return parseResponse(AIClerkingStructureResponseSchema, response.data, {
      context: 'aiApi.clerkingStructure',
    });
  },

  // ===========================================================================
  // Phase 5 — Enhanced CDS Evaluation
  // ===========================================================================

  /**
   * Evaluate enhanced CDS rules via TibaBot.
   *
   * Supplements the local CDS engine with TibaBot-powered evaluation
   * including drug-drug interactions, contraindications, protocol adherence,
   * KEML formulary compliance, and dosing checks.
   *
   * @param data - Medications, diagnoses, labs, patient demographics
   * @returns Alerts, recommendations, and evaluation stats
   */
  evaluateCDS: async (data: AICDSEvaluateRequest): Promise<AICDSEvaluateResponse> => {
    const response = await apiClient.post('/api/ai/cds/evaluate/', data);
    return parseResponse(AICDSEvaluateResponseSchema, response.data, {
      context: 'aiApi.evaluateCDS',
    });
  },
};

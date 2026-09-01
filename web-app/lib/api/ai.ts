/**
 * AI/TibaBot API client.
 *
 * All TibaBot calls are proxied through the Django backend.
 * The frontend never calls TibaBot directly.
 */

import {
  apiClient,
  getActiveFacilityId,
  getActiveOrganizationId,
  getApiBaseUrl,
} from '@/lib/api/client';
import { tokenStorage } from '@/lib/auth/storage';
import { isDesktop } from '@/lib/desktop';
import {
  AIICD10SuggestResponseSchema,
  AIStatusSchema,
  AIClinicalChatResponseSchema,
  AIClinicalAssistResponseSchema,
  AIChatSessionListResponseSchema,
  AIChatSessionDetailResponseSchema,
  AIConditionPredictResponseSchema,
  AIICUPredictRequestSchema,
  AIICUQSOFALiteRequestSchema,
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
  AIClinicalDocumentResponseSchema,
  AICDSEvaluateResponseSchema,
  AISurgicalChecklistSessionResponseSchema,
  AISurgicalPostOpCarePlanResponseSchema,
  AISurgicalPreOpAssessResponseSchema,
  AISurgicalProcedureTemplateSchema,
  AISurgicalProcedureListResponseSchema,
  StoredCarePlanResultSchema,
  StoredCDSResultSchema,
  StoredLabInterpretResultSchema,
  StoredDischargeResultSchema,
  StoredICURiskResultSchema,
  StoredSurgicalChecklistSessionResultSchema,
  StoredSurgicalPostOpCarePlanResultSchema,
  StoredSurgicalPreOpAssessResultSchema,
  AIInvestigationSuggestResponseSchema,
  StoredInvestigationSuggestResultSchema,
  AIAdvisoryOrderLinkSchema,
  AIAdvisoryBulkSeedResponseSchema,
  AIAdvisoryHasOrdersResponseSchema,
  AIInsightsResponseSchema,
  AIEGFRCalculateResponseSchema,
  StoredEGFRResultSchema,
  ProactiveInsightsResponseSchema,
  TibaBotWebhookListResponseSchema,
  TibaBotWebhookDeliveryListResponseSchema,
  FacilityKBInfoResponseSchema,
  FacilityKBSearchResponseSchema,
  FacilityKBUploadResponseSchema,
  FacilityKBDocumentDeleteResponseSchema,
} from '@/lib/schemas/ai.schema';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
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
  AIICUQSOFALiteRequest,
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
  AIClinicalDocumentRequest,
  AIClinicalDocumentResponse,
  AICDSEvaluateRequest,
  AICDSEvaluateResponse,
  AISurgicalChecklistAdvanceRequest,
  AISurgicalChecklistSessionResponse,
  AISurgicalChecklistStartRequest,
  AISurgicalPostOpCarePlanRequest,
  AISurgicalPostOpCarePlanResponse,
  AISurgicalPreOpAssessRequest,
  AISurgicalPreOpAssessResponse,
  AISurgicalProcedureListResponse,
  AISurgicalProcedureTemplate,
  StoredCarePlanResult,
  StoredCDSResult,
  StoredLabInterpretResult,
  StoredDischargeResult,
  StoredICURiskResult,
  StoredSurgicalChecklistSessionResult,
  StoredSurgicalPostOpCarePlanResult,
  StoredSurgicalPreOpAssessResult,
  AIInvestigationSuggestRequest,
  AIInvestigationSuggestResponse,
  StoredInvestigationSuggestResult,
  AIAdvisoryOrderLink,
  AIAdvisoryBulkSeedRequest,
  AIAdvisoryBulkSeedResponse,
  AIAdvisoryOrderLinkActionRequest,
  AIAdvisoryHasOrdersResponse,
  AIInsightsResponse,
  AIEGFRCalculateRequest,
  AIEGFRCalculateResponse,
  StoredEGFRResult,
  ProactiveInsightsRequest,
  ProactiveInsightsResponse,
  TibaBotWebhookListResponse,
  TibaBotWebhookRegisterRequest,
  TibaBotWebhookUpdateRequest,
  TibaBotWebhookDeliveryListResponse,
  FacilityKBInfoResponse,
  FacilityKBSearchResponse,
  FacilityKBUploadResponse,
  FacilityKBDocumentDeleteResponse,
} from '@/lib/types/ai';

export interface AIClinicalChatStreamHandlers {
  onSession?: (sessionId: string) => void;
  onChunk?: (chunk: string) => void;
  onDone?: (response: AIClinicalChatResponse) => void;
  onError?: (errorMessage: string) => void;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

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
   * Stream a clinical chat response over SSE.
   *
   * Sends the same payload as clinicalChat, plus `stream: true`, and parses
   * chunk/done/error events from the backend SSE proxy.
   */
  clinicalChatStream: async (
    data: AIClinicalChatRequest,
    handlers: AIClinicalChatStreamHandlers = {}
  ): Promise<AIClinicalChatResponse> => {
    const endpoint = '/api/ai/clinical/chat/';
    const baseUrl = getApiBaseUrl().replace(/\/$/, '');
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const csrfToken = readCookie('csrftoken');
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }

    const activeFacilityId = getActiveFacilityId();
    if (activeFacilityId != null) {
      headers['X-Facility-Id'] = String(activeFacilityId);
    }

    const activeOrganizationId = getActiveOrganizationId();
    if (activeOrganizationId != null) {
      headers['X-Organization-Id'] = String(activeOrganizationId);
    }

    if (isDesktop()) {
      const accessToken = tokenStorage.getAccessToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      headers['X-Vitora-Client'] = 'desktop/0.1.0';
    }

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ ...data, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`Stream request failed (${response.status})`);
    }

    if (!response.body) {
      throw new Error('No stream body returned from server');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: AIClinicalChatResponse | null = null;

    const processEvent = (rawEvent: string) => {
      if (!rawEvent.trim()) return;

      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of rawEvent.split(/\r?\n/)) {
        if (!line) continue;
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim() || 'message';
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart());
        }
      }

      if (dataLines.length === 0) return;

      const payloadText = dataLines.join('\n');
      let payload: unknown = payloadText;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        // Keep plain text payload.
      }

      if (typeof payload === 'object' && payload !== null) {
        const streamPayload = payload as Record<string, unknown>;
        const payloadType = typeof streamPayload.type === 'string' ? streamPayload.type : '';

        if (payloadType === 'session' && typeof streamPayload.session_id === 'string') {
          handlers.onSession?.(streamPayload.session_id);
          return;
        }

        if (payloadType === 'chunk' && typeof streamPayload.content === 'string') {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[TibaBot stream chunk]', {
              session_id: streamPayload.session_id,
              length: streamPayload.content.length,
            });
          }
          handlers.onChunk?.(streamPayload.content);
          return;
        }

        if (payloadType === 'error') {
          handlers.onError?.(
            typeof streamPayload.error === 'string' ? streamPayload.error : 'AI service error.'
          );
          return;
        }

        if (payloadType === 'done') {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[TibaBot stream]', {
              stream_mode:
                typeof streamPayload.stream_mode === 'string'
                  ? streamPayload.stream_mode
                  : 'unknown',
              session_id: streamPayload.session_id,
            });
          }

          const donePayload = { ...streamPayload };
          delete donePayload.type;
          finalResponse = parseResponse(AIClinicalChatResponseSchema, donePayload, {
            context: 'aiApi.clinicalChatStream',
          });
          handlers.onDone?.(finalResponse);
          return;
        }
      }

      if (eventName === 'token' && typeof payload === 'string') {
        handlers.onChunk?.(payload);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const rawEvent of events) {
        processEvent(rawEvent);
      }
    }

    if (buffer.trim()) {
      processEvent(buffer);
    }

    if (finalResponse) {
      return finalResponse;
    }

    throw new Error('Stream ended before final response was emitted');
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
  predictCondition: async (
    data: AIConditionPredictRequest
  ): Promise<AIConditionPredictResponse> => {
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
    const requestData = parseResponse(AIICUPredictRequestSchema, data, {
      context: 'aiApi.predictICU.request',
    });
    const response = await apiClient.post('/api/ai/predict/icu/', requestData);
    return parseResponse(AIICUPredictResponseSchema, response.data, {
      context: 'aiApi.predictICU',
    });
  },

  /**
   * Run qSOFA-lite from minimal triage bedside inputs.
   */
  predictICUQSOFALite: async (data: AIICUQSOFALiteRequest): Promise<AIICUPredictResponse> => {
    const requestData = parseResponse(AIICUQSOFALiteRequestSchema, data, {
      context: 'aiApi.predictICUQSOFALite.request',
    });
    const response = await apiClient.post('/api/ai/predict/icu/qsofa-lite/', requestData);
    return parseResponse(AIICUPredictResponseSchema, response.data, {
      context: 'aiApi.predictICUQSOFALite',
    });
  },

  /**
   * Fetch the latest verified lab values relevant to ICU risk scoring
   * for a given admission. Returns a flat object of numeric values
   * (wbc, platelets, creatinine, bilirubin, lactate, pao2_fio2_ratio).
   */
  getICULabs: async (admissionId: number): Promise<Record<string, number>> => {
    const response = await apiClient.get('/api/ai/predict/icu/labs/', {
      params: { admission_id: admissionId },
    });
    return parseResponse(z.record(z.number()), response.data, {
      context: 'aiApi.getICULabs',
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
  auditSuggestionAction: async (
    data: AISuggestionAuditRequest
  ): Promise<AISuggestionAuditResponse> => {
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
  // eGFR Calculator
  // ===========================================================================

  /**
   * Calculate eGFR with CKD staging and dose adjustment guidance.
   *
   * Uses CKD-EPI 2021 (race-free) and Cockcroft-Gault equations.
   * Returns CKD stage, dose adjustment band, and clinical flags.
   *
   * @param data - Creatinine, demographics, optional weight
   * @returns CKD staging, dose band, flags, and interpretation
   */
  calculateEGFR: async (data: AIEGFRCalculateRequest): Promise<AIEGFRCalculateResponse> => {
    const response = await apiClient.post('/api/ai/egfr/calculate/', data);
    return parseResponse(AIEGFRCalculateResponseSchema, response.data, {
      context: 'aiApi.calculateEGFR',
    });
  },

  /**
   * Get stored eGFR results for a patient or encounter.
   */
  getStoredEGFRResults: async (params: {
    patient_id?: number;
    encounter_id?: number;
  }): Promise<StoredEGFRResult[]> => {
    const response = await apiClient.get('/api/ai/results/egfr/', { params });
    return parseResponse(StoredEGFRResultSchema.array(), response.data, {
      context: 'aiApi.getStoredEGFRResults',
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
  generateCarePlanFHIR: async (
    data: AICarePlanGenerateRequest
  ): Promise<Record<string, unknown>> => {
    const response = await apiClient.post('/api/ai/care-plan/generate/fhir/', data);
    return parseResponse(z.record(z.unknown()), response.data, {
      context: 'aiApi.generateCarePlanFHIR',
    });
  },

  /**
   * Delete a stored care plan result.
   */
  deleteStoredCarePlan: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/api/ai/results/care-plans/${id}/`);
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
  clerkingAutocomplete: async (
    data: AIClerkingAutocompleteRequest
  ): Promise<AIClerkingAutocompleteResponse> => {
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
  clerkingStructure: async (
    data: AIClerkingStructureRequest
  ): Promise<AIClerkingStructureResponse> => {
    const response = await apiClient.post('/api/ai/clerking/structure/', data);
    return parseResponse(AIClerkingStructureResponseSchema, response.data, {
      context: 'aiApi.clerkingStructure',
    });
  },

  // ===========================================================================
  // Phase 6 — Clinical Document Generation
  // ===========================================================================

  /**
   * Generate a structured clinical document using TibaBot LLM.
   *
   * Supports discharge summaries, SOAP notes, progress notes,
   * referral letters, and clerking notes with structured patient,
   * admission, and encounter context.
   *
   * @param data - Document type, patient/admission/encounter context, output format
   * @returns Generated document with sections, ICD-10 suggestions, citations
   */
  generateClinicalDocument: async (
    data: AIClinicalDocumentRequest
  ): Promise<AIClinicalDocumentResponse> => {
    const response = await apiClient.post('/api/ai/clinical/document/', data);
    return parseResponse(AIClinicalDocumentResponseSchema, response.data, {
      context: 'aiApi.generateClinicalDocument',
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

  // ===========================================================================
  // Phase 7 — Surgical Assistant
  // ===========================================================================

  assessSurgicalPreOp: async (
    data: AISurgicalPreOpAssessRequest
  ): Promise<AISurgicalPreOpAssessResponse> => {
    const response = await apiClient.post('/api/ai/surgical/pre-op/assess/', data);
    return parseResponse(AISurgicalPreOpAssessResponseSchema, response.data, {
      context: 'aiApi.assessSurgicalPreOp',
    });
  },

  startSurgicalChecklist: async (
    data: AISurgicalChecklistStartRequest
  ): Promise<AISurgicalChecklistSessionResponse> => {
    const response = await apiClient.post('/api/ai/surgical/checklist/start/', data);
    return parseResponse(AISurgicalChecklistSessionResponseSchema, response.data, {
      context: 'aiApi.startSurgicalChecklist',
    });
  },

  advanceSurgicalChecklist: async (
    sessionId: string,
    data: AISurgicalChecklistAdvanceRequest
  ): Promise<AISurgicalChecklistSessionResponse> => {
    const response = await apiClient.post(`/api/ai/surgical/checklist/${sessionId}/advance/`, data);
    return parseResponse(AISurgicalChecklistSessionResponseSchema, response.data, {
      context: 'aiApi.advanceSurgicalChecklist',
    });
  },

  getSurgicalChecklistStatus: async (
    sessionId: string
  ): Promise<AISurgicalChecklistSessionResponse> => {
    const response = await apiClient.get(`/api/ai/surgical/checklist/${sessionId}/status/`);
    return parseResponse(AISurgicalChecklistSessionResponseSchema, response.data, {
      context: 'aiApi.getSurgicalChecklistStatus',
    });
  },

  generateSurgicalPostOpCarePlan: async (
    data: AISurgicalPostOpCarePlanRequest
  ): Promise<AISurgicalPostOpCarePlanResponse> => {
    const response = await apiClient.post('/api/ai/surgical/post-op/care-plan/', data);
    return parseResponse(AISurgicalPostOpCarePlanResponseSchema, response.data, {
      context: 'aiApi.generateSurgicalPostOpCarePlan',
    });
  },

  listSurgicalProcedures: async (): Promise<AISurgicalProcedureListResponse> => {
    const response = await apiClient.get('/api/ai/surgical/procedures/');
    return parseResponse(AISurgicalProcedureListResponseSchema, response.data, {
      context: 'aiApi.listSurgicalProcedures',
    });
  },

  getSurgicalProcedure: async (procedureKey: string): Promise<AISurgicalProcedureTemplate> => {
    const response = await apiClient.get(`/api/ai/surgical/procedures/${procedureKey}/`);
    return parseResponse(AISurgicalProcedureTemplateSchema, response.data, {
      context: 'aiApi.getSurgicalProcedure',
    });
  },

  // ===========================================================================
  // Stored AI Results — retrieval
  // ===========================================================================

  getStoredCarePlans: async (params?: {
    encounter_id?: number;
    admission_id?: number;
  }): Promise<StoredCarePlanResult[]> => {
    const response = await apiClient.get('/api/ai/results/care-plans/', { params });
    return parseResponse(StoredCarePlanResultSchema.array(), response.data, {
      context: 'aiApi.getStoredCarePlans',
    });
  },

  getStoredCDSResults: async (params?: { encounter_id?: number }): Promise<StoredCDSResult[]> => {
    const response = await apiClient.get('/api/ai/results/cds/', { params });
    return parseResponse(StoredCDSResultSchema.array(), response.data, {
      context: 'aiApi.getStoredCDSResults',
    });
  },

  getStoredLabInterpretations: async (params?: {
    lab_result_id?: number;
    encounter_id?: number;
  }): Promise<StoredLabInterpretResult[]> => {
    const response = await apiClient.get('/api/ai/results/lab-interpretations/', { params });
    return parseResponse(StoredLabInterpretResultSchema.array(), response.data, {
      context: 'aiApi.getStoredLabInterpretations',
    });
  },

  getStoredDischargeResults: async (params?: {
    admission_id?: number;
  }): Promise<StoredDischargeResult[]> => {
    const response = await apiClient.get('/api/ai/results/discharge/', { params });
    return parseResponse(StoredDischargeResultSchema.array(), response.data, {
      context: 'aiApi.getStoredDischargeResults',
    });
  },

  getStoredICURiskResults: async (params?: {
    admission_id?: number;
  }): Promise<StoredICURiskResult[]> => {
    const response = await apiClient.get('/api/ai/results/icu-risk/', { params });
    return parseResponse(StoredICURiskResultSchema.array(), response.data, {
      context: 'aiApi.getStoredICURiskResults',
    });
  },

  getStoredSurgicalPreOpAssessments: async (params: {
    surgery_case_id: number;
  }): Promise<StoredSurgicalPreOpAssessResult[]> => {
    const response = await apiClient.get('/api/ai/results/surgical/pre-op-assessments/', {
      params,
    });
    return parseResponse(StoredSurgicalPreOpAssessResultSchema.array(), response.data, {
      context: 'aiApi.getStoredSurgicalPreOpAssessments',
    });
  },

  getStoredSurgicalChecklistSessions: async (params: {
    surgery_case_id: number;
  }): Promise<StoredSurgicalChecklistSessionResult[]> => {
    const response = await apiClient.get('/api/ai/results/surgical/checklist-sessions/', {
      params,
    });
    return parseResponse(StoredSurgicalChecklistSessionResultSchema.array(), response.data, {
      context: 'aiApi.getStoredSurgicalChecklistSessions',
    });
  },

  getStoredSurgicalPostOpCarePlans: async (params: {
    surgery_case_id: number;
  }): Promise<StoredSurgicalPostOpCarePlanResult[]> => {
    const response = await apiClient.get('/api/ai/results/surgical/post-op-care-plans/', {
      params,
    });
    return parseResponse(StoredSurgicalPostOpCarePlanResultSchema.array(), response.data, {
      context: 'aiApi.getStoredSurgicalPostOpCarePlans',
    });
  },

  // ===========================================================================
  // Investigation Suggestions
  // ===========================================================================

  /**
   * Suggest investigations for a clinical encounter.
   *
   * Returns structured investigation suggestions with LOINC codes and
   * optional FHIR R4 ServiceRequest resources. Advisory only — clinician
   * must explicitly accept each suggestion.
   *
   * @param data - Diagnoses, symptoms, existing orders, patient demographics
   * @returns Investigation suggestions grouped by priority
   */
  suggestInvestigations: async (
    data: AIInvestigationSuggestRequest
  ): Promise<AIInvestigationSuggestResponse> => {
    const response = await apiClient.post('/api/ai/investigations/suggest/', data);
    return parseResponse(AIInvestigationSuggestResponseSchema, response.data, {
      context: 'aiApi.suggestInvestigations',
    });
  },

  getStoredInvestigationSuggestions: async (params?: {
    encounter_id?: number;
  }): Promise<StoredInvestigationSuggestResult[]> => {
    const response = await apiClient.get('/api/ai/results/investigation-suggestions/', { params });
    return parseResponse(StoredInvestigationSuggestResultSchema.array(), response.data, {
      context: 'aiApi.getStoredInvestigationSuggestions',
    });
  },

  // ===========================================================================
  // Advisory → Order Links
  // ===========================================================================

  /** List advisory links for an AI result. */
  getAdvisoryLinks: async (aiResultId: string): Promise<AIAdvisoryOrderLink[]> => {
    const response = await apiClient.get('/api/ai/advisory-links/', {
      params: { ai_result_id: aiResultId },
    });
    return parseResponse(AIAdvisoryOrderLinkSchema.array(), response.data, {
      context: 'aiApi.getAdvisoryLinks',
    });
  },

  /** Seed advisory suggestion rows from an AI result. */
  seedAdvisoryLinks: async (
    data: AIAdvisoryBulkSeedRequest
  ): Promise<AIAdvisoryBulkSeedResponse> => {
    const response = await apiClient.post('/api/ai/advisory-links/', data);
    return parseResponse(AIAdvisoryBulkSeedResponseSchema, response.data, {
      context: 'aiApi.seedAdvisoryLinks',
    });
  },

  /** Mark an advisory link as ORDERED / DECLINED / NOT_APPLICABLE. */
  actionAdvisoryLink: async (
    id: number,
    data: AIAdvisoryOrderLinkActionRequest
  ): Promise<AIAdvisoryOrderLink> => {
    const response = await apiClient.patch(`/api/ai/advisory-links/${id}/action/`, data);
    return parseResponse(AIAdvisoryOrderLinkSchema, response.data, {
      context: 'aiApi.actionAdvisoryLink',
    });
  },

  /** Check if an AI result has non-draft orders linked (to disable Ask again). */
  advisoryHasOrders: async (aiResultId: string): Promise<AIAdvisoryHasOrdersResponse> => {
    const response = await apiClient.get('/api/ai/advisory-links/has-orders/', {
      params: { ai_result_id: aiResultId },
    });
    return parseResponse(AIAdvisoryHasOrdersResponseSchema, response.data, {
      context: 'aiApi.advisoryHasOrders',
    });
  },

  // ===========================================================================
  // Insights
  // ===========================================================================

  /** Get aggregated AI usage insights for the admin dashboard. */
  getInsights: async (): Promise<AIInsightsResponse> => {
    const response = await apiClient.get('/api/ai/insights/');
    return parseResponse(AIInsightsResponseSchema, response.data, {
      context: 'aiApi.getInsights',
    });
  },

  // ===========================================================================
  // Proactive Insights
  // ===========================================================================

  /**
   * Generate proactive clinical insights based on encounter context.
   *
   * Three-tier system:
   * - Tier 1: Rule-based vital alerts (instant, deterministic)
   * - Tier 2: Pattern-based clinical nudges (instant, rules engine)
   * - Tier 3: LLM-powered insights (conditional, async)
   *
   * @param data - Patient and encounter context
   * @returns Proactive insights with deduplication hash
   */
  getProactiveInsights: async (
    data: ProactiveInsightsRequest
  ): Promise<ProactiveInsightsResponse> => {
    const response = await apiClient.post('/api/ai/clinical/proactive-insights/', data);
    return parseResponse(ProactiveInsightsResponseSchema, response.data, {
      context: 'aiApi.getProactiveInsights',
    });
  },

  // ===========================================================================
  // Webhooks
  // ===========================================================================

  /** List all registered webhooks. */
  listWebhooks: async (): Promise<TibaBotWebhookListResponse> => {
    const response = await apiClient.get('/api/ai/webhooks/list/');
    return parseResponse(TibaBotWebhookListResponseSchema, response.data, {
      context: 'aiApi.listWebhooks',
    });
  },

  /** Register a new webhook subscription. */
  registerWebhook: async (
    data: TibaBotWebhookRegisterRequest
  ): Promise<TibaBotWebhookListResponse> => {
    const response = await apiClient.post('/api/ai/webhooks/', data);
    return parseResponse(TibaBotWebhookListResponseSchema, response.data, {
      context: 'aiApi.registerWebhook',
    });
  },

  /** Get webhook details. */
  getWebhook: async (webhookId: string): Promise<TibaBotWebhookListResponse> => {
    const response = await apiClient.get(`/api/ai/webhooks/${webhookId}/`);
    return parseResponse(TibaBotWebhookListResponseSchema, response.data, {
      context: 'aiApi.getWebhook',
    });
  },

  /** Update a webhook subscription. */
  updateWebhook: async (
    webhookId: string,
    data: TibaBotWebhookUpdateRequest
  ): Promise<TibaBotWebhookListResponse> => {
    const response = await apiClient.put(`/api/ai/webhooks/${webhookId}/`, data);
    return parseResponse(TibaBotWebhookListResponseSchema, response.data, {
      context: 'aiApi.updateWebhook',
    });
  },

  /** Delete a webhook subscription. */
  deleteWebhook: async (webhookId: string): Promise<Record<string, unknown>> => {
    const response = await apiClient.delete(`/api/ai/webhooks/${webhookId}/`);
    return parseResponse(z.record(z.unknown()), response.data, {
      context: 'aiApi.deleteWebhook',
    });
  },

  /** Pause webhook delivery. */
  pauseWebhook: async (webhookId: string): Promise<Record<string, unknown>> => {
    const response = await apiClient.post(`/api/ai/webhooks/${webhookId}/pause/`);
    return parseResponse(z.record(z.unknown()), response.data, {
      context: 'aiApi.pauseWebhook',
    });
  },

  /** Resume webhook delivery. */
  activateWebhook: async (webhookId: string): Promise<Record<string, unknown>> => {
    const response = await apiClient.post(`/api/ai/webhooks/${webhookId}/activate/`);
    return parseResponse(z.record(z.unknown()), response.data, {
      context: 'aiApi.activateWebhook',
    });
  },

  /** List webhook delivery history. */
  getWebhookDeliveries: async (webhookId: string): Promise<TibaBotWebhookDeliveryListResponse> => {
    const response = await apiClient.get(`/api/ai/webhooks/${webhookId}/deliveries/`);
    return parseResponse(TibaBotWebhookDeliveryListResponseSchema, response.data, {
      context: 'aiApi.getWebhookDeliveries',
    });
  },

  // ===========================================================================
  // Facility Knowledge Base
  // ===========================================================================

  /** Get facility knowledge base info and document list. */
  getFacilityKB: async (): Promise<FacilityKBInfoResponse> => {
    const response = await apiClient.get('/api/ai/facility/knowledge-base/');
    return parseResponse(FacilityKBInfoResponseSchema, response.data, {
      context: 'aiApi.getFacilityKB',
    });
  },

  /** Upload a document to the facility knowledge base. */
  uploadToFacilityKB: async (file: File): Promise<FacilityKBUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/ai/facility/knowledge-base/documents/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return parseResponse(FacilityKBUploadResponseSchema, response.data, {
      context: 'aiApi.uploadToFacilityKB',
    });
  },

  /** Delete a document from the facility knowledge base. */
  deleteFacilityKBDocument: async (
    documentId: string
  ): Promise<FacilityKBDocumentDeleteResponse> => {
    const response = await apiClient.delete(
      `/api/ai/facility/knowledge-base/documents/${documentId}/`
    );
    return parseResponse(FacilityKBDocumentDeleteResponseSchema, response.data, {
      context: 'aiApi.deleteFacilityKBDocument',
    });
  },

  /** Search the facility knowledge base. */
  searchFacilityKB: async (query: string, limit?: number): Promise<FacilityKBSearchResponse> => {
    const response = await apiClient.get('/api/ai/facility/knowledge-base/search/', {
      params: { q: query, ...(limit ? { limit } : {}) },
    });
    return parseResponse(FacilityKBSearchResponseSchema, response.data, {
      context: 'aiApi.searchFacilityKB',
    });
  },
};

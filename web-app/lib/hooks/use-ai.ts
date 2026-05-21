/**
 * AI/TibaBot React hooks.
 *
 * These hooks are feature-gated: they check NEXT_PUBLIC_ENABLE_AI before making
 * any requests. When AI is disabled, hooks return safe defaults.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api/ai';
import { ENABLE_AI } from '@/lib/utils/constants';
import type {
  AIICD10SuggestResponse,
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
  StoredCarePlanResult,
  StoredCDSResult,
  StoredLabInterpretResult,
  StoredDischargeResult,
  StoredICURiskResult,
  AIInvestigationSuggestRequest,
  AIInvestigationSuggestResponse,
  StoredInvestigationSuggestResult,
  AIInsightsResponse,
} from '@/lib/types/ai';

// =============================================================================
// Query Keys
// =============================================================================

export const aiKeys = {
  all: ['ai'] as const,
  status: () => [...aiKeys.all, 'status'] as const,
  sessions: () => [...aiKeys.all, 'sessions'] as const,
  session: (id: string) => [...aiKeys.all, 'session', id] as const,
  feedbackStats: () => [...aiKeys.all, 'feedback-stats'] as const,
  dischargeConditions: () => [...aiKeys.all, 'discharge-conditions'] as const,
  carePlanConditions: () => [...aiKeys.all, 'care-plan-conditions'] as const,
  storedCarePlans: (params: { encounter_id?: number; admission_id?: number }) =>
    [...aiKeys.all, 'stored-care-plans', params] as const,
  storedCDS: (encounterId: number) =>
    [...aiKeys.all, 'stored-cds', encounterId] as const,
  storedLabInterpretations: (params: { lab_result_id?: number; encounter_id?: number }) =>
    [...aiKeys.all, 'stored-lab-interpretations', params] as const,
  storedDischarge: (admissionId: number) =>
    [...aiKeys.all, 'stored-discharge', admissionId] as const,
  storedICURisk: (admissionId: number) =>
    [...aiKeys.all, 'stored-icu-risk', admissionId] as const,
  icuLabs: (admissionId: number) =>
    [...aiKeys.all, 'icu-labs', admissionId] as const,
  storedInvestigationSuggestions: (encounterId: number) =>
    [...aiKeys.all, 'stored-investigation-suggestions', encounterId] as const,
  insights: () => [...aiKeys.all, 'insights'] as const,
};

// =============================================================================
// Phase 1 Hooks
// =============================================================================

/**
 * Check whether AI features are enabled (frontend flag).
 *
 * Reads NEXT_PUBLIC_ENABLE_AI. When false, all AI components should
 * not be rendered — not just hidden with CSS.
 */
export function useAIEnabled(): boolean {
  return ENABLE_AI;
}

/**
 * Hook for AI-powered ICD-10 code suggestions.
 *
 * Sends clinical text to the backend AI proxy and returns ranked
 * ICD-10 code suggestions with confidence scores.
 *
 * Features:
 * - Auto-disabled when ENABLE_AI is false
 * - Returns advisory suggestions only (clinician confirms)
 * - Graceful degradation when TibaBot is unavailable
 *
 * @example
 * ```tsx
 * const { mutate, data, isPending } = useAIICD10Suggest();
 * mutate("patient presenting with malaria symptoms and fever");
 * ```
 */
export function useAIICD10Suggest() {
  return useMutation<AIICD10SuggestResponse, Error, string>({
    mutationFn: (clinicalText: string) => aiApi.suggestICD10(clinicalText),
    // Don't retry on failure — graceful degradation is handled in the response
    retry: false,
  });
}

/**
 * Hook for checking AI feature status (backend + service health).
 *
 * Calls GET /api/ai/status/ to check:
 * - Whether the backend TIBABOT_ENABLED flag is on
 * - Whether TibaBot service is actually reachable
 *
 * Only queries when the frontend flag is enabled.
 */
export function useAIStatus() {
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: () => aiApi.getStatus(),
    enabled: ENABLE_AI,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
}

// =============================================================================
// Phase 2 Hooks — Clinical Chat & Assist
// =============================================================================

/**
 * Hook for sending clinical chat messages.
 *
 * Sends a message to the clinical chat endpoint and returns the assistant response.
 * Supports session continuity via session_id.
 *
 * @example
 * ```tsx
 * const { mutateAsync, isPending } = useAIClinicalChat();
 * const response = await mutateAsync({ message: "What are the DDx for...", session_id: "abc" });
 * ```
 */
export function useAIClinicalChat() {
  const queryClient = useQueryClient();

  return useMutation<AIClinicalChatResponse, Error, AIClinicalChatRequest>({
    mutationFn: (data) => aiApi.clinicalChat(data),
    retry: false,
    onSuccess: () => {
      // Invalidate session list to show updated session
      queryClient.invalidateQueries({ queryKey: aiKeys.sessions() });
    },
  });
}

/**
 * Hook for encounter-aware clinical assistance.
 *
 * Sends patient/encounter context for contextual clinical reasoning.
 * Used when clinician clicks "Ask about this patient" in the widget.
 *
 * @example
 * ```tsx
 * const { mutateAsync, isPending } = useAIClinicalAssist();
 * const response = await mutateAsync({
 *   query: "Differential diagnosis",
 *   patient_context: { patient_age: 45, patient_sex: "M" },
 *   encounter_context: { chief_complaint: "cough x 3 days" },
 * });
 * ```
 */
export function useAIClinicalAssist() {
  return useMutation<AIClinicalAssistResponse, Error, AIClinicalAssistRequest>({
    mutationFn: (data) => aiApi.clinicalAssist(data),
    retry: false,
  });
}

/**
 * Hook for listing chat sessions.
 *
 * Fetches all chat sessions for the current user.
 * Cached for 2 minutes; invalidated when a new message is sent.
 */
export function useAIChatSessions() {
  return useQuery<AIChatSessionListResponse, Error>({
    queryKey: aiKeys.sessions(),
    queryFn: () => aiApi.listChatSessions(),
    enabled: ENABLE_AI,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook for fetching a specific chat session with its messages.
 *
 * @param sessionId - The session UUID to fetch
 */
export function useAIChatSession(sessionId: string | null) {
  return useQuery<AIChatSessionDetailResponse, Error>({
    queryKey: aiKeys.session(sessionId ?? ''),
    queryFn: () => aiApi.getChatSession(sessionId!),
    enabled: ENABLE_AI && !!sessionId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook for deleting a chat session.
 *
 * Invalidates the session list after deletion.
 */
export function useDeleteAIChatSession() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (sessionId) => aiApi.deleteChatSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.sessions() });
    },
  });
}

// =============================================================================
// Phase 3 Hooks — Condition Predictor
// =============================================================================

/**
 * Hook for AI-powered condition prediction during triage.
 *
 * Sends patient features (age, gender, vitals, chief complaint) to the
 * backend AI proxy for ML-based risk assessment. Returns predicted
 * conditions with confidence scores, risk factors, and recommendations.
 *
 * Advisory only — clinician must review and confirm.
 *
 * @example
 * ```tsx
 * const { mutate, data, isPending } = useAIConditionPredict();
 * mutate({
 *   patient_features: { age: 45, gender: 'M', spo2: 92, heart_rate: 110, ... }
 * });
 * ```
 */
export function useAIConditionPredict() {
  return useMutation<AIConditionPredictResponse, Error, AIConditionPredictRequest>({
    mutationFn: (data) => aiApi.predictCondition(data),
    retry: false,
  });
}

// =============================================================================
// Phase 4 Hooks — ICU Predictor
// =============================================================================

/**
 * Hook for AI-powered ICU risk prediction for admitted patients.
 *
 * Sends patient clinical data (vitals, labs, clinical context) to the
 * backend AI proxy for SOFA/qSOFA scoring and ICU risk assessment.
 *
 * Supports two prediction types:
 * - "predict": ICU admission risk with SOFA/qSOFA scores (default)
 * - "risk-stratify": Sepsis/AKI/deterioration composite risk scores
 *
 * Advisory only — clinician must review and confirm.
 *
 * @example
 * ```tsx
 * const { mutate, data, isPending } = useAIICUPredict();
 * mutate({
 *   patient_data: { age: 65, gender: 'M', spo2: 90, heart_rate: 115, wbc: 18.5, ... },
 *   prediction_type: 'predict',
 * });
 * ```
 */
export function useAIICUPredict() {
  return useMutation<AIICUPredictResponse, Error, AIICUPredictRequest>({
    mutationFn: (data) => aiApi.predictICU(data),
    retry: false,
  });
}

/**
 * Hook to fetch the latest verified lab values for ICU risk scoring.
 *
 * Calls GET /api/ai/predict/icu/labs/?admission_id=N and returns
 * a flat object of numeric values (wbc, platelets, creatinine, etc.).
 * Only enabled when admissionId is provided and AI is accessible.
 */
export function useICULabs(admissionId: number | undefined) {
  return useQuery<Record<string, number>>({
    queryKey: aiKeys.icuLabs(admissionId ?? 0),
    queryFn: () => aiApi.getICULabs(admissionId!),
    enabled: !!admissionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =============================================================================
// Phase 3 Hooks — Feedback
// =============================================================================

/**
 * Hook for submitting feedback (thumbs up/down) on a TibaBot response.
 *
 * @example
 * ```tsx
 * const { mutate } = useAIFeedback();
 * mutate({ message_id: "enc-88-assist-1", feedback: "up" });
 * ```
 */
export function useAIFeedback() {
  return useMutation<AIFeedbackResponse, Error, AIFeedbackRequest>({
    mutationFn: (data) => aiApi.submitFeedback(data),
    retry: false,
  });
}

/**
 * Hook for fetching aggregate feedback statistics.
 *
 * Useful for admin dashboards showing thumbs-up/down totals.
 */
export function useAIFeedbackStats() {
  return useQuery<AIFeedbackStats, Error>({
    queryKey: aiKeys.feedbackStats(),
    queryFn: () => aiApi.getFeedbackStats(),
    enabled: ENABLE_AI,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook for recording accepted or applied AI suggestions.
 */
export function useAISuggestionAudit() {
  return useMutation<AISuggestionAuditResponse, Error, AISuggestionAuditRequest>({
    mutationFn: (data) => aiApi.auditSuggestionAction(data),
    retry: false,
  });
}

// =============================================================================
// Phase 5 Hooks — Lab Assist
// =============================================================================

/**
 * Hook for AI-powered lab result interpretation.
 *
 * Sends lab results with patient demographics for interpretation.
 * Returns flagged abnormals, detected patterns, and follow-up suggestions.
 * Falls back to local reference range checks when TibaBot is unavailable.
 */
export function useAILabInterpret() {
  return useMutation<AILabInterpretResponse, Error, AILabInterpretRequest>({
    mutationFn: (data) => aiApi.interpretLab(data),
    retry: false,
  });
}

// =============================================================================
// Phase 5 Hooks — Discharge Readiness
// =============================================================================

/**
 * Hook for AI-powered discharge readiness assessment.
 *
 * Evaluates clinical, functional, and social criteria against
 * condition-specific checklists. Includes Kenya-specific criteria.
 */
export function useAIDischargeAssess() {
  return useMutation<AIDischargeAssessResponse, Error, AIDischargeAssessRequest>({
    mutationFn: (data) => aiApi.assessDischarge(data),
    retry: false,
  });
}

/**
 * Hook for listing supported discharge conditions.
 * Static data — cached for 24 hours.
 */
export function useAIDischargeConditions() {
  return useQuery<AIDischargeConditionsResponse, Error>({
    queryKey: aiKeys.dischargeConditions(),
    queryFn: () => aiApi.listDischargeConditions(),
    enabled: ENABLE_AI,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

// =============================================================================
// Phase 5 Hooks — Care Plan Generator
// =============================================================================

/**
 * Hook for AI-powered care plan generation.
 *
 * Generates structured, evidence-based care plans with goals, interventions,
 * and discharge criteria. Includes KEML facility-level medication checks.
 */
export function useAICarePlanGenerate() {
  return useMutation<AICarePlanResponse, Error, AICarePlanGenerateRequest>({
    mutationFn: (data) => aiApi.generateCarePlan(data),
    retry: false,
  });
}

/**
 * Hook for listing conditions with care plan templates.
 * Static data — cached for 24 hours.
 */
export function useAICarePlanConditions() {
  return useQuery<AICarePlanConditionsResponse, Error>({
    queryKey: aiKeys.carePlanConditions(),
    queryFn: () => aiApi.listCarePlanConditions(),
    enabled: ENABLE_AI,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

// =============================================================================
// Phase 5 Hooks — Clerking Assist
// =============================================================================

/**
 * Hook for AI-powered clinical text autocomplete.
 *
 * Provides context-aware suggestions for clinical text fields.
 * Use with debounced input for real-time autocomplete in encounter forms.
 */
export function useAIClerkingAutocomplete() {
  return useMutation<AIClerkingAutocompleteResponse, Error, AIClerkingAutocompleteRequest>({
    mutationFn: (data) => aiApi.clerkingAutocomplete(data),
    retry: false,
  });
}

/**
 * Hook for converting free-text notes to structured SOAP/SBAR format.
 */
export function useAIClerkingStructure() {
  return useMutation<AIClerkingStructureResponse, Error, AIClerkingStructureRequest>({
    mutationFn: (data) => aiApi.clerkingStructure(data),
    retry: false,
  });
}

// =============================================================================
// Phase 6 Hooks — Clinical Document Generation
// =============================================================================

/**
 * Hook for generating structured clinical documents via TibaBot.
 *
 * Supports discharge summaries, SOAP notes, progress notes,
 * referral letters, and clerking notes with structured context.
 */
export function useAIClinicalDocument() {
  return useMutation<AIClinicalDocumentResponse, Error, AIClinicalDocumentRequest>({
    mutationFn: (data) => aiApi.generateClinicalDocument(data),
    retry: false,
    // All callers use mutateAsync with local try/catch — suppress noisy global console.error
    meta: { skipGlobalErrorHandler: true },
  });
}

// =============================================================================
// Phase 5 Hooks — Enhanced CDS Evaluation
// =============================================================================

/**
 * Hook for enhanced CDS evaluation via TibaBot.
 *
 * Supplements the local CDS engine with TibaBot-powered evaluation
 * including drug-drug interactions, contraindications, protocol adherence,
 * and KEML formulary compliance.
 */
export function useAICDSEvaluate() {
  return useMutation<AICDSEvaluateResponse, Error, AICDSEvaluateRequest>({
    mutationFn: (data) => aiApi.evaluateCDS(data),
    retry: false,
  });
}

// =============================================================================
// Stored AI result hooks (load persisted outputs)
// =============================================================================

export function useStoredCarePlans(params: { encounter_id?: number; admission_id?: number }) {
  const hasId = Boolean(params.encounter_id || params.admission_id);
  return useQuery<StoredCarePlanResult[]>({
    queryKey: aiKeys.storedCarePlans(params),
    queryFn: () => aiApi.getStoredCarePlans(params),
    enabled: ENABLE_AI && hasId,
    staleTime: 30_000,
  });
}

export function useStoredCDSResults(encounterId: number | undefined) {
  return useQuery<StoredCDSResult[]>({
    queryKey: aiKeys.storedCDS(encounterId ?? 0),
    queryFn: () => aiApi.getStoredCDSResults({ encounter_id: encounterId! }),
    enabled: ENABLE_AI && Boolean(encounterId),
    staleTime: 30_000,
  });
}

export function useStoredLabInterpretations(params: { lab_result_id?: number; encounter_id?: number }) {
  const hasId = Boolean(params.lab_result_id || params.encounter_id);
  return useQuery<StoredLabInterpretResult[]>({
    queryKey: aiKeys.storedLabInterpretations(params),
    queryFn: () => aiApi.getStoredLabInterpretations(params),
    enabled: ENABLE_AI && hasId,
    staleTime: 30_000,
  });
}

export function useStoredDischargeResults(admissionId: number | undefined) {
  return useQuery<StoredDischargeResult[]>({
    queryKey: aiKeys.storedDischarge(admissionId ?? 0),
    queryFn: () => aiApi.getStoredDischargeResults({ admission_id: admissionId! }),
    enabled: ENABLE_AI && Boolean(admissionId),
    staleTime: 30_000,
  });
}

export function useStoredICURiskResults(admissionId: number | undefined) {
  return useQuery<StoredICURiskResult[]>({
    queryKey: aiKeys.storedICURisk(admissionId ?? 0),
    queryFn: () => aiApi.getStoredICURiskResults({ admission_id: admissionId! }),
    enabled: ENABLE_AI && Boolean(admissionId),
    staleTime: 30_000,
  });
}

// =============================================================================
// Investigation Suggestions
// =============================================================================

/**
 * Hook for suggesting investigations via TibaBot.
 *
 * Returns structured investigation suggestions with LOINC codes and
 * priority grouping. Advisory only — clinician must accept each suggestion.
 */
export function useAIInvestigationSuggest() {
  const queryClient = useQueryClient();
  return useMutation<AIInvestigationSuggestResponse, Error, AIInvestigationSuggestRequest>({
    mutationFn: (data) => aiApi.suggestInvestigations(data),
    retry: false,
    onSuccess: (_data, variables) => {
      if (variables.encounter_id) {
        queryClient.invalidateQueries({
          queryKey: aiKeys.storedInvestigationSuggestions(variables.encounter_id),
        });
      }
    },
  });
}

export function useStoredInvestigationSuggestions(encounterId: number | undefined) {
  return useQuery<StoredInvestigationSuggestResult[]>({
    queryKey: aiKeys.storedInvestigationSuggestions(encounterId ?? 0),
    queryFn: () => aiApi.getStoredInvestigationSuggestions({ encounter_id: encounterId! }),
    enabled: ENABLE_AI && Boolean(encounterId),
    staleTime: 30_000,
  });
}

// =============================================================================
// Insights
// =============================================================================

export function useAIInsights() {
  return useQuery<AIInsightsResponse, Error>({
    queryKey: aiKeys.insights(),
    queryFn: () => aiApi.getInsights(),
    enabled: ENABLE_AI,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

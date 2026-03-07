/**
 * Zod schemas for AI/TibaBot API response validation.
 */

import { z } from 'zod';

// =============================================================================
// Phase 1 — ICD-10
// =============================================================================

/** Schema for a single ICD-10 suggestion */
export const AIICD10SuggestionSchema = z.object({
  code: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Schema for the ICD-10 suggest response */
export const AIICD10SuggestResponseSchema = z.object({
  suggestions: z.array(AIICD10SuggestionSchema),
  clinical_text_preview: z.string().optional(),
  error: z.string().optional(),
});

/** Schema for AI status response */
export const AIStatusSchema = z.object({
  enabled: z.boolean(),
  service_name: z.string(),
  service_available: z.boolean(),
  rag_initialized: z.boolean().optional(),
  demo_mode: z.boolean().optional(),
});

// =============================================================================
// Phase 2 — Clinical Chat & Assist
// =============================================================================

/** Schema for a single chat message */
export const AIChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  isStreaming: z.boolean().optional(),
});

/** Schema for POST /api/ai/clinical/chat/ response */
export const AIClinicalChatResponseSchema = z.object({
  session_id: z.string(),
  message: AIChatMessageSchema,
  error: z.string().optional(),
});

/** Schema for POST /api/ai/clinical/assist/ response */
export const AIClinicalAssistResponseSchema = z.object({
  response: z.string(),
  references: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

/** Schema for a chat session summary */
export const AIChatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
});

/** Schema for GET /api/ai/clinical/chat/sessions/ response */
export const AIChatSessionListResponseSchema = z.object({
  sessions: z.array(AIChatSessionSchema),
});

/** Schema for GET /api/ai/clinical/chat/session/{id}/ response */
export const AIChatSessionDetailResponseSchema = z.object({
  session: AIChatSessionSchema,
  messages: z.array(AIChatMessageSchema),
});

// =============================================================================
// Phase 3 — Condition Predictor
// =============================================================================

/** Schema for a single risk factor in condition prediction */
export const AIConditionRiskFactorSchema = z.object({
  factor: z.string(),
  severity: z.enum(['low', 'moderate', 'high', 'critical']),
  description: z.string().optional(),
});

/** Schema for a differential condition */
export const AIDifferentialConditionSchema = z.object({
  condition: z.string(),
  confidence: z.number().min(0).max(1),
  icd10_code: z.string().optional(),
});

/** Schema for POST /api/ai/predict/condition/ response */
export const AIConditionPredictResponseSchema = z.object({
  primary_condition: z.string(),
  confidence: z.number().min(0).max(1),
  risk_level: z.enum(['low', 'moderate', 'high', 'critical']),
  risk_factors: z.array(AIConditionRiskFactorSchema).optional(),
  differential_conditions: z.array(AIDifferentialConditionSchema).optional(),
  recommendations: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

// =============================================================================
// Phase 4 — ICU Predictor
// =============================================================================

/** Schema for SOFA score component breakdown */
export const AISOFAScoreBreakdownSchema = z.object({
  respiratory: z.number().min(0).max(4).nullable().optional(),
  coagulation: z.number().min(0).max(4).nullable().optional(),
  liver: z.number().min(0).max(4).nullable().optional(),
  cardiovascular: z.number().min(0).max(4).nullable().optional(),
  neurological: z.number().min(0).max(4).nullable().optional(),
  renal: z.number().min(0).max(4).nullable().optional(),
});

/** Schema for a critical alert from ICU prediction */
export const AIICUCriticalAlertSchema = z.object({
  alert_type: z.string(),
  severity: z.enum(['warning', 'critical']),
  message: z.string(),
  recommendation: z.string().optional(),
});

/** Schema for escalation recommendation */
export const AIICUEscalationSchema = z.object({
  recommended: z.boolean(),
  urgency: z.enum(['routine', 'urgent', 'immediate']).optional(),
  reasoning: z.string().optional(),
});

/** Schema for POST /api/ai/predict/icu/ response */
export const AIICUPredictResponseSchema = z.object({
  risk_level: z.enum(['low', 'moderate', 'high', 'critical']),
  risk_score: z.number().min(0).max(1),
  sofa_score: z.number().min(0).max(24).nullable().optional(),
  sofa_breakdown: AISOFAScoreBreakdownSchema.nullable().optional(),
  qsofa_score: z.number().min(0).max(3).nullable().optional(),
  qsofa_criteria: z.array(z.string()).optional(),
  critical_alerts: z.array(AIICUCriticalAlertSchema).optional(),
  escalation: AIICUEscalationSchema.nullable().optional(),
  recommendations: z.array(z.string()).optional(),
  sepsis_probability: z.number().min(0).max(1).nullable().optional(),
  aki_probability: z.number().min(0).max(1).nullable().optional(),
  deterioration_probability: z.number().min(0).max(1).nullable().optional(),
  error: z.string().nullable().optional(),
});

// =============================================================================
// Phase 3 — Feedback
// =============================================================================

/** Schema for POST /api/ai/feedback/ response */
export const AIFeedbackResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  feedback_id: z.string().optional(),
});

/** Schema for GET /api/ai/feedback/stats/ response */
export const AIFeedbackStatsSchema = z.object({
  total_up: z.number(),
  total_down: z.number(),
  recent_negatives: z.number().optional(),
});

/** Schema for POST /api/ai/suggestion-audit/ response */
export const AISuggestionAuditResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  logged_count: z.number(),
}).passthrough();

// =============================================================================
// Phase 4a — Smart Autopopulate
// =============================================================================

/** Schema for a single autopopulate field suggestion */
export const AIAutopopulateSuggestedFieldSchema = z.object({
  field_name: z.string(),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  source: z.enum(['ai', 'cds', 'history']).default('ai'),
});

/** Schema for POST /api/ai/autopopulate/ response */
export const AIAutopopulateResponseSchema = z.object({
  suggested_fields: z.array(AIAutopopulateSuggestedFieldSchema),
  icd10_suggestions: z.array(AIICD10SuggestionSchema).optional(),
  error: z.string().nullable().optional(),
});

// =============================================================================
// Phase 5 — Lab Assist
// =============================================================================

/** Schema for a single lab result item */
export const AILabResultItemSchema = z.object({
  test_name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string().optional(),
});

/** Schema for a flagged lab result */
export const AILabFlagSchema = z.object({
  test_name: z.string(),
  value: z.number(),
  unit: z.string(),
  status: z.string(),
  reference_range: z.object({
    low: z.number().optional(),
    high: z.number().optional(),
    unit: z.string().optional(),
  }).nullable().optional(),
  deviation_percent: z.number().nullable().optional(),
  message: z.string().optional(),
}).passthrough();

/** Schema for a detected multi-lab pattern */
export const AILabPatternSchema = z.object({
  pattern_name: z.string(),
  significance: z.enum(['critical', 'significant', 'monitor']),
  confidence: z.number().min(0).max(1),
  description: z.string().optional(),
  contributing_tests: z.array(z.string()).optional(),
}).passthrough();

/** Schema for POST /api/ai/lab/interpret/ response */
export const AILabInterpretResponseSchema = z.object({
  flags: z.array(AILabFlagSchema),
  patterns: z.array(AILabPatternSchema).optional(),
  interpretation_summary: z.string().optional(),
  suggested_followup_labs: z.array(z.string()).optional(),
  critical_alerts: z.array(z.string()).optional(),
  mode: z.string().optional(),
  error: z.string().nullable().optional(),
}).passthrough();

// =============================================================================
// Phase 5 — Discharge Readiness
// =============================================================================

/** Schema for a single discharge criterion */
export const AIDischargeCriterionSchema = z.object({
  name: z.string(),
  category: z.string(),
  met: z.boolean(),
  details: z.string().optional(),
}).passthrough();

/** Schema for POST /api/ai/discharge/assess/ response */
export const AIDischargeAssessResponseSchema = z.object({
  readiness_score: z.number().min(0).max(1),
  readiness_level: z.enum(['ready', 'near_ready', 'not_ready']),
  criteria: z.array(AIDischargeCriterionSchema),
  unmet_criteria_count: z.number(),
  readmission_risk: z.number().min(0).max(1).nullable().optional(),
  readmission_risk_level: z.string().nullable().optional(),
  recommendations: z.array(z.string()).optional(),
  vitals_stability: z.string().nullable().optional(),
  mode: z.string().optional(),
  error: z.string().nullable().optional(),
}).passthrough();

/** Schema for GET /api/ai/discharge/conditions/ response */
export const AIDischargeConditionsResponseSchema = z.object({
  conditions: z.array(z.string()),
  count: z.number(),
}).passthrough();

// =============================================================================
// Phase 5 — Care Plan Generator
// =============================================================================

/** Schema for a care plan goal */
export const AICarePlanGoalSchema = z.object({
  description: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  timeframe: z.string().optional(),
  measurable_target: z.string().optional(),
}).passthrough();

/** Schema for a care plan intervention item */
export const AICarePlanInterventionItemSchema = z.object({
  action: z.string(),
  frequency: z.string().optional(),
  rationale: z.string().optional(),
}).passthrough();

/** Schema for a care plan intervention category */
export const AICarePlanInterventionCategorySchema = z.object({
  category: z.string(),
  items: z.array(AICarePlanInterventionItemSchema),
}).passthrough();

/** Schema for care plan follow-up */
export const AICarePlanFollowUpSchema = z.object({
  timing: z.string(),
  instructions: z.string().optional(),
  red_flags: z.array(z.string()).optional(),
}).passthrough();

/** Schema for POST /api/ai/care-plan/generate/ response */
export const AICarePlanResponseSchema = z.object({
  primary_diagnosis: z.string(),
  icd10_code: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  goals: z.array(AICarePlanGoalSchema),
  interventions: z.array(AICarePlanInterventionCategorySchema),
  discharge_criteria: z.array(z.string()).optional(),
  follow_up: AICarePlanFollowUpSchema.nullable().optional(),
  references: z.array(z.string()).optional(),
  cds_alerts: z.array(z.record(z.unknown())).optional(),
  facility_level_notes: z.array(z.string()).optional(),
  template_used: z.string().nullable().optional(),
  mode: z.string().optional(),
  llm_enriched: z.boolean().optional(),
  evidence_sources: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
}).passthrough();

/** Schema for GET /api/ai/care-plan/conditions/ response */
export const AICarePlanConditionsResponseSchema = z.object({
  conditions: z.array(z.object({
    key: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })),
  count: z.number(),
}).passthrough();

// =============================================================================
// Phase 5 — Clerking Assist
// =============================================================================

/** Schema for a clerking autocomplete suggestion */
export const AIClerkingAutocompleteSuggestionSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  category: z.string().optional(),
}).passthrough();

/** Schema for POST /api/ai/clerking/autocomplete/ response */
export const AIClerkingAutocompleteResponseSchema = z.object({
  suggestions: z.array(AIClerkingAutocompleteSuggestionSchema),
  mode: z.string().optional(),
  error: z.string().nullable().optional(),
}).passthrough();

/** Schema for POST /api/ai/clerking/structure/ response */
export const AIClerkingStructureResponseSchema = z.object({
  structured_note: z.record(z.string()),
  sections: z.array(z.string()),
  original_text: z.string(),
  mode: z.string().optional(),
  error: z.string().nullable().optional(),
}).passthrough();

// =============================================================================
// Phase 5 — Enhanced CDS Evaluation
// =============================================================================

/** Schema for a single CDS alert from TibaBot */
export const AICDSAlertItemSchema = z.object({
  rule_id: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string(),
  title: z.string(),
  message: z.string(),
  recommendation: z.string().optional(),
  evidence_level: z.string().optional(),
}).passthrough();

/** Schema for POST /api/ai/cds/evaluate/ response */
export const AICDSEvaluateResponseSchema = z.object({
  alerts: z.array(AICDSAlertItemSchema),
  recommendations: z.array(AICDSAlertItemSchema).optional(),
  rules_evaluated: z.number(),
  rules_fired: z.number(),
  processing_time_ms: z.number(),
  mode: z.string().optional(),
  error: z.string().nullable().optional(),
}).passthrough();

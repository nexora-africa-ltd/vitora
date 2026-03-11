import { z } from 'zod';

// ──────────────────── AI Status ────────────────────

export const AIStatusSchema = z.object({
  enabled: z.boolean(),
  service_name: z.string(),
  service_available: z.boolean(),
  rag_initialized: z.boolean().optional(),
  demo_mode: z.boolean().optional(),
});

// ──────────────────── Clinical Assist ────────────────────

export const AIClinicalAssistResponseSchema = z.object({
  response: z.string(),
  references: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

// ──────────────────── ICD-10 Auto-Suggest ────────────────────

export const AIICD10SuggestionSchema = z.object({
  code: z.string(),
  description: z.string(),
  confidence: z.number(),
});

export const AIICD10SuggestResponseSchema = z.object({
  suggestions: z.array(AIICD10SuggestionSchema),
  clinical_text_preview: z.string().optional(),
  error: z.string().optional(),
});

// ──────────────────── Lab Interpretation ────────────────────

export const AILabInterpretFindingSchema = z.object({
  test_name: z.string(),
  interpretation: z.string(),
  severity: z.enum(['normal', 'mild', 'moderate', 'severe', 'critical']),
  clinical_significance: z.string(),
});

export const AILabInterpretResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(AILabInterpretFindingSchema),
  recommendations: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

// ──────────────────── Feedback ────────────────────

export const AIFeedbackResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  feedback_id: z.string().optional(),
});

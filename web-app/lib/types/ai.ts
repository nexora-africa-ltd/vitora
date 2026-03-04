/**
 * AI/TibaBot TypeScript types.
 *
 * Types for the AI proxy endpoints that connect to TibaBot services.
 */

// =============================================================================
// Phase 1 — ICD-10 Auto-coding
// =============================================================================

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

// =============================================================================
// Phase 2 — Clinical Chat & Assist
// =============================================================================

/** Chat message role */
export type AIChatRole = 'user' | 'assistant' | 'system';

/** A single chat message in a session */
export interface AIChatMessage {
  id: string;
  role: AIChatRole;
  content: string;
  timestamp: string;
  /** Whether this message is still being streamed (SSE) */
  isStreaming?: boolean;
}

/** Patient context for Clinical Assist — no PII */
export interface AIPatientContext {
  patient_age: number;
  patient_sex: string;
  facility_level?: number;
  allergies?: string[];
  comorbidities?: string[];
  current_medications?: string[];
}

/** Encounter context for Clinical Assist */
export interface AIEncounterContext {
  chief_complaint?: string;
  vitals?: {
    spo2?: number;
    pulse?: number;
    temperature?: number;
    rr?: number;
    /** Mean Arterial Pressure (MAP) in mmHg - calculated from BP */
    map?: number;
  };
}

/**
 * User context for TibaBot — no PII (no name/email).
 *
 * Allows TibaBot to calibrate response depth and style:
 * - A clinical officer at an L2 needs step-by-step guidance
 * - A consultant at a referral hospital needs concise differentials
 *
 * Fields are nullable to support incremental modelling — add values as the
 * backend User model gains seniority/specialization fields.
 */
export interface AIUserContext {
  /** User role (DOCTOR, NURSE, CLINICAL_OFFICER, PHARMACIST, etc.) */
  role: string | null;
  /** Seniority level — null until modelled on the User model */
  seniority: string | null;
  /** Clinical specialization — null until modelled on the User model */
  specialization: string | null;
}

/**
 * Facility context for TibaBot.
 *
 * Enables epidemiologically-appropriate and capability-aware suggestions:
 * - An L2 dispensary cannot do CT scans → TibaBot should recommend referral
 * - Malaria prevalence differs by county → differentials should reflect region
 *
 * Fields are nullable to support incremental modelling.
 */
export interface AIFacilityContext {
  /** KEPH level (L1–L6) from settings.FACILITY_LEVEL */
  keph_level: string | null;
  /** County for epidemiological context — null until exposed via API */
  county: string | null;
  /** Whether facility has an ICU */
  has_icu: boolean | null;
  /** Whether facility has a laboratory */
  has_laboratory: boolean | null;
  /** Whether facility has imaging (X-ray, CT, MRI) */
  has_imaging: boolean | null;
  /** Whether facility has a pharmacy */
  has_pharmacy: boolean | null;
}

/**
 * Page context for TibaBot — tells the assistant which page the user is on.
 *
 * Lightweight descriptor sent with every chat message so TibaBot can
 * provide contextually relevant responses even on non-clinical pages.
 */
export interface AIPageContext {
  /** Current route path (e.g., "/patients/123", "/pharmacy") */
  route: string;
  /** Human-readable page title from navigation config (e.g., "Patient Detail", "Pharmacy") */
  page_title: string;
  /** Top-level module (e.g., "patients", "encounters", "pharmacy", "dashboard") */
  module: string;
}

/** Verbosity level for AI responses — must match TibaBot accepted values */
export type AIVerbosity = 'concise' | 'standard' | 'educational';

/** Human-readable labels for each verbosity level */
export const AI_VERBOSITY_OPTIONS: { value: AIVerbosity; label: string; description: string }[] = [
  { value: 'concise', label: 'Concise', description: 'Terse bullet points, <150 words' },
  { value: 'standard', label: 'Standard', description: 'Balanced with context (default)' },
  { value: 'educational', label: 'Educational', description: 'Full reasoning, explains "why"' },
];

/** Request body for POST /api/ai/clinical/chat/ */
export interface AIClinicalChatRequest {
  message: string;
  session_id?: string;
  /** Patient context for encounter-aware chat — no PII */
  patient_context?: AIPatientContext;
  /** Encounter context for encounter-aware chat */
  encounter_context?: AIEncounterContext;
  /** Page context — auto-populated by the chat widget from the current route */
  page_context?: AIPageContext;
  /** User context — injected automatically by the API layer */
  user_context?: AIUserContext;
  /** Facility context — injected automatically by the API layer */
  facility_context?: AIFacilityContext;
  /** Response detail level */
  verbosity?: AIVerbosity;
}

/** Response from POST /api/ai/clinical/chat/ (non-streaming) */
export interface AIClinicalChatResponse {
  session_id: string;
  message: AIChatMessage;
  /** Set when TibaBot is unreachable */
  error?: string;
}

/** Request body for POST /api/ai/clinical/assist/ */
export interface AIClinicalAssistRequest {
  query: string;
  patient_context?: AIPatientContext;
  encounter_context?: AIEncounterContext;
  /** Page context — auto-populated by the chat widget from the current route */
  page_context?: AIPageContext;
  /** User context — injected automatically by the API layer */
  user_context?: AIUserContext;
  /** Facility context — injected automatically by the API layer */
  facility_context?: AIFacilityContext;
  verbosity?: AIVerbosity;
}

/** Response from POST /api/ai/clinical/assist/ */
export interface AIClinicalAssistResponse {
  response: string;
  references?: string[];
  /** Set when TibaBot is unreachable */
  error?: string | null;
}

/** A chat session summary */
export interface AIChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/** Response from GET /api/ai/clinical/chat/sessions/ */
export interface AIChatSessionListResponse {
  sessions: AIChatSession[];
}

/** Response from GET /api/ai/clinical/chat/session/{id}/ */
export interface AIChatSessionDetailResponse {
  session: AIChatSession;
  messages: AIChatMessage[];
}

// =============================================================================
// Phase 3 — Condition Predictor
// =============================================================================

/** Patient features for condition prediction — no PII */
export interface AIConditionPredictFeatures {
  age: number;
  gender: 'M' | 'F' | 'O';
  chief_complaint?: string;
  chief_complaint_category?: string;
  spo2?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  pain_score?: number | null;
  mental_status?: string;
  mobility?: string;
  allergies?: string;
}

/** Request body for POST /api/ai/predict/condition/ */
export interface AIConditionPredictRequest {
  patient_features: AIConditionPredictFeatures;
}

/** A single identified risk factor */
export interface AIConditionRiskFactor {
  factor: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description?: string;
}

/** A differential condition with confidence score */
export interface AIDifferentialCondition {
  condition: string;
  confidence: number;
  icd10_code?: string;
}

/** Response from POST /api/ai/predict/condition/ */
export interface AIConditionPredictResponse {
  primary_condition: string;
  confidence: number;
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
  risk_factors?: AIConditionRiskFactor[];
  differential_conditions?: AIDifferentialCondition[];
  recommendations?: string[];
  error?: string | null;
}

// =============================================================================
// Phase 4 — ICU Predictor
// =============================================================================

/** Patient clinical data for ICU risk prediction — no PII */
export interface AIICUPredictPatientData {
  age: number;
  gender: 'M' | 'F' | 'O';
  // Vital signs
  temperature?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  mean_arterial_pressure?: number | null;
  // Lab values (for SOFA scoring)
  wbc?: number | null;
  platelets?: number | null;
  creatinine?: number | null;
  bilirubin?: number | null;
  lactate?: number | null;
  pao2_fio2_ratio?: number | null;
  gcs?: number | null;
  // Clinical context
  urine_output_ml_day?: number | null;
  on_vasopressors?: boolean;
  on_mechanical_ventilation?: boolean;
  admission_diagnosis?: string;
  length_of_stay_days?: number | null;
}

/** ICU prediction type */
export type AIICUPredictionType = 'predict' | 'risk-stratify';

/** Request body for POST /api/ai/predict/icu/ */
export interface AIICUPredictRequest {
  patient_data: AIICUPredictPatientData;
  prediction_type?: AIICUPredictionType;
}

/** SOFA score component breakdown */
export interface AISOFAScoreBreakdown {
  respiratory?: number | null;
  coagulation?: number | null;
  liver?: number | null;
  cardiovascular?: number | null;
  neurological?: number | null;
  renal?: number | null;
}

/** A critical alert from ICU prediction */
export interface AIICUCriticalAlert {
  alert_type: string;
  severity: 'warning' | 'critical';
  message: string;
  recommendation?: string;
}

/** Escalation recommendation from ICU prediction */
export interface AIICUEscalation {
  recommended: boolean;
  urgency?: 'routine' | 'urgent' | 'immediate';
  reasoning?: string;
}

/** Response from POST /api/ai/predict/icu/ */
export interface AIICUPredictResponse {
  // Overall risk assessment
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
  risk_score: number;
  // Scoring systems
  sofa_score?: number | null;
  sofa_breakdown?: AISOFAScoreBreakdown | null;
  qsofa_score?: number | null;
  qsofa_criteria?: string[];
  // Alerts and recommendations
  critical_alerts?: AIICUCriticalAlert[];
  escalation?: AIICUEscalation | null;
  recommendations?: string[];
  // Risk stratification probabilities
  sepsis_probability?: number | null;
  aki_probability?: number | null;
  deterioration_probability?: number | null;
  // Error
  error?: string | null;
}

// =============================================================================
// Widget State
// =============================================================================

/** Widget display state */
export type AIWidgetState = 'minimized' | 'expanded' | 'full-page';

/** TibaBot availability status for the widget indicator */
export type TibaBotAvailability = 'available' | 'unavailable' | 'loading';

/**
 * A quick action button displayed in the chat widget.
 *
 * Quick actions are context-sensitive shortcuts that appear in the widget
 * when the user is on specific pages (encounter, triage, etc.).
 * Each page registers its own quick actions via setQuickActions().
 */
export interface AIQuickAction {
  /** Unique key for this action */
  id: string;
  /** Button label displayed in the widget */
  label: string;
  /** Lucide icon name — rendered by the parent component */
  icon?: string;
  /** The query to send to clinical assist */
  query: string;
  /** Optional user-visible message shown in chat when clicked */
  userMessage?: string;
}

// =============================================================================
// Phase 3 — Feedback
// =============================================================================

/** Feedback direction */
export type AIFeedbackDirection = 'up' | 'down';

/** Request body for POST /api/ai/feedback/ */
export interface AIFeedbackRequest {
  /** Unique ID for the response being rated (e.g., "enc-88-assist-1") */
  message_id: string;
  /** Group feedback by encounter/session */
  conversation_id?: string;
  /** Thumbs up or down */
  feedback: AIFeedbackDirection;
  /** Original query text (for analysis) */
  user_query?: string;
  /** The response being rated */
  bot_response?: string;
  /** Echo back the risk_level from the /clinical/assist response */
  risk_level?: string;
}

/** Response from POST /api/ai/feedback/ */
export interface AIFeedbackResponse {
  status: string;
  message: string;
  feedback_id?: string;
}

/** Response from GET /api/ai/feedback/stats/ */
export interface AIFeedbackStats {
  total_up: number;
  total_down: number;
  recent_negatives?: number;
}

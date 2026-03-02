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
    bp?: string;
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

/** Verbosity level for Clinical Assist responses */
export type AIVerbosity = 'brief' | 'standard' | 'detailed';

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
  error?: string;
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
// Widget State
// =============================================================================

/** Widget display state */
export type AIWidgetState = 'minimized' | 'expanded' | 'full-page';

/** TibaBot availability status for the widget indicator */
export type TibaBotAvailability = 'available' | 'unavailable' | 'loading';

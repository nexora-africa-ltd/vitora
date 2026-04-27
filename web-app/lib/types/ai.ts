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
  /** Whether code is specific enough for billing/SHA claims */
  is_billable?: boolean;
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
  /** Whether TibaBot's RAG knowledge base is initialized */
  rag_initialized?: boolean;
  /** Whether TibaBot is running in demo mode (no LLM) */
  demo_mode?: boolean;
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
  /** The LLM model that generated this message (assistant messages only) */
  model?: string;
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
  clinical_notes?: string;
  vitals?: {
    spo2?: number;
    pulse?: number;
    temperature?: number;
    rr?: number;
    /** Mean Arterial Pressure (MAP) in mmHg - calculated from BP */
    map?: number;
  };

  // --- Inpatient fields (optional — only set on admission/ward round pages) ---

  /** Admitting diagnosis text (no PII) */
  admission_diagnosis?: string;
  /** Ward name (e.g., "Medical Ward 1") */
  ward_name?: string;
  /** Bed number (e.g., "B-005") */
  bed_number?: string;
  /** Admission status (ACTIVE, DISCHARGED, etc.) */
  admission_status?: string;
  /** Days since admission */
  length_of_stay_days?: number;
  /** Latest ward round condition (STABLE, IMPROVING, DETERIORATING, CRITICAL) */
  condition_status?: string;
  /** Diet orders for the patient */
  diet?: string;
  /** Special nursing instructions */
  special_instructions?: string;
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
  /** Facility level from user's StaffProfile.primary_facility (KEPH 1–6), falls back to settings */
  facility_level: string | null;
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
  /** The LLM model used for this response (e.g., "gemini-2.5-pro") */
  model?: string;
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
  admission_id?: number | null;
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
  // Labs that were substituted with normal defaults
  defaulted_labs?: string[];
  // Error
  error?: string | null;
}

// =============================================================================
// Widget State
// =============================================================================

/** Widget display state */
export type AIWidgetState = 'minimized' | 'expanded' | 'full-page';

/** TibaBot availability status for the widget indicator */
export type TibaBotAvailability = 'available' | 'degraded' | 'unavailable' | 'loading';

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
  /**
   * When set, clicking this action triggers a dedicated Phase 5 panel
   * instead of sending a chat query. The value identifies which panel
   * to activate (e.g., 'discharge-readiness', 'care-plan', 'lab-interpret',
   * 'cds-evaluate', 'structure-notes').
   */
  panelAction?: string;
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
  /** Which service generated the response */
  service_type?: string;
  /** Service-specific context for quality analysis */
  metadata?: Record<string, unknown>;
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

/** Suggestion workflow that produced an accountable AI action. */
export type AISuggestionType = 'autopopulate' | 'clerking_autocomplete' | 'mode_change';

/** Suggestion action recorded for accountability. */
export type AISuggestionEventType = 'accepted' | 'applied' | 'acknowledged';

/** A single accepted or applied suggestion audit item. */
export interface AISuggestionAuditItem {
  suggestion_id?: string;
  field_name: string;
  source: AISuggestionSource;
  confidence?: number;
  accepted_value?: unknown;
}

/** Request body for POST /api/ai/suggestion-audit/. */
export interface AISuggestionAuditRequest {
  suggestion_type: AISuggestionType;
  event_type: AISuggestionEventType;
  suggestions: AISuggestionAuditItem[];
  note_format?: 'soap' | 'sbar';
  encounter_type?: string;
}

/** Response from POST /api/ai/suggestion-audit/. */
export interface AISuggestionAuditResponse {
  status: string;
  message: string;
  logged_count: number;
}

// =============================================================================
// Phase 4a — Smart Autopopulate
// =============================================================================

/** Source of an autopopulate suggestion */
export type AISuggestionSource = 'ai' | 'cds' | 'history';

/** A single field suggestion from AI autopopulate */
export interface AIAutopopulateSuggestedField {
  /** Target form field (e.g., "assessment", "primary_diagnosis") */
  field_name: string;
  /** Suggested value — string, object, or array */
  value?: unknown;
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** Clinical reasoning for this suggestion */
  reason?: string;
  /** Origin of the suggestion */
  source: AISuggestionSource;
}

/** Request body for POST /api/ai/autopopulate/ */
export interface AIAutopopulateRequest {
  chief_complaint?: string;
  vitals?: {
    spo2?: number;
    pulse?: number;
    temperature?: number;
    rr?: number;
    map?: number;
  };
  patient_age?: number;
  patient_sex?: string;
  allergies?: string[];
  current_medications?: string[];
  clinical_notes?: string;
  encounter_type?: string;
}

/** Response from POST /api/ai/autopopulate/ */
export interface AIAutopopulateResponse {
  suggested_fields: AIAutopopulateSuggestedField[];
  icd10_suggestions?: AIICD10Suggestion[];
  error?: string | null;
}

// =============================================================================
// Phase 5 — Lab Assist
// =============================================================================

/** A single lab result for interpretation */
export interface AILabResultItem {
  /** Standardized test name (e.g., "serum_creatinine", "hemoglobin") */
  test_name: string;
  /** Numeric result value */
  value: number;
  /** Unit of measurement (e.g., "mg/dL", "mmol/L") */
  unit: string;
  /** When the sample was collected */
  timestamp?: string;
}

/** Request body for POST /api/ai/lab/interpret/ */
export interface AILabInterpretRequest {
  lab_result_id?: number | null;
  encounter_id?: number | null;
  patient_age: number;
  patient_sex: 'male' | 'female';
  is_pregnant?: boolean;
  gestational_weeks?: number | null;
  lab_results: AILabResultItem[];
  diagnoses?: string[];
}

/** A flagged lab result with reference range info */
export interface AILabFlag {
  test_name: string;
  value: number;
  unit: string;
  /** normal, high, low, critical_high, critical_low, or unknown */
  status: string;
  /** String (e.g. "70-100 mg/dL") or legacy object format */
  reference_range?: string | { low?: number; high?: number; unit?: string } | null;
  deviation_percent?: number | null;
  /** Percentage deviation from normal range (TibaBot v2 field) */
  delta_from_normal_pct?: number | null;
  message?: string;
}

/** A detected multi-lab pattern */
export interface AILabPattern {
  pattern_name: string;
  significance: 'critical' | 'significant' | 'monitor';
  confidence: number;
  description?: string;
  contributing_tests?: string[];
}

/** Response from POST /api/ai/lab/interpret/ */
export interface AILabInterpretResponse {
  flags: AILabFlag[];
  patterns?: AILabPattern[];
  interpretation_summary?: string;
  suggested_followup_labs?: string[];
  critical_alerts?: string[];
  /** 'tibabot' or 'fallback' */
  mode?: string;
  error?: string | null;
}

// =============================================================================
// Phase 5 — Discharge Readiness
// =============================================================================

/** A vitals snapshot for discharge assessment */
export interface AIVitalsSnapshot {
  timestamp: string;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
}

/** Request body for POST /api/ai/discharge/assess/ */
export interface AIDischargeAssessRequest {
  admission_id?: number | null;
  patient_age: number;
  primary_diagnosis: string;
  admission_type?: 'medical' | 'surgical' | 'obstetric' | 'pediatric';
  days_admitted: number;
  vitals_history?: AIVitalsSnapshot[];
  lab_results?: AILabResultItem[];
  current_medications?: string[];
  can_ambulate?: boolean | null;
  can_tolerate_oral?: boolean | null;
  has_follow_up_arranged?: boolean;
  has_caregiver_at_home?: boolean | null;
  /** NHIF/SHA coverage (Kenya-specific) */
  has_nhif_or_sha?: boolean | null;
  /** CHW referral arranged (Kenya-specific) */
  chw_referral_made?: boolean | null;
}

/** A single discharge criterion evaluation */
export interface AIDischargeCriterion {
  name: string;
  /** Raw field from TibaBot (aliased to name) */
  criterion?: string;
  /** vitals, labs, functional, medication, social, follow_up */
  category: string;
  met: boolean;
  details?: string | null;
  current_value?: string | null;
  target_value?: string | null;
  notes?: string | null;
}

/** Response from POST /api/ai/discharge/assess/ */
export interface AIDischargeAssessResponse {
  readiness_score: number;
  readiness_level: 'ready' | 'near_ready' | 'not_ready';
  criteria: AIDischargeCriterion[];
  unmet_criteria_count: number;
  readmission_risk?: number | null;
  readmission_risk_level?: string | null;
  recommendations?: string[];
  /** 'stable', 'improving', or 'unstable' */
  vitals_stability?: string | null;
  mode?: string;
  error?: string | null;
}

/** Response from GET /api/ai/discharge/conditions/ */
export interface AIDischargeConditionsResponse {
  conditions: string[];
  count: number;
}

// =============================================================================
// Phase 5 — Care Plan Generator
// =============================================================================

/** Request body for POST /api/ai/care-plan/generate/ */
export interface AICarePlanGenerateRequest {
  encounter_id?: number | null;
  admission_id?: number | null;
  primary_diagnosis?: string;
  chief_complaint?: string;
  icd10_code?: string;
  severity?: string;
  comorbidities?: string[];
  patient_age: number;
  patient_sex: 'male' | 'female';
  is_pregnant?: boolean;
  /** Kenya facility level (H1-H5) */
  facility_level?: string;
  allergies?: string[];
  current_medications?: string[];
  vitals?: Record<string, number>;
  lab_results?: AILabResultItem[];
}

/** A care plan goal */
export interface AICarePlanGoal {
  /** Goal ID (e.g. "G1") */
  id?: string;
  description: string;
  /** Target outcome (e.g. "Afebrile for 48h, WBC normalizing") */
  target?: string;
  priority: 'high' | 'medium' | 'low';
  timeframe?: string;
  measurable_target?: string;
}

/** A single intervention action */
export interface AICarePlanInterventionItem {
  action: string;
  frequency?: string;
  rationale?: string;
  /** Duration of the intervention (e.g. "3 days IV then step-down") */
  duration?: string;
  /** Monitoring instructions (e.g. "Temperature q6h") */
  monitoring?: string;
  /** When to start (e.g. "Start within 4 hours of admission") */
  timing?: string;
  /** Escalation criteria (e.g. "No improvement at 48h → consider broader coverage") */
  escalation?: string;
}

/** Interventions grouped by category */
export interface AICarePlanInterventionCategory {
  /** medications, investigations, nursing, nutrition, patient_education, rehabilitation, referrals */
  category: string;
  items: AICarePlanInterventionItem[];
}

/** Follow-up instructions */
export interface AICarePlanFollowUp {
  timing?: string;
  appointment?: string;
  instructions?: string;
  /** Recommended follow-up investigations (e.g. "Repeat CXR at 6 weeks") */
  investigations?: string;
  red_flags?: string[];
}

/** Response from POST /api/ai/care-plan/generate/ */
export interface AICarePlanResponse {
  primary_diagnosis: string;
  icd10_code?: string | null;
  severity?: string | null;
  goals: AICarePlanGoal[];
  interventions: AICarePlanInterventionCategory[];
  discharge_criteria?: string[];
  follow_up?: AICarePlanFollowUp | null;
  references?: string[];
  cds_alerts?: Record<string, unknown>[];
  facility_level_notes?: string[];
  template_used?: string | null;
  mode?: string;
  llm_enriched?: boolean;
  evidence_sources?: string[];
  error?: string | null;
}

/** Response from GET /api/ai/care-plan/conditions/ */
export interface AICarePlanConditionsResponse {
  conditions: { key: string; name: string; description?: string }[];
  count: number;
}

// =============================================================================
// Phase 5 — Clerking Assist
// =============================================================================

/** Request body for POST /api/ai/clerking/autocomplete/ */
export interface AIClerkingAutocompleteRequest {
  text: string;
  field_name: string;
  note_format?: 'soap' | 'sbar';
  patient_context?: AIPatientContext;
}

/** A single autocomplete suggestion */
export interface AIClerkingAutocompleteSuggestion {
  text: string;
  confidence: number;
  category?: string;
}

/** Response from POST /api/ai/clerking/autocomplete/ */
export interface AIClerkingAutocompleteResponse {
  suggestions: AIClerkingAutocompleteSuggestion[];
  mode?: string;
  error?: string | null;
}

/** Request body for POST /api/ai/clerking/structure/ */
export interface AIClerkingStructureRequest {
  free_text: string;
  note_format?: 'soap' | 'sbar';
}

/** An extracted diagnosis from structured note parsing */
export interface AIClerkingExtractedDiagnosis {
  diagnosis: string;
  icd10_code: string;
  confidence: number;
}

/** Response from POST /api/ai/clerking/structure/ */
export interface AIClerkingStructureResponse {
  structured_note: Record<string, string>;
  sections: string[];
  original_text: string;
  /** Diagnoses extracted from the free text with ICD-10 codes */
  extracted_diagnoses?: AIClerkingExtractedDiagnosis[];
  /** Medications identified in the free text */
  extracted_medications?: string[];
  /** Suggested investigations based on the clinical presentation */
  suggested_investigations?: string[];
  /** How complete the structured note is (0.0-1.0) */
  completeness_score?: number;
  /** Sections that could not be populated from the input */
  missing_sections?: string[];
  mode?: string;
  error?: string | null;
}

// =============================================================================
// Phase 5 — Enhanced CDS Evaluation
// =============================================================================
// Phase 6 — Clinical Document Generation
// =============================================================================

export type ClinicalDocumentType = 'discharge_summary' | 'soap' | 'progress_note' | 'referral_letter' | 'clerking_note';
export type ClinicalDocOutputFormat = 'markdown' | 'structured' | 'fhir';
export type ClinicalDocGenerationMode = 'suggest' | 'generate';
export type ClinicalDocDischargeType = 'NORMAL' | 'AMA' | 'TRANSFER' | 'DEATH' | 'DAMA';
export type ClinicalDocDischargeLayout = 'STANDARD' | 'STRUCTURED' | 'MINIMAL';

export interface ClinicalDocTemplateSectionConfig {
  key: string;
  label: string;
  enabled: boolean;
}

export interface ClinicalDocMedicationEntry {
  drug_name: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
}

export interface ClinicalDocPatientContext {
  patient_age: number;
  patient_sex: string;
  allergies?: string[];
  comorbidities?: string[];
  current_medications?: string[];
  facility_level?: number | null;
}

export interface ClinicalDocAdmissionContext {
  primary_diagnosis: string;
  icd10_code?: string;
  secondary_diagnoses?: string[];
  admission_date?: string;
  discharge_date?: string;
  length_of_stay_days?: number | null;
  ward?: string;
  discharge_type?: ClinicalDocDischargeType;
  procedures_performed?: string[];
  medications_given?: (string | ClinicalDocMedicationEntry)[];
  discharge_medications?: (string | ClinicalDocMedicationEntry)[];
  key_investigations?: string[];
  complications?: string[];
  condition_at_discharge?: string;
  follow_up_instructions?: string;
  clinical_notes?: string[];
}

export interface ClinicalDocVitals {
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  heart_rate?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
}

export interface ClinicalDocEncounterContext {
  chief_complaint?: string;
  clinical_notes?: string;
  vitals?: ClinicalDocVitals;
  hpi?: string;
  examination_findings?: string;
}

export interface ClinicalDocFacilityContext {
  level?: number | null;
  county?: string;
}

/** Request body for POST /api/ai/clinical/document/ */
export interface AIClinicalDocumentRequest {
  document_type: ClinicalDocumentType;
  patient_context: ClinicalDocPatientContext;
  admission_context: ClinicalDocAdmissionContext;
  encounter_context?: ClinicalDocEncounterContext;
  facility_context?: ClinicalDocFacilityContext;
  output_format?: ClinicalDocOutputFormat;
  include_icd10_codes?: boolean;
  generation_mode?: ClinicalDocGenerationMode;
  additional_instructions?: string;
  system_instruction?: string;
  /** Selects TibaBot's built-in layout matching DischargeTemplate.layout */
  discharge_layout?: ClinicalDocDischargeLayout;
  /** Pass the template's sections array for full control over section generation */
  template_sections?: ClinicalDocTemplateSectionConfig[];
}

export interface ClinicalDocSection {
  section_id: string;
  title: string;
  content: string;
}

export interface ClinicalDocICD10Suggestion {
  code: string;
  description: string;
  confidence: number;
}

export interface ClinicalDocCitation {
  source: string;
  section?: string;
}

/** Response from POST /api/ai/clinical/document/ */
export interface AIClinicalDocumentResponse {
  document_type: string;
  sections: ClinicalDocSection[];
  full_text: string;
  suggested_icd10_codes?: ClinicalDocICD10Suggestion[] | null;
  safety_alerts?: (string | Record<string, unknown>)[] | null;
  has_safety_concerns?: boolean;
  citations?: ClinicalDocCitation[];
  fhir_resource?: Record<string, unknown> | null;
  processing_time_ms?: number;
  model_used?: string;
  disclaimer?: string;
  generation_mode?: string;
  section_provenance?: Record<string, string>;
  mode?: string;
  error?: string | null;
}

// =============================================================================
// Phase 5 — Enhanced CDS Evaluation
// =============================================================================

/** Request body for POST /api/ai/cds/evaluate/ */

export interface AICDSEvaluateRequest {
  encounter_id?: number | null;
  medications?: string[];
  diagnoses?: string[];
  symptoms?: string[];
  pending_procedures?: string[];
  lab_results?: Record<string, number>;
  allergies?: string[];
  patient_age?: number | null;
  patient_sex?: 'male' | 'female' | null;
  is_pregnant?: boolean;
  region?: string;
  facility_level?: string;
}

/** A single CDS alert from TibaBot evaluation */
export interface AICDSAlertItem {
  rule_id?: string;
  /** Human-readable rule name (e.g. "Warfarin + Aspirin interaction") */
  rule_name?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** drug-interaction, contraindication, protocol-adherence, lab-critical, dosing, formulary */
  category: string;
  title: string;
  message: string;
  recommendation?: string;
  /** Clinical guideline reference (e.g. "KEML 2023, BNF Drug Interactions") */
  reference?: string | null;
  evidence_level?: string;
  /** Supporting evidence text snippets */
  evidence_snippets?: string[];
}

/** Response from POST /api/ai/cds/evaluate/ */
export interface AICDSEvaluateResponse {
  alerts: AICDSAlertItem[];
  recommendations?: AICDSAlertItem[];
  rules_evaluated: number;
  rules_fired: number;
  processing_time_ms: number;
  mode?: string;
  error?: string | null;
}

// =============================================================================
// Stored AI Result Types (persisted panel outputs)
// =============================================================================

/** Base fields shared by all stored AI results */
export interface StoredAIResultBase {
  id: string;
  result_data: Record<string, unknown>;
  service_mode: string;
  created_at: string;
  created_by: string;
}

/** Stored care plan result */
export interface StoredCarePlanResult extends StoredAIResultBase {
  encounter_id: number | null;
  admission_id: number | null;
  primary_diagnosis: string;
}

/** Stored CDS evaluation result */
export interface StoredCDSResult extends StoredAIResultBase {
  encounter_id: number | null;
  rules_fired: number;
  alert_count: number;
}

/** Stored lab interpretation result */
export interface StoredLabInterpretResult extends StoredAIResultBase {
  lab_result_id: number | null;
  encounter_id: number | null;
  abnormal_count: number;
  critical_count: number;
}

/** Stored discharge readiness result */
export interface StoredDischargeResult extends StoredAIResultBase {
  admission_id: number | null;
  readiness_level: string;
  readiness_score: number | null;
}

/** Stored ICU risk result */
export interface StoredICURiskResult extends StoredAIResultBase {
  admission_id: number | null;
  prediction_type: string;
  risk_level: string;
  risk_score: number | null;
}

// =============================================================================
// Phase 7 — Surgical Assistant
// =============================================================================

export interface AISurgicalRiskScores {
  asa?: Record<string, unknown>;
  rcri?: Record<string, unknown>;
  caprini?: Record<string, unknown>;
  mallampati?: Record<string, unknown>;
  overall_risk_level?: string;
  alerts?: string[];
  recommendations?: string[];
  [key: string]: unknown;
}

export interface AISurgicalPreOpAssessRequest {
  surgery_case_id: number;
  procedure_key?: string;
  age: number;
  sex: 'male' | 'female';
  asa_class: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  urgency?: 'elective' | 'urgent' | 'emergency';
  high_risk_surgery?: boolean;
  ischemic_heart_disease?: boolean;
  congestive_heart_failure?: boolean;
  cerebrovascular_disease?: boolean;
  insulin_dependent_diabetes?: boolean;
  creatinine_above_2?: boolean;
  caprini_factors?: string[];
  mallampati_class?: 'I' | 'II' | 'III' | 'IV' | null;
  facility_level?: string;
  include_fhir?: boolean;
}

export interface AISurgicalPreOpAssessResponse {
  risk_scores: AISurgicalRiskScores;
  procedure_template?: Record<string, unknown> | null;
  facility_capable?: boolean | null;
  facility_alert?: string | null;
  cds_alerts?: Record<string, unknown>[];
  fhir_risk_assessment?: Record<string, unknown> | null;
  stored_id?: string;
  mode?: string;
  error?: string | null;
}

export interface AISurgicalChecklistSession {
  id?: string;
  state?: string;
  items?: string[];
  [key: string]: unknown;
}

export interface AISurgicalChecklistProgress {
  current_phase?: string;
  total_items?: number;
  total_checked?: number;
  percent_complete?: number;
  [key: string]: unknown;
}

export interface AISurgicalChecklistStartRequest {
  surgery_case_id: number;
  procedure_key: string;
  patient_id: string;
}

export interface AISurgicalChecklistAdvanceRequest {
  checked_items?: string[];
  notes?: Record<string, unknown>;
  checked_by?: string;
}

export interface AISurgicalChecklistSessionResponse {
  session?: AISurgicalChecklistSession;
  progress?: AISurgicalChecklistProgress;
  message?: string;
  phase_complete?: boolean;
  unchecked_critical_items?: string[];
  stored_id?: string;
  tibabot_session_id?: string;
  mode?: string;
  error?: string | null;
}

export interface AISurgicalPostOpCarePlanRequest {
  surgery_case_id: number;
  procedure_key: string;
  estimated_blood_loss_ml?: number;
  lowest_heart_rate?: number;
  lowest_map?: number;
  findings?: string;
  complications_intraop?: string[];
  drain_placed?: boolean;
  stoma_formed?: boolean;
  caprini_score?: number;
  include_fhir?: boolean;
}

export interface AISurgicalApgar {
  score?: number;
  risk_level?: string;
  complication_rate?: string;
  [key: string]: unknown;
}

export interface AISurgicalFollowUp {
  timing?: string;
  actions?: string[];
  [key: string]: unknown;
}

export interface AISurgicalPostOpCarePlanResponse {
  procedure_key: string;
  procedure_name?: string;
  surgical_apgar?: AISurgicalApgar | null;
  monitoring?: string;
  medications?: string[];
  activity?: string;
  nutrition?: string;
  wound_care?: string;
  complications_to_watch?: Record<string, unknown>[];
  discharge_criteria?: string[];
  follow_up?: AISurgicalFollowUp | null;
  cds_alerts?: Record<string, unknown>[];
  fhir_care_plan?: Record<string, unknown> | null;
  stored_id?: string;
  mode?: string;
  error?: string | null;
}

export interface AISurgicalProcedureTemplate {
  key: string;
  name?: string;
  display_name?: string;
  specialty?: string;
  min_facility_level?: string;
  urgency_categories?: string[];
  icd10_code?: string;
}

export interface AISurgicalProcedureListResponse {
  procedures?: AISurgicalProcedureTemplate[];
  results?: AISurgicalProcedureTemplate[];
  error?: string | null;
}

export interface StoredSurgicalPreOpAssessResult extends StoredAIResultBase {
  surgery_case_id: number | null;
  overall_risk_level: string;
  facility_capable: boolean | null;
}

export interface StoredSurgicalChecklistSessionResult extends StoredAIResultBase {
  surgery_case_id: number | null;
  tibabot_session_id: string;
  current_phase: string;
  percent_complete: number | null;
  phase_complete: boolean;
}

export interface StoredSurgicalPostOpCarePlanResult extends StoredAIResultBase {
  surgery_case_id: number | null;
  procedure_key: string;
  surgical_apgar_score: number | null;
  risk_level: string;
}

// =============================================================================
// Investigation Suggestions
// =============================================================================

/** Request body for POST /api/ai/investigations/suggest/ */
export interface AIInvestigationSuggestRequest {
  chief_complaint?: string;
  diagnoses?: string[];
  symptoms?: string[];
  existing_orders?: string[];
  existing_results?: Record<string, unknown>;
  patient_age?: number;
  patient_sex?: 'M' | 'F';
  is_pregnant?: boolean;
  facility_level?: string;
  region?: string;
  include_fhir?: boolean;
  max_suggestions?: number;
  encounter_id?: number;
}

/** A single investigation suggestion from TibaBot */
export interface AIInvestigationSuggestion {
  name: string;
  category: string;
  priority: 'stat' | 'urgent' | 'routine';
  rationale: string;
  timing?: string;
  loinc_code?: string | null;
  loinc_display?: string | null;
  source?: string;
  condition_key?: string;
  min_facility_level?: string;
}

/** Response from POST /api/ai/investigations/suggest/ */
export interface AIInvestigationSuggestResponse {
  suggestions: AIInvestigationSuggestion[];
  fhir_service_requests?: Record<string, unknown>[] | null;
  matched_conditions: string[];
  cds_alerts_applied: number;
  total_suggestions: number;
  disclaimer: string;
  mode?: string;
  stored_id?: string;
}

/** Stored investigation suggestion result */
export interface StoredInvestigationSuggestResult extends StoredAIResultBase {
  encounter_id: number | null;
  matched_conditions: string[];
  suggestion_count: number;
}

// =============================================================================
// AI Advisory → Order Links
// =============================================================================

/** Status of an advisory suggestion link */
export type AIAdvisoryOrderLinkStatus = 'SUGGESTED' | 'ORDERED' | 'DECLINED' | 'NOT_APPLICABLE';

/** AI result type identifier for seeding */
export type AIAdvisoryResultType = 'pre_op_assessment' | 'post_op_care_plan';

/** A single advisory suggestion linked (or not yet) to a clinical order */
export interface AIAdvisoryOrderLink {
  id: number;
  ai_result_id: string;
  suggestion_category: string;
  suggestion_index: number;
  suggestion_text: string;
  status: AIAdvisoryOrderLinkStatus;
  lab_order_id: number | null;
  imaging_order_id: number | null;
  prescription_id: number | null;
  order_number: string | null;
  actioned_by: number | null;
  actioned_at: string | null;
  created_at: string;
}

/** Request body for POST /api/ai/advisory-links/ (seed suggestions) */
export interface AIAdvisoryBulkSeedRequest {
  ai_result_id: string;
  ai_result_type: AIAdvisoryResultType;
}

/** Response from POST /api/ai/advisory-links/ (seed) */
export interface AIAdvisoryBulkSeedResponse {
  created: number;
  total: number;
  links: AIAdvisoryOrderLink[];
}

/** Request body for PATCH /api/ai/advisory-links/<id>/action/ */
export interface AIAdvisoryOrderLinkActionRequest {
  status: 'ORDERED' | 'DECLINED' | 'NOT_APPLICABLE';
  lab_order_id?: number;
  imaging_order_id?: number;
  prescription_id?: number;
}

/** Response from GET /api/ai/advisory-links/has-orders/ */
export interface AIAdvisoryHasOrdersResponse {
  has_orders: boolean;
}

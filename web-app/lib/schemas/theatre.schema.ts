/**
 * Zod schemas for Theatre API response validation
 *
 * Implements validation for all theatre-related API responses.
 * Types are derived from these schemas using z.infer<> — see exports at bottom.
 *
 * @see backend/hmis/apps/theatre/serializers.py
 * @see backend/hmis/apps/theatre/models.py
 */
import { z } from 'zod';

// =============================================================================
// ENUM VALUE CONSTANTS
// =============================================================================

export const THEATRE_TYPES = [
  'GENERAL', 'ORTHO', 'CARDIAC', 'NEURO', 'EYE',
  'ENT', 'OBSTETRIC', 'PEDIATRIC', 'EMERGENCY', 'MINOR',
] as const;

export const CASE_STATUSES = [
  'REQUESTED', 'SCHEDULED', 'PRE_OP', 'IN_THEATRE', 'IN_SURGERY',
  'IN_PACU', 'DISCHARGED', 'POSTPONED', 'CANCELLED',
] as const;

export const PRIORITIES = ['ELECTIVE', 'URGENT', 'EMERGENCY'] as const;

export const ASA_CLASSES = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

export const ANESTHESIA_TYPES = [
  'GENERAL', 'SPINAL', 'EPIDURAL', 'REGIONAL', 'LOCAL', 'SEDATION', 'COMBINED',
] as const;

export const LATERALITIES = ['LEFT', 'RIGHT', 'BILATERAL', 'NA'] as const;

export const TEAM_ROLES = [
  'LEAD_SURGEON', 'ASSISTANT_SURGEON', 'ANESTHESIOLOGIST',
  'ANESTHESIA_ASSISTANT', 'SCRUB_NURSE', 'CIRCULATING_NURSE',
  'SCRUB_TECH', 'PERFUSIONIST', 'OTHER',
] as const;

export const PACU_DESTINATIONS = ['WARD', 'ICU', 'HDU', 'DAY_CASE', 'MORGUE'] as const;

// =============================================================================
// HELPERS
// =============================================================================

function caseInsensitiveEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(values));
}

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const TheatreTypeSchema = caseInsensitiveEnum(THEATRE_TYPES);
export const CaseStatusSchema = caseInsensitiveEnum(CASE_STATUSES);
export const PrioritySchema = caseInsensitiveEnum(PRIORITIES);
export const ASAClassSchema = z.enum(ASA_CLASSES).or(z.literal(''));
export const AnesthesiaTypeSchema = z.enum(ANESTHESIA_TYPES).or(z.literal(''));
export const LateralitySchema = caseInsensitiveEnum(LATERALITIES);
export const TeamRoleSchema = caseInsensitiveEnum(TEAM_ROLES);
export const PACUDestinationSchema = caseInsensitiveEnum(PACU_DESTINATIONS);

// =============================================================================
// OPERATING THEATRE
// =============================================================================

export const OperatingTheatreListSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  theatre_type: TheatreTypeSchema,
  location: z.string(),
  is_active: z.boolean(),
  operating_hours_start: z.string(),
  operating_hours_end: z.string(),
  slot_duration_minutes: z.number(),
});

export const OperatingTheatreDetailSchema = OperatingTheatreListSchema.extend({
  facility: z.number(),
  organization: z.number().nullable(),
  has_laminar_flow: z.boolean(),
  has_cath_lab: z.boolean(),
  has_image_intensifier: z.boolean(),
  equipment_notes: z.string(),
  maintenance_notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// SURGICAL TEAM MEMBER
// =============================================================================

export const SurgicalTeamMemberSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  staff_member: z.number(),
  staff_name: z.string(),
  role: TeamRoleSchema,
  scrub_in_time: z.string().nullable().optional(),
  scrub_out_time: z.string().nullable().optional(),
  notes: z.string(),
  created_at: z.string(),
});

// =============================================================================
// SURGERY CASE
// =============================================================================

export const SurgeryCaseListSchema = z.object({
  id: z.number(),
  case_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  primary_procedure: z.number(),
  primary_procedure_name: z.string(),
  theatre: z.number(),
  theatre_name: z.string(),
  scheduled_date: z.string(),
  scheduled_start_time: z.string(),
  estimated_duration_minutes: z.number(),
  status: CaseStatusSchema,
  priority: PrioritySchema,
  asa_class: ASAClassSchema,
  anesthesia_type: AnesthesiaTypeSchema,
  laterality: LateralitySchema,
  requested_at: z.string(),
});

export const SurgeryCaseDetailSchema = SurgeryCaseListSchema.extend({
  encounter: z.number().nullable().optional(),
  admission: z.number().nullable().optional(),
  additional_procedures: z.array(z.number()),
  procedure_notes: z.string(),
  theatre_code: z.string(),
  diagnosis: z.string(),
  status_changed_at: z.string().nullable().optional(),
  status_changed_by: z.number().nullable().optional(),
  cancellation_reason: z.string(),
  postponed_to_date: z.string().nullable().optional(),
  requesting_doctor: z.number(),
  requesting_doctor_name: z.string(),
  total_charges: z.string(),
  is_billable: z.boolean(),
  facility: z.number(),
  organization: z.number().nullable(),
  team_members: z.array(SurgicalTeamMemberSchema),
  has_who_checklist: z.boolean(),
  has_operative_note: z.boolean(),
  has_anesthesia_record: z.boolean(),
  has_pacu_record: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// WHO SAFETY CHECKLIST
// =============================================================================

export const WHOChecklistSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  // Sign-In
  sign_in_completed_at: z.string().nullable().optional(),
  sign_in_completed_by: z.number().nullable().optional(),
  patient_identity_confirmed: z.boolean(),
  procedure_site_marked: z.boolean(),
  consent_signed: z.boolean(),
  anesthesia_machine_checked: z.boolean(),
  pulse_oximeter_attached: z.boolean(),
  allergies_reviewed: z.boolean(),
  allergy_notes: z.string(),
  difficult_airway_risk: z.boolean(),
  aspiration_risk: z.boolean(),
  airway_equipment_available: z.boolean(),
  blood_loss_risk: z.string(),
  iv_access_adequate: z.boolean(),
  blood_products_available: z.boolean(),
  // Time-Out
  time_out_completed_at: z.string().nullable().optional(),
  time_out_completed_by: z.number().nullable().optional(),
  team_members_introduced: z.boolean(),
  patient_name_confirmed: z.boolean(),
  procedure_confirmed: z.boolean(),
  site_confirmed: z.boolean(),
  surgeon_critical_steps_discussed: z.boolean(),
  anesthesia_concerns_discussed: z.boolean(),
  nursing_concerns_discussed: z.boolean(),
  prophylactic_antibiotics_given: z.boolean(),
  antibiotics_timing_within_60_min: z.boolean(),
  antibiotics_not_applicable: z.boolean(),
  essential_imaging_displayed: z.boolean(),
  imaging_not_applicable: z.boolean(),
  // Sign-Out
  sign_out_completed_at: z.string().nullable().optional(),
  sign_out_completed_by: z.number().nullable().optional(),
  procedure_name_recorded: z.boolean(),
  instrument_count_correct: z.boolean(),
  sponge_count_correct: z.boolean(),
  needle_count_correct: z.boolean(),
  specimens_labeled: z.boolean(),
  specimen_count: z.number(),
  equipment_problems_noted: z.boolean(),
  equipment_problems_description: z.string(),
  key_recovery_concerns: z.string(),
  // Computed
  sign_in_complete: z.boolean(),
  time_out_complete: z.boolean(),
  sign_out_complete: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// ANESTHESIA RECORD
// =============================================================================

export const AnesthesiaRecordSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  anesthesiologist: z.number(),
  anesthesiologist_name: z.string(),
  mallampati_class: z.string(),
  mouth_opening: z.string(),
  neck_mobility: z.string(),
  dentition_notes: z.string(),
  last_solid_food: z.string().nullable().optional(),
  last_clear_fluids: z.string().nullable().optional(),
  npo_confirmed: z.boolean(),
  premedication_given: z.string(),
  anesthesia_consent_obtained: z.boolean(),
  risks_explained: z.boolean(),
  anesthesia_type: AnesthesiaTypeSchema.or(z.literal('')),
  induction_agent: z.string(),
  induction_time: z.string().nullable().optional(),
  intubation_time: z.string().nullable().optional(),
  airway_device: z.string(),
  tube_size: z.string(),
  cuff_pressure: z.string(),
  breathing_circuit: z.string(),
  ventilation_mode: z.string(),
  maintenance_agent: z.string(),
  muscle_relaxant: z.string(),
  analgesic: z.string(),
  fluids_given: z.string(),
  blood_products: z.string(),
  urine_output: z.string(),
  estimated_blood_loss: z.string(),
  intraop_complications: z.string(),
  extubation_time: z.string().nullable().optional(),
  reversal_agent: z.string(),
  pain_management_plan: z.string(),
  nausea_prevention: z.string(),
  dvt_prophylaxis: z.string(),
  other_post_op_orders: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// INTRA-OP VITAL READING
// =============================================================================

export const IntraOpVitalSchema = z.object({
  id: z.number(),
  anesthesia_record: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number().nullable().optional(),
  systolic_bp: z.number().nullable().optional(),
  diastolic_bp: z.number().nullable().optional(),
  heart_rate: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
  spo2: z.number().nullable().optional(),
  etco2: z.number().nullable().optional(),
  fio2: z.number().nullable().optional(),
  tidal_volume: z.number().nullable().optional(),
  peak_pressure: z.number().nullable().optional(),
  temperature: z.string().nullable().optional(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// OPERATIVE NOTE
// =============================================================================

export const OperativeNoteSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  dictated_by: z.number(),
  dictated_by_name: z.string(),
  incision_time: z.string().nullable().optional(),
  closure_time: z.string().nullable().optional(),
  pre_operative_diagnosis: z.string(),
  post_operative_diagnosis: z.string(),
  procedure_performed: z.string(),
  findings: z.string(),
  technique_description: z.string(),
  implants_used: z.string(),
  drains_placed: z.string(),
  sutures_used: z.string(),
  estimated_blood_loss: z.string(),
  specimens_sent: z.string(),
  frozen_section: z.boolean(),
  frozen_section_result: z.string(),
  intraoperative_complications: z.string(),
  post_operative_plan: z.string(),
  signed_at: z.string().nullable().optional(),
  signed_by: z.number().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// THEATRE CONSUMABLE
// =============================================================================

export const TheatreConsumableSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  item: z.number(),
  item_name: z.string(),
  lot_number: z.string(),
  expiry_date: z.string().nullable().optional(),
  quantity_used: z.number(),
  unit_cost: z.string(),
  is_implant: z.boolean(),
  implant_serial_number: z.string(),
  facility: z.number(),
  organization: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// PACU VITAL READING
// =============================================================================

export const PACUVitalSchema = z.object({
  id: z.number(),
  pacu_record: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number().nullable().optional(),
  systolic_bp: z.number().nullable().optional(),
  diastolic_bp: z.number().nullable().optional(),
  heart_rate: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
  spo2: z.number().nullable().optional(),
  temperature: z.string().nullable().optional(),
  aldrete_score: z.number().nullable().optional(),
  pain_score: z.number().nullable().optional(),
  sedation_level: z.string(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// PACU RECORD
// =============================================================================

export const PACURecordSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  arrival_time: z.string(),
  arriving_nurse: z.number().nullable().optional(),
  initial_aldrete_score: z.number().nullable().optional(),
  initial_pain_score: z.number().nullable().optional(),
  discharge_time: z.string().nullable().optional(),
  discharge_aldrete_score: z.number().nullable().optional(),
  discharge_destination: z.string(),
  discharge_notes: z.string(),
  vital_readings: z.array(PACUVitalSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// PAGINATED WRAPPERS
// =============================================================================

export const PaginatedOperatingTheatreSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(OperatingTheatreListSchema),
});

export const PaginatedSurgeryCaseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SurgeryCaseListSchema),
});

// =============================================================================
// TYPE EXPORTS (inferred from schemas)
// =============================================================================

export type TheatreType = z.infer<typeof TheatreTypeSchema>;
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type ASAClass = z.infer<typeof ASAClassSchema>;
export type AnesthesiaType = z.infer<typeof AnesthesiaTypeSchema>;
export type Laterality = z.infer<typeof LateralitySchema>;
export type TeamRole = z.infer<typeof TeamRoleSchema>;
export type PACUDestination = z.infer<typeof PACUDestinationSchema>;

export type OperatingTheatreList = z.infer<typeof OperatingTheatreListSchema>;
export type OperatingTheatreDetail = z.infer<typeof OperatingTheatreDetailSchema>;
export type SurgicalTeamMember = z.infer<typeof SurgicalTeamMemberSchema>;
export type SurgeryCaseList = z.infer<typeof SurgeryCaseListSchema>;
export type SurgeryCaseDetail = z.infer<typeof SurgeryCaseDetailSchema>;
export type WHOChecklist = z.infer<typeof WHOChecklistSchema>;
export type AnesthesiaRecord = z.infer<typeof AnesthesiaRecordSchema>;
export type IntraOpVital = z.infer<typeof IntraOpVitalSchema>;
export type OperativeNote = z.infer<typeof OperativeNoteSchema>;
export type TheatreConsumable = z.infer<typeof TheatreConsumableSchema>;
export type PACUVital = z.infer<typeof PACUVitalSchema>;
export type PACURecord = z.infer<typeof PACURecordSchema>;
export type PaginatedOperatingTheatres = z.infer<typeof PaginatedOperatingTheatreSchema>;
export type PaginatedSurgeryCases = z.infer<typeof PaginatedSurgeryCaseSchema>;

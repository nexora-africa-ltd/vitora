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
  'LEAD_SURGEON',
  'ASSISTANT_SURGEON',
  'ANESTHESIOLOGIST',
  'ANESTHESIA_TECH',
  'CIRCULATING_NURSE',
  'SCRUB_NURSE',
  'SCRUB_TECH',
  'RECOVERY_NURSE',
  'OBSERVER',
] as const;

export const PACU_DESTINATIONS = [
  'WARD',
  'ICU',
  'DAY_CASE_DISCHARGE',
  'EXTENDED_OBSERVATION',
] as const;

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
  scheduling_resource: z.number().nullable(),
  scheduling_resource_name: z.string().nullable().optional(),
  has_resource_schedule: z.boolean(),
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

export const TheatreAvailabilitySlotSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  duration_minutes: z.number(),
  available: z.boolean(),
  blocked_reason: z.string().nullable().optional(),
  conflicting_case_number: z.string().nullable().optional(),
  source: z.enum(['scheduling_resource', 'theatre_hours']),
});

export const TheatreAvailabilitySchema = z.object({
  date: z.string(),
  theatre_id: z.number(),
  theatre_name: z.string(),
  scheduling_resource: z.number().nullable(),
  integration_source: z.enum(['scheduling_resource', 'theatre_hours']),
  has_resource_schedule: z.boolean(),
  slot_duration_minutes: z.number(),
  slots: z.array(TheatreAvailabilitySlotSchema),
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
  patient_date_of_birth: z.string().optional().default(''),
  patient_gender: z.string().optional().default(''),
  primary_procedure: z.number(),
  primary_procedure_name: z.string(),
  primary_procedure_tibabot_key: z.string().optional().default(''),
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
  diagnosis: z.string().optional().default(''),
  encounter: z.number().nullable().optional(),
  status_changed_at: z.string().nullable().optional(),
});

export const AISurgicalCaseSummarySchema = z.object({
  pre_op: z.object({
    has_result: z.boolean(),
    latest_result_id: z.string().nullable(),
    overall_risk_level: z.string(),
    facility_capable: z.boolean().nullable(),
    created_at: z.string().nullable(),
  }),
  checklist: z.object({
    has_session: z.boolean(),
    latest_result_id: z.string().nullable(),
    tibabot_session_id: z.string(),
    current_phase: z.string(),
    percent_complete: z.number().nullable(),
    phase_complete: z.boolean(),
    created_at: z.string().nullable(),
  }),
  post_op: z.object({
    has_result: z.boolean(),
    latest_result_id: z.string().nullable(),
    procedure_key: z.string(),
    surgical_apgar_score: z.number().nullable(),
    risk_level: z.string(),
    created_at: z.string().nullable(),
  }),
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
  theatre_scheduling_resource: z.number().nullable().optional(),
  theatre_has_resource_schedule: z.boolean(),
  ai_surgical_summary: AISurgicalCaseSummarySchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const CaseSchedulingContextMemberSchema = z.object({
  staff_member_id: z.number(),
  role: z.string(),
  staff_resource_id: z.number().nullable(),
  has_staff_resource: z.boolean(),
  has_shift_coverage: z.boolean(),
  room_assignment_match: z.boolean(),
  shift_ids: z.array(z.number()),
  shift_statuses: z.array(z.string()),
  message: z.string(),
});

export const CaseSchedulingContextSchema = z.object({
  case_number: z.string(),
  scheduled_date: z.string(),
  scheduled_start_time: z.string(),
  estimated_duration_minutes: z.number(),
  slot_validation: z.object({
    available: z.boolean(),
    reason: z.string().nullable(),
    source: z.enum(['scheduling_resource', 'theatre_hours']),
    conflicts: z.array(
      z.object({
        case_number: z.string(),
        scheduled_start_time: z.string(),
        estimated_duration_minutes: z.number(),
      })
    ),
  }),
  theatre: z.object({
    id: z.number(),
    code: z.string(),
    name: z.string(),
    scheduling_resource_id: z.number().nullable(),
    scheduling_resource_name: z.string().nullable(),
    has_resource_schedule: z.boolean(),
  }),
  team_summary: z.object({
    total_members: z.number(),
    covered_members: z.number(),
    coverage_complete: z.boolean(),
  }),
  members: z.array(CaseSchedulingContextMemberSchema),
  equipment: z.object({
    total_items: z.number(),
    confirmed_items: z.number(),
    conflict_items: z.number(),
    all_confirmed: z.boolean(),
    has_conflicts: z.boolean(),
    items: z.array(
      z.object({
        requirement_id: z.number(),
        equipment_type: z.string().nullable(),
        resource_name: z.string().nullable(),
        resource_id: z.number().nullable(),
        is_confirmed: z.boolean(),
        reserved_from: z.string(),
        reserved_until: z.string(),
        has_conflict: z.boolean(),
        conflicts: z.array(
          z.object({
            case_number: z.string(),
            case_id: z.number(),
            reserved_from: z.string(),
            reserved_until: z.string(),
            equipment_name: z.string(),
          })
        ),
      })
    ),
  }),
});

// =============================================================================
// THEATRE EQUIPMENT TYPE
// =============================================================================

export const EQUIPMENT_CATEGORIES = [
  'IMAGING', 'MONITORING', 'SURGICAL_INSTRUMENT', 'LIFE_SUPPORT', 'STERILIZATION', 'OTHER',
] as const;

export const EquipmentCategorySchema = caseInsensitiveEnum(EQUIPMENT_CATEGORIES);

export const TheatreEquipmentTypeListSchema = z.object({
  id: z.number(),
  parent: z.number().nullable(),
  parent_name: z.string().nullable(),
  name: z.string(),
  code: z.string(),
  category: EquipmentCategorySchema,
  is_portable: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export const TheatreEquipmentTypeDetailSchema = TheatreEquipmentTypeListSchema.extend({
  description: z.string(),
  setup_time_minutes: z.number(),
  cleanup_time_minutes: z.number(),
  children_count: z.number(),
  full_path: z.string(),
  depth: z.number(),
  updated_at: z.string(),
});

export const CaseEquipmentRequirementSchema = z.object({
  id: z.number(),
  surgery_case: z.number(),
  resource: z.number().nullable(),
  resource_name: z.string().nullable(),
  resource_code: z.string().nullable(),
  equipment_type: z.number().nullable(),
  equipment_type_name: z.string().nullable(),
  equipment_type_category: z.string().nullable(),
  quantity_required: z.number(),
  is_confirmed: z.boolean(),
  reserved_from: z.string(),
  reserved_until: z.string(),
  duration_minutes: z.number(),
  notes: z.string(),
  added_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedTheatreEquipmentTypeSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TheatreEquipmentTypeListSchema),
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
  pre_op_assessment_at: z.string().nullable().optional(),
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
  induction_time: z.string().nullable().optional(),
  intubation_time: z.string().nullable().optional(),
  extubation_time: z.string().nullable().optional(),
  airway_device: z.string(),
  tube_size: z.string(),
  intubation_attempts: z.number(),
  intubation_difficulty: z.string(),
  anesthesia_technique: z.string(),
  induction_agents: z.string(),
  maintenance_agents: z.string(),
  muscle_relaxants: z.string(),
  reversal_agents: z.string(),
  crystalloid_volume: z.number(),
  colloid_volume: z.number(),
  blood_products: z.string(),
  estimated_blood_loss: z.number(),
  urine_output: z.number(),
  intraop_complications: z.string(),
  pacu_handover_at: z.string().nullable().optional(),
  pacu_handover_notes: z.string(),
  pain_management_plan: z.string(),
  post_op_nausea_plan: z.string(),
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
  cvp: z.number().nullable().optional(),
  bis_index: z.number().nullable().optional(),
  tof_count: z.number().nullable().optional(),
  blood_glucose: z.number().nullable().optional(),
  pain_score: z.number().nullable().optional(),
  notes: z.string(),
  alerts: z.array(z.string()).default([]),
  has_critical_vitals: z.boolean().default(false),
  mean_arterial_pressure: z.number().nullable().optional(),
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
  estimated_blood_loss: z.number(),
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
  total_cost: z.string(),
  allocation_count: z.number(),
  source_batches: z.array(z.string()),
  is_implant: z.boolean(),
  implant_serial_number: z.string(),
  facility: z.number(),
  organization: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const TheatreReportRangeSchema = z.object({
  date_from: z.string(),
  date_to: z.string(),
  days: z.number(),
});

export const TheatreReportTotalsSchema = z.object({
  case_count: z.number(),
  completed_case_count: z.number(),
  cancelled_case_count: z.number(),
  urgent_case_count: z.number(),
  active_case_count: z.number(),
  scheduled_minutes: z.number(),
  actual_minutes: z.number(),
  available_minutes: z.number(),
  utilization_percent: z.number(),
  average_case_duration_minutes: z.number(),
  average_daily_throughput: z.number(),
});

export const TheatreReportTurnaroundSchema = z.object({
  cases_with_measurement_count: z.number(),
  average_minutes: z.number(),
});

export const TheatreReportOnTimeStartsSchema = z.object({
  measured_case_count: z.number(),
  on_time_case_count: z.number(),
  late_case_count: z.number(),
  threshold_minutes: z.number(),
  percent: z.number(),
});

export const TheatreReportDaySchema = z.object({
  date: z.string(),
  case_count: z.number(),
  completed_case_count: z.number(),
  scheduled_minutes: z.number(),
});

export const TheatreReportUtilizationByTheatreSchema = z.object({
  theatre_id: z.number(),
  theatre_code: z.string(),
  theatre_name: z.string(),
  case_count: z.number(),
  completed_case_count: z.number(),
  cancelled_case_count: z.number(),
  scheduled_minutes: z.number(),
  actual_minutes: z.number(),
  available_minutes: z.number(),
  utilization_percent: z.number(),
  average_case_duration_minutes: z.number(),
  turnaround_average_minutes: z.number(),
});

export const TheatreReportStatusBreakdownSchema = z.object({
  status: z.string(),
  count: z.number(),
});

export const TheatreReportClinicianWorkloadSchema = z.object({
  clinician_id: z.number(),
  clinician_name: z.string(),
  case_count: z.number(),
  completed_case_count: z.number(),
  scheduled_minutes: z.number(),
  actual_minutes: z.number(),
  average_case_duration_minutes: z.number(),
});

export const TheatreReportSummarySchema = z.object({
  range: TheatreReportRangeSchema,
  totals: TheatreReportTotalsSchema,
  turnaround: TheatreReportTurnaroundSchema,
  on_time_starts: TheatreReportOnTimeStartsSchema,
  throughput_by_day: z.array(TheatreReportDaySchema),
  utilization_by_theatre: z.array(TheatreReportUtilizationByTheatreSchema),
  surgeon_workload: z.array(TheatreReportClinicianWorkloadSchema),
  anesthesiologist_workload: z.array(TheatreReportClinicianWorkloadSchema),
  status_breakdown: z.array(TheatreReportStatusBreakdownSchema),
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
  nausea_vomiting: z.boolean(),
  shivering: z.boolean(),
  respiratory_issues: z.boolean(),
  cardiovascular_issues: z.boolean(),
  complications_notes: z.string(),
  medications_given: z.string(),
  handover_completed_at: z.string().nullable().optional(),
  handover_given_to: z.string(),
  handover_notes: z.string(),
  discharge_notes: z.string(),
  latest_aldrete_score: z.number().nullable().optional(),
  active_complication_count: z.number(),
  ready_for_discharge: z.boolean(),
  discharge_blockers: z.array(z.string()),
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
export type TheatreAvailabilitySlot = z.infer<typeof TheatreAvailabilitySlotSchema>;
export type TheatreAvailability = z.infer<typeof TheatreAvailabilitySchema>;
export type SurgicalTeamMember = z.infer<typeof SurgicalTeamMemberSchema>;
export type SurgeryCaseList = z.infer<typeof SurgeryCaseListSchema>;
export type SurgeryCaseDetail = z.infer<typeof SurgeryCaseDetailSchema>;
export type CaseSchedulingContextMember = z.infer<typeof CaseSchedulingContextMemberSchema>;
export type CaseSchedulingContext = z.infer<typeof CaseSchedulingContextSchema>;
export type WHOChecklist = z.infer<typeof WHOChecklistSchema>;
export type AnesthesiaRecord = z.infer<typeof AnesthesiaRecordSchema>;
export type IntraOpVital = z.infer<typeof IntraOpVitalSchema>;
export type OperativeNote = z.infer<typeof OperativeNoteSchema>;
export type TheatreConsumable = z.infer<typeof TheatreConsumableSchema>;
export type TheatreReportRange = z.infer<typeof TheatreReportRangeSchema>;
export type TheatreReportTotals = z.infer<typeof TheatreReportTotalsSchema>;
export type TheatreReportTurnaround = z.infer<typeof TheatreReportTurnaroundSchema>;
export type TheatreReportOnTimeStarts = z.infer<typeof TheatreReportOnTimeStartsSchema>;
export type TheatreReportDay = z.infer<typeof TheatreReportDaySchema>;
export type TheatreReportUtilizationByTheatre = z.infer<typeof TheatreReportUtilizationByTheatreSchema>;
export type TheatreReportStatusBreakdown = z.infer<typeof TheatreReportStatusBreakdownSchema>;
export type TheatreReportClinicianWorkload = z.infer<typeof TheatreReportClinicianWorkloadSchema>;
export type TheatreReportSummary = z.infer<typeof TheatreReportSummarySchema>;
export type PACUVital = z.infer<typeof PACUVitalSchema>;
export type PACURecord = z.infer<typeof PACURecordSchema>;
export type PaginatedOperatingTheatres = z.infer<typeof PaginatedOperatingTheatreSchema>;
export type PaginatedSurgeryCases = z.infer<typeof PaginatedSurgeryCaseSchema>;
export type EquipmentCategory = z.infer<typeof EquipmentCategorySchema>;
export type TheatreEquipmentTypeList = z.infer<typeof TheatreEquipmentTypeListSchema>;
export type TheatreEquipmentTypeDetail = z.infer<typeof TheatreEquipmentTypeDetailSchema>;
export type CaseEquipmentRequirement = z.infer<typeof CaseEquipmentRequirementSchema>;
export type PaginatedTheatreEquipmentTypes = z.infer<typeof PaginatedTheatreEquipmentTypeSchema>;

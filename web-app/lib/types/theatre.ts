/**
 * Theatre Type Definitions for Vitora HMIS
 *
 * Entity types are derived from Zod schemas to ensure runtime validation
 * matches static types. Input/request types are defined manually.
 *
 * @see lib/schemas/theatre.schema.ts for schema definitions
 * @see backend/hmis/apps/theatre/models.py
 */

// =============================================================================
// RE-EXPORT SCHEMA-DERIVED TYPES
// =============================================================================

export type {
  // Enum types
  TheatreType,
  CaseStatus,
  Priority,
  ASAClass,
  AnesthesiaType,
  Laterality,
  TeamRole,
  PACUDestination,
  // Entity types
  OperatingTheatreList,
  OperatingTheatreDetail,
  TheatreAvailability,
  TheatreAvailabilitySlot,
  SurgicalTeamMember,
  SurgeryCaseList,
  SurgeryCaseDetail,
  CaseSchedulingContext,
  CaseSchedulingContextMember,
  WHOChecklist,
  AnesthesiaRecord,
  IntraOpVital,
  OperativeNote,
  TheatreConsumable,
  TheatreReportRange,
  TheatreReportTotals,
  TheatreReportTurnaround,
  TheatreReportOnTimeStarts,
  TheatreReportDay,
  TheatreReportUtilizationByTheatre,
  TheatreReportStatusBreakdown,
  TheatreReportClinicianWorkload,
  TheatreReportSummary,
  PACUVital,
  PACURecord,
  // Equipment types
  EquipmentCategory,
  TheatreEquipmentTypeList,
  TheatreEquipmentTypeDetail,
  CaseEquipmentRequirement,
  // Paginated types
  PaginatedOperatingTheatres,
  PaginatedSurgeryCases,
  PaginatedTheatreEquipmentTypes,
} from '@/lib/schemas/theatre.schema';

// =============================================================================
// INPUT/REQUEST TYPES (manually defined — not from API responses)
// =============================================================================

export interface OperatingTheatreCreateData {
  code: string;
  name: string;
  theatre_type: string;
  location?: string;
  has_laminar_flow?: boolean;
  has_cath_lab?: boolean;
  has_image_intensifier?: boolean;
  equipment_notes?: string;
  operating_hours_start?: string;
  operating_hours_end?: string;
  slot_duration_minutes?: number;
  is_active?: boolean;
  maintenance_notes?: string;
}

export interface SurgeryCaseCreateData {
  patient: number;
  encounter?: number;
  admission?: number;
  primary_procedure: number;
  additional_procedures?: number[];
  procedure_notes?: string;
  theatre: number;
  scheduled_date: string;
  scheduled_start_time: string;
  estimated_duration_minutes: number;
  priority?: string;
  diagnosis: string;
  laterality?: string;
  asa_class?: string;
  anesthesia_type?: string;
}

export interface CaseScheduleData {
  theatre?: number;
  scheduled_date?: string;
  scheduled_start_time?: string;
  estimated_duration_minutes?: number;
}

export interface CaseCancelData {
  reason: string;
}

export interface CasePostponeData {
  postponed_to_date?: string;
  reason?: string;
}

export interface TeamMemberCreateData {
  staff_member: number;
  role: string;
  notes?: string;
}

export interface WHOSignInData {
  patient_identity_confirmed: boolean;
  procedure_site_marked: boolean;
  consent_signed: boolean;
  anesthesia_machine_checked: boolean;
  pulse_oximeter_attached: boolean;
  allergies_reviewed: boolean;
  allergy_notes?: string;
  difficult_airway_risk?: boolean;
  aspiration_risk?: boolean;
  airway_equipment_available?: boolean;
  blood_loss_risk?: string;
  iv_access_adequate?: boolean;
  blood_products_available?: boolean;
}

export interface WHOTimeOutData {
  team_members_introduced: boolean;
  patient_name_confirmed: boolean;
  procedure_confirmed: boolean;
  site_confirmed: boolean;
  surgeon_critical_steps_discussed?: boolean;
  anesthesia_concerns_discussed?: boolean;
  nursing_concerns_discussed?: boolean;
  prophylactic_antibiotics_given?: boolean;
  antibiotics_timing_within_60_min?: boolean;
  antibiotics_not_applicable?: boolean;
  essential_imaging_displayed?: boolean;
  imaging_not_applicable?: boolean;
}

export interface WHOSignOutData {
  procedure_name_recorded: boolean;
  instrument_count_correct: boolean;
  sponge_count_correct: boolean;
  needle_count_correct: boolean;
  specimens_labeled?: boolean;
  specimen_count?: number;
  equipment_problems_noted?: boolean;
  equipment_problems_description?: string;
  key_recovery_concerns?: string;
}

export interface AnesthesiaRecordCreateData {
  anesthesiologist: number;
  mallampati_class?: string;
  mouth_opening?: string;
  neck_mobility?: string;
  dentition_notes?: string;
  last_solid_food?: string;
  last_clear_fluids?: string;
  npo_confirmed?: boolean;
  premedication_given?: string;
  anesthesia_consent_obtained?: boolean;
  risks_explained?: boolean;
  induction_time?: string;
  intubation_time?: string;
  extubation_time?: string;
  airway_device?: string;
  tube_size?: string;
  intubation_attempts?: number;
  intubation_difficulty?: string;
  anesthesia_technique?: string;
  induction_agents?: string;
  maintenance_agents?: string;
  muscle_relaxants?: string;
  reversal_agents?: string;
  crystalloid_volume?: number;
  colloid_volume?: number;
  blood_products?: string;
  estimated_blood_loss?: number;
  urine_output?: number;
  intraop_complications?: string;
  pacu_handover_notes?: string;
  pain_management_plan?: string;
  post_op_nausea_plan?: string;
  other_post_op_orders?: string;
}

export interface OperativeNoteCreateData {
  dictated_by: number;
  incision_time?: string;
  closure_time?: string;
  pre_operative_diagnosis: string;
  post_operative_diagnosis: string;
  procedure_performed: string;
  findings: string;
  technique_description: string;
  implants_used?: string;
  drains_placed?: string;
  sutures_used?: string;
  estimated_blood_loss?: number;
  specimens_sent?: string;
  frozen_section?: boolean;
  frozen_section_result?: string;
  intraoperative_complications?: string;
  post_operative_plan?: string;
}

export interface PACUDischargeData {
  discharge_aldrete_score: number;
  discharge_destination: string;
  discharge_notes?: string;
  handover_given_to: string;
  handover_notes: string;
}

export interface PACUUpdateData {
  nausea_vomiting?: boolean;
  shivering?: boolean;
  respiratory_issues?: boolean;
  cardiovascular_issues?: boolean;
  complications_notes?: string;
  medications_given?: string;
  handover_given_to?: string;
  handover_notes?: string;
}

export interface TheatreListParams {
  page?: number;
  page_size?: number;
  search?: string;
  theatre_type?: string;
  is_active?: boolean;
}

export interface SurgeryCaseListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  priority?: string;
  scheduled_date?: string;
  scheduled_date_after?: string;
  scheduled_date_before?: string;
  patient?: number;
  theatre?: number;
}

export interface TheatreReportParams {
  date_from?: string;
  date_to?: string;
}

export interface TheatreEquipmentTypeCreateData {
  name: string;
  code: string;
  category: string;
  description?: string;
  is_portable?: boolean;
  setup_time_minutes?: number;
  cleanup_time_minutes?: number;
  is_active?: boolean;
}

export interface TheatreEquipmentTypeListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  is_active?: boolean;
}

export interface CaseEquipmentCreateData {
  resource?: number;
  equipment_type?: number;
  quantity_required?: number;
  is_confirmed?: boolean;
  reserved_from: string;
  reserved_until: string;
  notes?: string;
}

export interface ProcedureCatalogEntry {
  id: number;
  code: string;
  name: string;
  description: string;
  category: string;
  body_system: string;
  risk_level: string;
  ichi_code: string;
  cpt_code: string;
  consent_required: boolean;
  typical_duration_minutes: number;
  base_fee: number | null;
  sha_tariff_code: string;
  is_active: boolean;
}

/** Full detail returned by GET /api/procedures/catalog/{id}/ */
export interface ProcedureCatalogDetail extends ProcedureCatalogEntry {
  icd10_pcs_code: string;
  consent_template: string;
  guardian_consent_required: boolean;
  witness_required: boolean;
  requires_anesthesia: boolean;
  anesthesia_type: string;
  requires_fasting: boolean;
  pre_procedure_instructions: string;
  post_procedure_instructions: string;
  required_qualifications: string;
  minimum_staff_count: number;
  sha_package_code: string;
  requires_follow_up: boolean;
  default_follow_up_days: number;
  follow_up_clinic: number | null;
  default_clinics: number[];
  default_clinics_detail: { id: number; name: string; clinic_type: string }[];
  billing_service: number | null;
  billing_price: number | null;
  billing_service_name: string | null;
  organization: number | null;
  facility: number | null;
  created_at: string;
  updated_at: string;
}

export type ProcedureOrderStatus =
  | 'ORDERED'
  | 'CONSENT_PENDING'
  | 'SCHEDULED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ProcedurePriority = 'EMERGENCY' | 'URGENT' | 'ROUTINE' | 'ELECTIVE';

export interface ProcedureOrderListItem {
  id: number;
  order_number: string;
  procedure: number;
  procedure_name: string;
  patient: number;
  patient_name: string;
  status: ProcedureOrderStatus;
  priority: ProcedurePriority;
  scheduled_date: string | null;
  scheduled_time: string | null;
  is_overdue: boolean;
  ordered_at: string;
}

export interface ProcedureOrder {
  id: number;
  order_number: string;
  procedure: ProcedureCatalogEntry;
  patient: number;
  status: ProcedureOrderStatus;
  priority: ProcedurePriority;
  indication: string;
  clinical_notes: string;
  body_site: string;
  laterality: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_location: string;
  scheduled_clinic: number | null;
  scheduled_clinic_name: string | null;
  ordered_at: string;
  ordered_by: number;
  assigned_performer: number | null;
  is_overdue: boolean;
  consent: ProcedureConsent | null;
  log: ProcedureLog | null;
  cancelled_by: number | null;
  cancelled_at: string | null;
  cancellation_reason: string;
}

export interface ProcedureConsent {
  id: number;
  status: 'PENDING' | 'SIGNED' | 'DECLINED' | 'WITHDRAWN';
  consent_type: string;
  consent_text: string;
  procedure_explained: boolean;
  risks_explained: boolean;
  alternatives_explained: boolean;
  questions_answered: boolean;
  signed_by_patient: boolean;
  patient_signed_at: string | null;
  signed_by_guardian: boolean;
  guardian_name: string;
  obtained_by: number;
  obtained_at: string | null;
}

export interface ProcedureLog {
  id: number;
  started_at: string;
  ended_at: string | null;
  actual_duration_minutes: number | null;
  performed_by: number;
  assistant: number | null;
  location: string;
  anesthesia_used: boolean;
  anesthesia_type: string;
  status: string;
  immediate_outcome: string;
  complications_occurred: boolean;
  complication_details: string;
  consumables: ProcedureConsumable[];
}

export interface ProcedureConsumable {
  id: number;
  drug: number;
  drug_name: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
}

export interface ProcedureOutcome {
  id: number;
  assessment_date: string;
  outcome: string;
  findings: string;
  notes: string;
  next_follow_up: string | null;
  follow_up_notes: string;
}

export interface ProcedureDashboard {
  scheduled_today: number;
  pending_consent: number;
  in_progress: number;
  completed_today: number;
}

// Status display helpers
export const PROCEDURE_STATUS_COLORS: Record<ProcedureOrderStatus, string> = {
  ORDERED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  CONSENT_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  SCHEDULED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  READY: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  IN_PROGRESS: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const PROCEDURE_STATUS_LABELS: Record<ProcedureOrderStatus, string> = {
  ORDERED: 'Ordered',
  CONSENT_PENDING: 'Consent Pending',
  SCHEDULED: 'Scheduled',
  READY: 'Ready',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const PROCEDURE_PRIORITY_COLORS: Record<ProcedurePriority, string> = {
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  ROUTINE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ELECTIVE: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export const RISK_LEVEL_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

/** A time slot returned by GET /api/procedures/catalog/{id}/available-slots/ */
export interface ProcedureAvailableSlot {
  clinic_id: number;
  clinic_name: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  available: boolean;
}

export interface ProcedureAvailableSlotsResponse {
  slots: ProcedureAvailableSlot[];
  message?: string;
}

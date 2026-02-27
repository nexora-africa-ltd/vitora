/**
 * Shared Allied Health Types
 * Common types used across all Allied Health modules
 */

// =============================================================================
// STATUS ENUMS
// =============================================================================

/**
 * Order/Referral status - shared across all Allied Health modules
 */
export type AlliedHealthOrderStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED';

/**
 * Session status - shared across modules with session tracking
 */
export type AlliedHealthSessionStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

/**
 * Priority levels for orders
 */
export type AlliedHealthPriority = 'EMERGENCY' | 'URGENT' | 'ROUTINE';

/**
 * Session outcome tracking
 */
export type SessionOutcome =
  | 'IMPROVED'
  | 'MAINTAINED'
  | 'DECLINED'
  | 'UNABLE_TO_ASSESS'
  | 'NOT_APPLICABLE';

// =============================================================================
// DISPLAY CONFIGURATIONS
// =============================================================================

/**
 * Order status display configuration
 */
export const ORDER_STATUS_CONFIG: Record<
  AlliedHealthOrderStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  PENDING: { label: 'Pending', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'default', className: 'bg-blue-500' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default', className: 'bg-green-500' },
  ON_HOLD: { label: 'On Hold', variant: 'secondary', className: 'bg-yellow-500 text-yellow-950' },
  COMPLETED: { label: 'Completed', variant: 'outline' },
};

/**
 * Session status display configuration
 */
export const SESSION_STATUS_CONFIG: Record<
  AlliedHealthSessionStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  SCHEDULED: { label: 'Scheduled', variant: 'secondary' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default', className: 'bg-green-500' },
  COMPLETED: { label: 'Completed', variant: 'outline' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  NO_SHOW: { label: 'No Show', variant: 'destructive', className: 'bg-orange-500' },
  RESCHEDULED: { label: 'Rescheduled', variant: 'secondary', className: 'bg-blue-100 text-blue-800' },
};

/**
 * Priority display configuration
 */
export const PRIORITY_CONFIG: Record<
  AlliedHealthPriority,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  EMERGENCY: { label: 'Emergency', variant: 'destructive' },
  URGENT: { label: 'Urgent', variant: 'default', className: 'bg-orange-500' },
  ROUTINE: { label: 'Routine', variant: 'secondary' },
};

// =============================================================================
// BASE INTERFACES
// =============================================================================

/**
 * Base patient reference (embedded in orders)
 */
export interface PatientReference {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
}

/**
 * Base staff reference (for assigned therapists, etc.)
 */
export interface StaffReference {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

/**
 * Base order interface - extended by each module
 */
export interface BaseAlliedHealthOrder {
  id: number;
  order_number: string;
  patient: PatientReference;
  patient_id: number;
  encounter_id: number | null;
  clinic_visit_id: number | null;
  ordered_by: StaffReference;
  ordered_by_id: number;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  clinical_notes: string;
  is_sensitive: boolean;
  sha_code: string | null;
  sha_claimable: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Base session interface - extended by each module
 */
export interface BaseAlliedHealthSession {
  id: number;
  session_number: string;
  scheduled_date: string;
  scheduled_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  duration_minutes: number | null;
  status: AlliedHealthSessionStatus;
  therapist: StaffReference | null;
  therapist_id: number | null;
  notes: string;
  outcome: SessionOutcome | null;
  invoice_item_id: number | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

/**
 * Common list parameters for orders
 */
export interface AlliedHealthOrderListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: AlliedHealthOrderStatus;
  priority?: AlliedHealthPriority;
  patient_id?: number;
  encounter_id?: number;
  assigned_to?: number;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}

/**
 * Common list parameters for sessions
 */
export interface AlliedHealthSessionListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: AlliedHealthSessionStatus;
  order_id?: number;
  therapist_id?: number;
  scheduled_date?: string;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}

// =============================================================================
// PAGINATED RESPONSE
// =============================================================================

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

/**
 * Module dashboard statistics
 */
export interface AlliedHealthModuleStats {
  pending_count: number;
  in_progress_count: number;
  today_sessions_count: number;
  completed_today_count: number;
}

/**
 * Clinic queue stats for a single clinic type
 */
export interface ClinicTypeQueueStats {
  waiting_count: number;
  in_consultation_count: number;
  completed_count: number;
  total_today: number;
}

/**
 * Clinic queue stats for all allied health clinic types
 */
export interface ClinicQueueStats {
  physio?: ClinicTypeQueueStats;
  nutrition?: ClinicTypeQueueStats;
  ot?: ClinicTypeQueueStats;
  counselling?: ClinicTypeQueueStats;
  mental_health?: ClinicTypeQueueStats;
  social_work?: ClinicTypeQueueStats;
  totals?: ClinicTypeQueueStats;
}

/**
 * Allied Health dashboard overview
 */
export interface AlliedHealthDashboardStats {
  physiotherapy: AlliedHealthModuleStats;
  nutrition: AlliedHealthModuleStats & {
    consultations_count: number;
  };
  occupational_therapy: AlliedHealthModuleStats;
  social_work: {
    open_cases_count: number;
    urgent_count: number;
    this_week_count: number;
  };
  counselling: AlliedHealthModuleStats & {
    follow_ups_count: number;
  };
  todays_sessions: TodaySession[];
  clinic_queue_stats?: ClinicQueueStats;
}

/**
 * Today's session entry for dashboard
 */
export interface TodaySession {
  id: number | string; // Can be number or "cv-{id}" for clinic visits
  session_number: string | number | null;
  scheduled_time: string | null;
  patient_name: string;
  patient_mrn: string;
  module: 'PHYSIO' | 'NUTRITION' | 'OT' | 'SOCIAL_WORK' | 'COUNSELLING' | 'MENTAL_HEALTH';
  treatment_type: string;
  status: string; // Can be session status or clinic visit status
  source?: 'MODULE' | 'CLINIC_QUEUE';
}

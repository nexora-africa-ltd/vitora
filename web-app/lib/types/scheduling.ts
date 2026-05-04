/**
 * Scheduling Types
 *
 * TypeScript interfaces for scheduling resources, schedules, and appointments.
 */

import { PaginatedResponse } from '@/lib/types';

// =============================================================================
// Resources
// =============================================================================

export type ResourceType = 'PERSON' | 'PLACE' | 'ASSET';

export interface ResourceListItem {
  id: number;
  name: string;
  resource_type: ResourceType;
  code: string;
  is_active: boolean;
  department: number | null;
  department_name: string | null;
}

export interface Resource extends ResourceListItem {
  capacity: number;
  staff_profile: number | null;
  staff_profile_name: string | null;
  metadata: Record<string, unknown>;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceCreateData {
  name: string;
  resource_type: ResourceType;
  code: string;
  is_active?: boolean;
  capacity?: number;
  staff_profile?: number | null;
  department?: number | null;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceListParams {
  page?: number;
  page_size?: number;
  resource_type?: ResourceType;
  is_active?: boolean;
  department?: number;
  ordering?: string;
  search?: string;
  exclude_clinic_resources?: boolean;
}

// =============================================================================
// Schedules
// =============================================================================

export type ScheduleType = 'RECURRING' | 'ONE_TIME' | 'BLOCK';

export interface ScheduleBreak {
  id: number;
  start_time: string;
  end_time: string;
  reason: string;
  created_at: string;
}

export interface Schedule {
  id: number;
  resource: number;
  resource_name: string;
  schedule_type: ScheduleType;
  day_of_week: number | null;
  day_of_week_display: string | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
  max_appointments: number | null;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  notes: string;
  breaks: ScheduleBreak[];
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreateData {
  resource: number;
  schedule_type: ScheduleType;
  day_of_week?: number | null;
  specific_date?: string | null;
  start_time: string;
  end_time: string;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  max_appointments?: number | null;
  effective_from?: string;
  effective_until?: string | null;
  is_active?: boolean;
  notes?: string;
}

export interface ScheduleListParams {
  resource?: number;
  schedule_type?: ScheduleType;
  day_of_week?: number;
  is_active?: boolean;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface ScheduleBreakCreateData {
  start_time: string;
  end_time: string;
  reason?: string;
}

// =============================================================================
// Appointments
// =============================================================================

export type AppointmentStatus =
  | 'CREATED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentType =
  | 'CONSULTATION'
  | 'FOLLOW_UP'
  | 'PROCEDURE'
  | 'LAB_TEST'
  | 'IMAGING'
  | 'VACCINATION'
  | 'THERAPY'
  | 'OTHER';

export type AppointmentPriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export interface AppointmentListItem {
  id: number;
  appointment_number: string;
  patient: number;
  patient_name: string;
  resource: number;
  resource_name: string;
  appointment_type: AppointmentType;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  priority: AppointmentPriority;
}

export interface Appointment extends AppointmentListItem {
  patient_mrn: string;
  resource_code: string;
  appointment_type_display: string;
  status_display: string;
  actual_start: string | null;
  actual_end: string | null;
  confirmed_at: string | null;
  confirmed_by: number | null;
  confirmed_by_name: string | null;
  checked_in_at: string | null;
  checked_in_by: number | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancellation_reason: string;
  reason: string;
  notes: string;
  completion_notes: string;
  duration_minutes: number;
  is_upcoming: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentCreateData {
  patient: number;
  resource: number;
  appointment_type: AppointmentType;
  scheduled_start: string;
  scheduled_end: string;
  reason: string;
  notes?: string;
  priority?: AppointmentPriority;
}

export interface AppointmentListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  resource?: number;
  status?: AppointmentStatus;
  appointment_type?: AppointmentType;
  priority?: AppointmentPriority;
  from_date?: string;
  to_date?: string;
  ordering?: string;
}

// =============================================================================
// Availability
// =============================================================================

export interface AvailabilitySlot {
  date: string;
  start_time: string;
  end_time: string;
}

export interface ResourceAvailability {
  resource: number;
  resource_name: string;
  date: string;
  slots: AvailabilitySlot[];
  total_available: number;
}

export interface SlotCheckResult {
  available: boolean;
  reason: string | null;
  conflicting_appointment?: string | null;
}

// =============================================================================
// Paginated responses
// =============================================================================

export type PaginatedAppointments = PaginatedResponse<AppointmentListItem>;
export type PaginatedSchedules = PaginatedResponse<Schedule>;
export type PaginatedResources = PaginatedResponse<ResourceListItem>;

// =============================================================================
// Shifts / Duty Roster
// =============================================================================

export type ShiftType = 'DAY' | 'NIGHT' | 'MORNING' | 'AFTERNOON' | 'ON_CALL' | 'OVERTIME' | 'DAY_OFF' | 'NIGHT_OFF' | 'OFF' | 'AFTERNOON_OFF' | 'LEAVE' | 'SICK_LEAVE' | 'REST';
export type ShiftStatus = 'SCHEDULED' | 'ACTIVE' | 'ON_BREAK' | 'COMPLETED' | 'CANCELLED' | 'ABSENT';

export interface ShiftListItem {
  id: number;
  staff_resource: number;
  staff_resource_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: ShiftType;
  shift_type_display: string;
  status: ShiftStatus;
  status_display: string;
  department: string;
  duration_hours: number | null;
  room: number | null;
  room_name: string | null;
  clinic: number | null;
  clinic_name: string | null;
  comments_count?: number;
}

export interface Shift extends Omit<ShiftListItem, 'department'> {
  department: number | null;
  department_name: string;
  notes: string;
  created_by: number | null;
  created_by_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  break_started_at: string | null;
  total_break_minutes: number;
  clock_in_method: string;
  auto_clocked_out: boolean;
  is_emergency: boolean;
  emergency_reason: string;
  actual_hours: number | null;
  late_minutes: number;
  overtime_minutes: number;
  is_early_departure: boolean;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancellation_reason: string;
  created_at: string;
  updated_at: string;
}

export interface ShiftCreateData {
  staff_resource: number;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: ShiftType;
  department?: number;
  notes?: string;
}

export interface ShiftListParams {
  page?: number;
  page_size?: number;
  staff_resource?: number;
  shift_type?: ShiftType;
  status?: ShiftStatus;
  department?: number;
  from_date?: string;
  to_date?: string;
  room?: number;
  clinic?: number;
  room_or_linked_clinic?: number;
  ordering?: string;
}

export interface StaffWorkload {
  resource_id: number;
  resource_name: string;
  resource_code: string;
  shift_count: number;
  total_hours: number;
  appointment_count: number;
  active_shifts: number;
  completed_shifts: number;
}

export type PaginatedShifts = PaginatedResponse<ShiftListItem>;

export interface BulkCreateShiftsPayload {
  shifts: ShiftCreateData[];
}

export interface BulkCreateShiftsResult {
  created: number;
  skipped: number;
  errors: number;
  created_ids: number[];
  skipped_details: Array<{ index: number; reason: string }>;
  error_details: Array<{ index: number; errors: string | Record<string, string[]> }>;
}

// =============================================================================
// Cross-Facility Conflicts
// =============================================================================

export interface CrossFacilityConflict {
  staff_resource_id: number;
  staff_resource_name: string;
  staff_profile_id: number;
  shift_date: string;
  this_facility_shift: {
    shift_type: string;
    start_time: string;
    end_time: string;
  };
  other_facility: {
    id: number;
    name: string;
  };
  other_shift: {
    shift_type: string;
    start_time: string;
    end_time: string;
  };
}

// =============================================================================
// Scheduling Settings & Staff Constraints

// =============================================================================
// Attendance / Clock-In
// =============================================================================

export type AttendanceStatus = 'NO_SHIFT' | 'UPCOMING' | 'SHOULD_CLOCK_IN' | 'CLOCKED_IN' | 'ON_BREAK' | 'COMPLETED';

// =============================================================================
// On-Duty Overview (Manager Widget)
// =============================================================================

export interface OnDutyStaffEntry {
  shift_id: number;
  staff_name: string;
  staff_resource_id: number;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  department: string;
  room_name: string | null;
  clinic_name: string | null;
  late_minutes: number;
  started_at: string | null;
  on_break?: boolean;
  minutes_overdue?: number;
  starts_in_minutes?: number;
}

export interface OnDutySummary {
  clocked_in: number;
  late: number;
  absent: number;
  upcoming: number;
  completed: number;
  total: number;
}

export interface OnDutyResponse {
  clocked_in: OnDutyStaffEntry[];
  late: OnDutyStaffEntry[];
  absent: OnDutyStaffEntry[];
  upcoming: OnDutyStaffEntry[];
  summary: OnDutySummary;
  as_of: string;
}

export interface MyTodayResponse {
  shifts: Shift[];
  attendance_status: AttendanceStatus;
}

export interface ClockInPayload {
  room_id?: number | null;
  clinic_id?: number | null;
}

export interface EmergencyClockInPayload {
  reason: string;
  shift_type?: ShiftType;
  duration_hours?: number;
  room_id?: number | null;
  clinic_id?: number | null;
  method?: string;
}

export interface ClockInResponse extends Shift {
  session_auto_opened: boolean;
}

export interface ClockOutResponse extends Shift {
  session_auto_closed: boolean;
}

export interface AttendanceStats {
  total_shifts: number;
  total_hours: number;
  on_time_count: number;
  late_count: number;
  on_time_rate: number;
  overtime_hours: number;
}

export interface MyHistoryResponse {
  results: ShiftListItem[];
  count: number;
  stats: AttendanceStats;
}

export interface MyHistoryParams {
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

// =============================================================================
// Attendance Trends (Phase 2)
// =============================================================================

export interface AttendanceTrendWeek {
  week_start: string;
  hours_worked: number;
  shifts_completed: number;
  on_time_rate: number;
  late_count: number;
  overtime_hours: number;
}

export interface AttendanceTrendsParams {
  weeks?: number;
}

// =============================================================================
// QR Clock-In (Phase 3)
// =============================================================================

export interface QRTokenResponse {
  qr_token: string;
  facility_id: number;
  facility_name: string;
  valid_until: string;
  generated_at: string;
}

export interface QRClockInPayload {
  qr_token: string;
}

// =============================================================================
// Payroll Export (Phase 3)
// =============================================================================

export interface PayrollExportParams {
  from_date: string;
  to_date: string;
}
// =============================================================================

export interface SchedulingSettings {
  id: number;
  max_hours_per_week: number;
  max_consecutive_days: number;
  min_rest_hours: number;
  max_night_shifts_per_week: number;
  max_day_hours: number;
  max_night_hours: number;
  default_shift_pattern: string[];
  active_shift_types: string[];
  overtime_threshold_hours: number;
  require_swap_approval: boolean;
  enforce_constraints: boolean;
  enforce_punctuality: boolean;
  late_cutoff_minutes: number;
  created_at: string;
  updated_at: string;
}

export type ConstraintType =
  | 'NO_NIGHTS'
  | 'NO_WEEKENDS'
  | 'MAX_HOURS'
  | 'MAX_CONSECUTIVE'
  | 'PREFERRED_SHIFTS'
  | 'NO_OVERTIME'
  | 'LIGHT_DUTY';

export interface StaffConstraint {
  id: number;
  staff_resource: number;
  staff_resource_name: string;
  constraint_type: ConstraintType;
  constraint_type_display: string;
  value: Record<string, unknown>;
  reason: string;
  is_active: boolean;
  effective_from: string | null;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffConstraintCreateData {
  staff_resource: number;
  constraint_type: ConstraintType;
  value?: Record<string, unknown>;
  reason?: string;
  is_active?: boolean;
  effective_from?: string | null;
  effective_until?: string | null;
}

// =============================================================================
// Shift Swap Request
// =============================================================================

export type ShiftSwapStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface ShiftSummary {
  id: number;
  staff_name: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: ShiftType;
  status: ShiftStatus;
}

export interface ShiftSwapRequest {
  id: number;
  requesting_shift: number;
  requesting_shift_summary: ShiftSummary;
  target_shift: number | null;
  target_shift_summary: ShiftSummary | null;
  requester: number;
  requester_name: string;
  target_staff: number | null;
  target_staff_name: string | null;
  is_partial: boolean;
  partial_start_time: string | null;
  partial_end_time: string | null;
  status: ShiftSwapStatus;
  status_display: string;
  reason: string;
  rejection_reason: string;
  accepted_by: number | null;
  accepted_by_name: string | null;
  accepted_shift: number | null;
  accepted_shift_summary: ShiftSummary | null;
  accepted_at: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  expires_at: string;
  constraint_warnings: string[];
  created_at: string;
  updated_at: string;
}

export interface ShiftSwapListItem {
  id: number;
  requesting_shift: number;
  requesting_shift_date: string;
  requesting_shift_type: ShiftType;
  requesting_staff_name: string;
  target_shift: number | null;
  target_staff_name: string | null;
  requester: number;
  requester_name: string;
  is_partial: boolean;
  status: ShiftSwapStatus;
  status_display: string;
  reason: string;
  expires_at: string;
  created_at: string;
}

export interface ShiftSwapCreateData {
  requesting_shift: number;
  target_shift?: number | null;
  target_staff?: number | null;
  is_partial?: boolean;
  partial_start_time?: string | null;
  partial_end_time?: string | null;
  reason?: string;
}

export interface ShiftSwapAcceptData {
  offered_shift?: number | null;
}

export interface ShiftSwapRejectData {
  reason?: string;
}

export interface ShiftSwapApproveData {
  notes?: string;
}

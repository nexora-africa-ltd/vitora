/**
 * Scheduling Zod Schemas
 */

import { z } from 'zod';

function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

// =============================================================================
// Resources
// =============================================================================

export const ResourceTypeSchema = z.enum(['PERSON', 'PLACE', 'ASSET']);

export const ResourceListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  resource_type: ResourceTypeSchema,
  code: z.string(),
  is_active: z.boolean(),
  department: z.number().nullable(),
  department_name: z.string().nullable(),
});

export const ResourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  resource_type: ResourceTypeSchema,
  code: z.string(),
  is_active: z.boolean(),
  department: z.number().nullable(),
  department_name: z.string().nullable(),
  capacity: z.number(),
  staff_profile: z.number().nullable(),
  staff_profile_name: z.string().nullable(),
  metadata: z.record(z.unknown()),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedResourceListSchema = createPaginatedSchema(ResourceListItemSchema);

// =============================================================================
// Schedules
// =============================================================================

export const ScheduleTypeSchema = z.enum(['RECURRING', 'ONE_TIME', 'BLOCK']);

export const ScheduleBreakSchema = z.object({
  id: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  reason: z.string(),
  created_at: z.string(),
});

export const ScheduleSchema = z.object({
  id: z.number(),
  resource: z.number(),
  resource_name: z.string(),
  schedule_type: ScheduleTypeSchema,
  day_of_week: z.number().nullable(),
  day_of_week_display: z.string().nullable(),
  specific_date: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  slot_duration_minutes: z.number(),
  buffer_minutes: z.number(),
  max_appointments: z.number().nullable(),
  effective_from: z.string(),
  effective_until: z.string().nullable(),
  is_active: z.boolean(),
  notes: z.string(),
  breaks: z.array(ScheduleBreakSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedScheduleListSchema = createPaginatedSchema(ScheduleSchema);

// =============================================================================
// Appointments
// =============================================================================

export const AppointmentStatusSchema = z.enum([
  'CREATED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

export const AppointmentTypeSchema = z.enum([
  'CONSULTATION',
  'FOLLOW_UP',
  'PROCEDURE',
  'LAB_TEST',
  'IMAGING',
  'VACCINATION',
  'THERAPY',
  'OTHER',
]);

export const AppointmentPrioritySchema = z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']);

export const AppointmentListItemSchema = z.object({
  id: z.number(),
  appointment_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  resource: z.number(),
  resource_name: z.string(),
  appointment_type: AppointmentTypeSchema,
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  status: AppointmentStatusSchema,
  priority: AppointmentPrioritySchema,
});

export const AppointmentSchema = AppointmentListItemSchema.extend({
  patient_mrn: z.string(),
  resource_code: z.string(),
  appointment_type_display: z.string(),
  status_display: z.string(),
  actual_start: z.string().nullable(),
  actual_end: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  confirmed_by: z.number().nullable(),
  confirmed_by_name: z.string().nullable(),
  checked_in_at: z.string().nullable(),
  checked_in_by: z.number().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_by: z.number().nullable(),
  cancelled_by_name: z.string().nullable(),
  cancellation_reason: z.string(),
  reason: z.string(),
  notes: z.string(),
  completion_notes: z.string(),
  duration_minutes: z.number(),
  is_upcoming: z.boolean(),
  created_by: z.number().nullable(),
  created_by_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedAppointmentListSchema = createPaginatedSchema(AppointmentListItemSchema);

// =============================================================================
// Availability
// =============================================================================

export const AvailabilitySlotSchema = z.object({
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
});

export const ResourceAvailabilitySchema = z.object({
  resource: z.number(),
  resource_name: z.string(),
  date: z.string(),
  slots: z.array(AvailabilitySlotSchema),
  total_available: z.number(),
});

export const SlotCheckResultSchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
  conflicting_appointment: z.string().nullable().optional(),
});

// =============================================================================
// Shifts / Duty Roster
// =============================================================================

export const ShiftTypeSchema = z.enum(['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'ON_CALL', 'OVERTIME', 'DAY_OFF', 'NIGHT_OFF', 'OFF', 'AFTERNOON_OFF', 'LEAVE', 'SICK_LEAVE', 'REST']);
export const ShiftStatusSchema = z.enum(['SCHEDULED', 'ACTIVE', 'ON_BREAK', 'COMPLETED', 'CANCELLED', 'ABSENT']);

export const ShiftListItemSchema = z.object({
  id: z.number(),
  staff_resource: z.number(),
  staff_resource_name: z.string(),
  shift_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  shift_type: ShiftTypeSchema,
  shift_type_display: z.string(),
  status: ShiftStatusSchema,
  status_display: z.string(),
  department: z.string(),
  duration_hours: z.number().nullable(),
  room: z.number().nullable(),
  room_name: z.string().nullable(),
  clinic: z.number().nullable(),
  clinic_name: z.string().nullable(),
});

export const ShiftSchema = ShiftListItemSchema.extend({
  department: z.number().nullable(),
  department_name: z.string(),
  notes: z.string(),
  created_by: z.number().nullable(),
  created_by_name: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  break_started_at: z.string().nullable(),
  total_break_minutes: z.number(),
  clock_in_method: z.string(),
  auto_clocked_out: z.boolean(),
  is_emergency: z.boolean(),
  emergency_reason: z.string(),
  actual_hours: z.number().nullable(),
  late_minutes: z.number(),
  overtime_minutes: z.number(),
  is_early_departure: z.boolean(),
  cancelled_by: z.number().nullable(),
  cancelled_by_name: z.string().nullable(),
  cancellation_reason: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedShiftListSchema = createPaginatedSchema(ShiftListItemSchema);

export const StaffWorkloadSchema = z.object({
  resource_id: z.number(),
  resource_name: z.string(),
  resource_code: z.string(),
  shift_count: z.number(),
  total_hours: z.number(),
  appointment_count: z.number(),
  active_shifts: z.number(),
  completed_shifts: z.number(),
});

// =============================================================================
// Scheduling Settings & Staff Constraints
// =============================================================================

export const SchedulingSettingsSchema = z.object({
  id: z.number(),
  max_hours_per_week: z.number(),
  max_consecutive_days: z.number(),
  min_rest_hours: z.number(),
  max_night_shifts_per_week: z.number(),
  max_day_hours: z.coerce.number(),
  max_night_hours: z.coerce.number(),
  default_shift_pattern: z.array(z.string()),
  active_shift_types: z.array(z.string()),
  overtime_threshold_hours: z.coerce.number(),
  require_swap_approval: z.boolean(),
  enforce_constraints: z.boolean(),
  enforce_punctuality: z.boolean(),
  late_cutoff_minutes: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ConstraintTypeSchema = z.enum([
  'NO_NIGHTS', 'NO_WEEKENDS', 'MAX_HOURS', 'MAX_CONSECUTIVE',
  'PREFERRED_SHIFTS', 'NO_OVERTIME', 'LIGHT_DUTY',
]);

export const StaffConstraintSchema = z.object({
  id: z.number(),
  staff_resource: z.number(),
  staff_resource_name: z.string(),
  constraint_type: ConstraintTypeSchema,
  constraint_type_display: z.string(),
  value: z.record(z.unknown()),
  reason: z.string(),
  is_active: z.boolean(),
  effective_from: z.string().nullable(),
  effective_until: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedStaffConstraintSchema = createPaginatedSchema(StaffConstraintSchema);

// =============================================================================
// On-Duty Overview (Manager Widget)
// =============================================================================

export const OnDutyStaffEntrySchema = z.object({
  shift_id: z.number(),
  staff_name: z.string(),
  staff_resource_id: z.number(),
  shift_type: ShiftTypeSchema,
  start_time: z.string(),
  end_time: z.string(),
  status: ShiftStatusSchema,
  department: z.string(),
  room_name: z.string().nullable(),
  clinic_name: z.string().nullable(),
  late_minutes: z.number(),
  started_at: z.string().nullable(),
  on_break: z.boolean().optional(),
  minutes_overdue: z.number().optional(),
  starts_in_minutes: z.number().optional(),
});

export const OnDutySummarySchema = z.object({
  clocked_in: z.number(),
  late: z.number(),
  absent: z.number(),
  upcoming: z.number(),
  completed: z.number(),
  total: z.number(),
});

export const OnDutyResponseSchema = z.object({
  clocked_in: z.array(OnDutyStaffEntrySchema),
  late: z.array(OnDutyStaffEntrySchema),
  absent: z.array(OnDutyStaffEntrySchema),
  upcoming: z.array(OnDutyStaffEntrySchema),
  summary: OnDutySummarySchema,
  as_of: z.string(),
});

// =============================================================================
// Attendance / Clock-In
// =============================================================================

export const AttendanceStatusSchema = z.enum(['NO_SHIFT', 'UPCOMING', 'SHOULD_CLOCK_IN', 'CLOCKED_IN', 'ON_BREAK', 'COMPLETED']);

export const MyTodayResponseSchema = z.object({
  shifts: z.array(ShiftSchema),
  attendance_status: AttendanceStatusSchema,
});

export const ClockInResponseSchema = ShiftSchema.extend({
  session_auto_opened: z.boolean(),
});

export const ClockOutResponseSchema = ShiftSchema.extend({
  session_auto_closed: z.boolean(),
});

export const AttendanceStatsSchema = z.object({
  total_shifts: z.number(),
  total_hours: z.number(),
  on_time_count: z.number(),
  late_count: z.number(),
  on_time_rate: z.number(),
  overtime_hours: z.number(),
});

export const MyHistoryResponseSchema = z.object({
  results: z.array(ShiftListItemSchema),
  count: z.number(),
  stats: AttendanceStatsSchema,
});

// =============================================================================
// Attendance Trends (Phase 2)
// =============================================================================

export const AttendanceTrendWeekSchema = z.object({
  week_start: z.string(),
  hours_worked: z.number(),
  shifts_completed: z.number(),
  on_time_rate: z.number(),
  late_count: z.number(),
  overtime_hours: z.number(),
});

export const AttendanceTrendsResponseSchema = z.array(AttendanceTrendWeekSchema);

// =============================================================================
// QR Token (Phase 3)
// =============================================================================

export const QRTokenResponseSchema = z.object({
  qr_token: z.string(),
  facility_id: z.number(),
  facility_name: z.string(),
  valid_until: z.string(),
  generated_at: z.string(),
});

// =============================================================================
// Shift Swap Request Schemas
// =============================================================================

export const ShiftSwapStatusSchema = z.enum([
  'PENDING', 'ACCEPTED', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED',
]);

export const ShiftSummarySchema = z.object({
  id: z.number(),
  staff_name: z.string().nullable(),
  shift_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  shift_type: ShiftTypeSchema,
  status: ShiftStatusSchema,
});

export const ShiftSwapRequestSchema = z.object({
  id: z.number(),
  requesting_shift: z.number(),
  requesting_shift_summary: ShiftSummarySchema,
  target_shift: z.number().nullable(),
  target_shift_summary: ShiftSummarySchema.nullable(),
  requester: z.number(),
  requester_name: z.string(),
  target_staff: z.number().nullable(),
  target_staff_name: z.string().nullable(),
  is_partial: z.boolean(),
  partial_start_time: z.string().nullable(),
  partial_end_time: z.string().nullable(),
  status: ShiftSwapStatusSchema,
  status_display: z.string(),
  reason: z.string(),
  rejection_reason: z.string(),
  accepted_by: z.number().nullable(),
  accepted_by_name: z.string().nullable(),
  accepted_shift: z.number().nullable(),
  accepted_shift_summary: ShiftSummarySchema.nullable(),
  accepted_at: z.string().nullable(),
  reviewed_by: z.number().nullable(),
  reviewed_by_name: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  expires_at: z.string(),
  constraint_warnings: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ShiftSwapListItemSchema = z.object({
  id: z.number(),
  requesting_shift: z.number(),
  requesting_shift_date: z.string(),
  requesting_shift_type: ShiftTypeSchema,
  requesting_staff_name: z.string(),
  target_shift: z.number().nullable(),
  target_staff_name: z.string().nullable(),
  requester: z.number(),
  requester_name: z.string(),
  is_partial: z.boolean(),
  status: ShiftSwapStatusSchema,
  status_display: z.string(),
  reason: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});

export const PaginatedShiftSwapListSchema = createPaginatedSchema(ShiftSwapListItemSchema);

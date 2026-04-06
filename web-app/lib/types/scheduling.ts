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
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceListParams {
  page?: number;
  page_size?: number;
  resource_type?: ResourceType;
  is_active?: boolean;
  ordering?: string;
  search?: string;
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

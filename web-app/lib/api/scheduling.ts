/**
 * Scheduling API Client
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  PaginatedResourceListSchema,
  PaginatedScheduleListSchema,
  PaginatedAppointmentListSchema,
  ResourceSchema,
  ScheduleSchema,
  ScheduleBreakSchema,
  AppointmentSchema,
  ResourceAvailabilitySchema,
  SlotCheckResultSchema,
  PaginatedShiftListSchema,
  ShiftSchema,
  StaffWorkloadSchema,
  SchedulingSettingsSchema,
  StaffConstraintSchema,
  PaginatedStaffConstraintSchema,
  MyTodayResponseSchema,
  MyHistoryResponseSchema,
  ClockInResponseSchema,
  ClockOutResponseSchema,
  AttendanceTrendsResponseSchema,
  QRTokenResponseSchema,
  ShiftSwapRequestSchema,
  ShiftSwapListItemSchema,
  PaginatedShiftSwapListSchema,
  OnDutyResponseSchema,
} from '@/lib/schemas/scheduling.schema';
import type {
  Resource,
  ResourceCreateData,
  ResourceListParams,
  PaginatedResources,
  Schedule,
  ScheduleCreateData,
  ScheduleListParams,
  ScheduleBreak,
  ScheduleBreakCreateData,
  PaginatedSchedules,
  Appointment,
  AppointmentCreateData,
  AppointmentListParams,
  PaginatedAppointments,
  ResourceAvailability,
  SlotCheckResult,
  Shift,
  ShiftCreateData,
  ShiftListParams,
  PaginatedShifts,
  StaffWorkload,
  BulkCreateShiftsPayload,
  BulkCreateShiftsResult,
  CrossFacilityConflict,
  SchedulingSettings,
  StaffConstraint,
  StaffConstraintCreateData,
  MyTodayResponse,
  MyHistoryResponse,
  MyHistoryParams,
  ClockInPayload,
  ClockInResponse,
  ClockOutResponse,
  EmergencyClockInPayload,
  AttendanceTrendWeek,
  AttendanceTrendsParams,
  QRTokenResponse,
  QRClockInPayload,
  PayrollExportParams,
  ShiftSwapRequest,
  ShiftSwapListItem,
  ShiftSwapCreateData,
  ShiftSwapAcceptData,
  ShiftSwapRejectData,
  ShiftSwapApproveData,
  OnDutyResponse,
} from '@/lib/types/scheduling';

const BASE_URL = '/api/scheduling';

// =============================================================================
// Resources API
// =============================================================================

export const resourcesApi = {
  list: async (params?: ResourceListParams): Promise<PaginatedResources> => {
    const response = await apiClient.get(`${BASE_URL}/resources/`, { params });
    return parseResponse(PaginatedResourceListSchema, response.data, {
      context: 'resourcesApi.list',
    });
  },

  get: async (id: number): Promise<Resource> => {
    const response = await apiClient.get(`${BASE_URL}/resources/${id}/`);
    return parseResponse(ResourceSchema, response.data, {
      context: 'resourcesApi.get',
    });
  },

  create: async (data: ResourceCreateData): Promise<Resource> => {
    const response = await apiClient.post(`${BASE_URL}/resources/`, data);
    return parseResponse(ResourceSchema, response.data, {
      context: 'resourcesApi.create',
    });
  },

  update: async (id: number, data: Partial<ResourceCreateData>): Promise<Resource> => {
    const response = await apiClient.patch(`${BASE_URL}/resources/${id}/`, data);
    return parseResponse(ResourceSchema, response.data, {
      context: 'resourcesApi.update',
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/resources/${id}/`);
  },

  /** Get clinics linked to a PLACE resource via ClinicRoom. */
  linkedClinics: async (
    id: number,
  ): Promise<
    { clinic_room_id: number; clinic_id: number; clinic_name: string; clinic_code: string; is_default: boolean }[]
  > => {
    const response = await apiClient.get(`${BASE_URL}/resources/${id}/linked-clinics/`);
    return response.data;
  },

  /** Auto-create PERSON resources from staff profiles that don't have one yet. */
  syncFromStaff: async (): Promise<{ created: number; message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/resources/sync-from-staff/`);
    return response.data;
  },

  /** Auto-create PLACE resources from active clinics that don't have one yet. */
  syncFromClinics: async (): Promise<{ created: number; message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/resources/sync-from-clinics/`);
    return response.data;
  },

  /** Auto-create PLACE resources from active inpatient wards that don't have one yet. */
  syncFromWards: async (): Promise<{ created: number; message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/resources/sync-from-wards/`);
    return response.data;
  },

  /** Auto-create ASSET resources from operational cold chain equipment that don't have one yet. */
  syncFromEquipment: async (): Promise<{ created: number; message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/resources/sync-from-equipment/`);
    return response.data;
  },

  /** Auto-create ASSET resources from active theatre equipment types that don't have one yet. */
  syncFromTheatreEquipment: async (): Promise<{ created: number; message: string }> => {
    const response = await apiClient.post(`${BASE_URL}/resources/sync-from-theatre-equipment/`);
    return response.data;
  },

  /** Get available slots for a resource on a specific date. */
  getAvailability: async (id: number, date: string, appointmentType?: string): Promise<ResourceAvailability> => {
    const params: Record<string, string> = { date };
    if (appointmentType) params.appointment_type = appointmentType;
    const response = await apiClient.get(`${BASE_URL}/resources/${id}/availability/`, { params });
    return parseResponse(ResourceAvailabilitySchema, response.data, {
      context: 'resourcesApi.getAvailability',
    });
  },

  /** Get weekly availability for a resource. */
  getWeeklyAvailability: async (id: number, startDate: string, weeks?: number): Promise<Record<string, unknown>> => {
    const params: Record<string, string | number> = { start_date: startDate };
    if (weeks) params.weeks = weeks;
    const response = await apiClient.get(`${BASE_URL}/resources/${id}/availability/weekly/`, { params });
    return response.data;
  },

  /** Check if a specific time slot is available. */
  checkSlotAvailability: async (
    id: number,
    date: string,
    startTime: string,
    durationMinutes: number,
  ): Promise<SlotCheckResult> => {
    const response = await apiClient.get(`${BASE_URL}/resources/${id}/availability/check/`, {
      params: { date, start_time: startTime, duration_minutes: durationMinutes },
    });
    return parseResponse(SlotCheckResultSchema, response.data, {
      context: 'resourcesApi.checkSlotAvailability',
    });
  },
};

// =============================================================================
// Schedules API
// =============================================================================

export const schedulesApi = {
  list: async (params?: ScheduleListParams): Promise<PaginatedSchedules> => {
    const response = await apiClient.get(`${BASE_URL}/schedules/`, { params });
    return parseResponse(PaginatedScheduleListSchema, response.data, {
      context: 'schedulesApi.list',
    });
  },

  get: async (id: number): Promise<Schedule> => {
    const response = await apiClient.get(`${BASE_URL}/schedules/${id}/`);
    return parseResponse(ScheduleSchema, response.data, {
      context: 'schedulesApi.get',
    });
  },

  create: async (data: ScheduleCreateData): Promise<Schedule> => {
    const response = await apiClient.post(`${BASE_URL}/schedules/`, data);
    return parseResponse(ScheduleSchema, response.data, {
      context: 'schedulesApi.create',
    });
  },

  update: async (id: number, data: Partial<ScheduleCreateData>): Promise<Schedule> => {
    const response = await apiClient.patch(`${BASE_URL}/schedules/${id}/`, data);
    return parseResponse(ScheduleSchema, response.data, {
      context: 'schedulesApi.update',
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/schedules/${id}/`);
  },

  /** List breaks for a schedule. */
  listBreaks: async (scheduleId: number): Promise<ScheduleBreak[]> => {
    const response = await apiClient.get(`${BASE_URL}/schedules/${scheduleId}/breaks/`);
    return parseResponse(ScheduleBreakSchema.array(), response.data, {
      context: 'schedulesApi.listBreaks',
    });
  },

  /** Add a break to a schedule. */
  addBreak: async (scheduleId: number, data: ScheduleBreakCreateData): Promise<ScheduleBreak> => {
    const response = await apiClient.post(`${BASE_URL}/schedules/${scheduleId}/breaks/`, data);
    return parseResponse(ScheduleBreakSchema, response.data, {
      context: 'schedulesApi.addBreak',
    });
  },
};

// =============================================================================
// Appointments API
// =============================================================================

export const appointmentsApi = {
  list: async (params?: AppointmentListParams): Promise<PaginatedAppointments> => {
    const response = await apiClient.get(`${BASE_URL}/appointments/`, { params });
    return parseResponse(PaginatedAppointmentListSchema, response.data, {
      context: 'appointmentsApi.list',
    });
  },

  get: async (id: number): Promise<Appointment> => {
    const response = await apiClient.get(`${BASE_URL}/appointments/${id}/`);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.get',
    });
  },

  create: async (data: AppointmentCreateData): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/`, data);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.create',
    });
  },

  update: async (id: number, data: Partial<AppointmentCreateData>): Promise<Appointment> => {
    const response = await apiClient.patch(`${BASE_URL}/appointments/${id}/`, data);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.update',
    });
  },

  /** Confirm an appointment. */
  confirm: async (id: number): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/${id}/confirm/`);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.confirm',
    });
  },

  /** Check in a patient for an appointment. */
  checkIn: async (id: number): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/${id}/check-in/`);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.checkIn',
    });
  },

  /** Start an appointment. */
  start: async (id: number): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/${id}/start/`);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.start',
    });
  },

  /** Complete an appointment. */
  complete: async (id: number, notes?: string): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/${id}/complete/`, { notes: notes || '' });
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.complete',
    });
  },

  /** Cancel an appointment. */
  cancel: async (id: number, reason?: string): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/${id}/cancel/`, { reason: reason || '' });
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.cancel',
    });
  },

  /** Mark an appointment as no-show. */
  noShow: async (id: number): Promise<Appointment> => {
    const response = await apiClient.post(`${BASE_URL}/appointments/${id}/no-show/`);
    return parseResponse(AppointmentSchema, response.data, {
      context: 'appointmentsApi.noShow',
    });
  },
};

// =============================================================================
// Shifts / Duty Roster API
// =============================================================================

export const shiftsApi = {
  list: async (params?: ShiftListParams): Promise<PaginatedShifts> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/`, { params });
    return parseResponse(PaginatedShiftListSchema, response.data, {
      context: 'shiftsApi.list',
    });
  },

  get: async (id: number): Promise<Shift> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/${id}/`);
    return parseResponse(ShiftSchema, response.data, {
      context: 'shiftsApi.get',
    });
  },

  create: async (data: ShiftCreateData): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/`, data);
    return parseResponse(ShiftSchema, response.data, {
      context: 'shiftsApi.create',
    });
  },

  update: async (id: number, data: Partial<ShiftCreateData>): Promise<Shift> => {
    const response = await apiClient.patch(`${BASE_URL}/shifts/${id}/`, data);
    return parseResponse(ShiftSchema, response.data, {
      context: 'shiftsApi.update',
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/shifts/${id}/`);
  },

  /** Clock in / start a shift. */
  start: async (id: number): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${id}/start/`);
    return parseResponse(ShiftSchema, response.data, {
      context: 'shiftsApi.start',
    });
  },

  /** Clock out / complete a shift. */
  complete: async (id: number): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${id}/complete/`);
    return parseResponse(ShiftSchema, response.data, {
      context: 'shiftsApi.complete',
    });
  },

  /** Cancel a shift. */
  cancel: async (id: number, reason: string): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${id}/cancel/`, { reason });
    return parseResponse(ShiftSchema, response.data, {
      context: 'shiftsApi.cancel',
    });
  },

  /** Get staff workload aggregation for a date range. */
  staffWorkload: async (params?: { from_date?: string; to_date?: string }): Promise<StaffWorkload[]> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/staff-workload/`, { params });
    return parseResponse(StaffWorkloadSchema.array(), response.data, {
      context: 'shiftsApi.staffWorkload',
    });
  },

  /** Bulk-create shifts for a roster grid. Skips duplicates. */
  bulkCreate: async (payload: BulkCreateShiftsPayload): Promise<BulkCreateShiftsResult> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/bulk-create/`, payload, {
      timeout: 120000, // 2 minutes — large rosters can take time
    });
    return response.data;
  },

  /** Bulk-delete shifts in a date range. Pass includeAll to also remove active/completed shifts. */
  bulkDelete: async (fromDate: string, toDate: string, includeAll = false): Promise<{ deleted: number }> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/bulk-delete/`, {
      from_date: fromDate,
      to_date: toDate,
      include_all: includeAll,
    });
    return response.data;
  },

  /** Check for cross-facility scheduling conflicts. */
  crossFacilityConflicts: async (params: { from_date: string; to_date: string }): Promise<CrossFacilityConflict[]> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/cross-facility-conflicts/`, { params });
    return response.data;
  },
};

// =============================================================================
// Scheduling Settings API
// =============================================================================

export const schedulingSettingsApi = {
  /** Get or create the current facility's scheduling settings. */
  getCurrent: async (): Promise<SchedulingSettings> => {
    const response = await apiClient.get(`${BASE_URL}/settings/current/`);
    return parseResponse(SchedulingSettingsSchema, response.data, {
      context: 'schedulingSettingsApi.getCurrent',
    });
  },

  /** Update scheduling settings. */
  update: async (id: number, data: Partial<SchedulingSettings>): Promise<SchedulingSettings> => {
    const response = await apiClient.patch(`${BASE_URL}/settings/${id}/`, data);
    return parseResponse(SchedulingSettingsSchema, response.data, {
      context: 'schedulingSettingsApi.update',
    });
  },
};

// =============================================================================
// Staff Constraints API
// =============================================================================

export const staffConstraintsApi = {
  list: async (params?: { staff_resource?: number; is_active?: boolean; page?: number; page_size?: number }): Promise<{ count: number; results: StaffConstraint[] }> => {
    const response = await apiClient.get(`${BASE_URL}/constraints/`, { params });
    return parseResponse(PaginatedStaffConstraintSchema, response.data, {
      context: 'staffConstraintsApi.list',
    });
  },

  get: async (id: number): Promise<StaffConstraint> => {
    const response = await apiClient.get(`${BASE_URL}/constraints/${id}/`);
    return parseResponse(StaffConstraintSchema, response.data, {
      context: 'staffConstraintsApi.get',
    });
  },

  create: async (data: StaffConstraintCreateData): Promise<StaffConstraint> => {
    const response = await apiClient.post(`${BASE_URL}/constraints/`, data);
    return parseResponse(StaffConstraintSchema, response.data, {
      context: 'staffConstraintsApi.create',
    });
  },

  update: async (id: number, data: Partial<StaffConstraintCreateData>): Promise<StaffConstraint> => {
    const response = await apiClient.patch(`${BASE_URL}/constraints/${id}/`, data);
    return parseResponse(StaffConstraintSchema, response.data, {
      context: 'staffConstraintsApi.update',
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/constraints/${id}/`);
  },
};

// =============================================================================
// Attendance / Clock-In API
// =============================================================================

export const attendanceApi = {
  /** Get the current user's shift(s) for today with attendance status. */
  myToday: async (): Promise<MyTodayResponse> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/my-today/`);
    return parseResponse(MyTodayResponseSchema, response.data, {
      context: 'attendanceApi.myToday',
    });
  },

  /** Get live on-duty overview for managers. */
  onDuty: async (): Promise<OnDutyResponse> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/on-duty/`);
    return parseResponse(OnDutyResponseSchema, response.data, {
      context: 'attendanceApi.onDuty',
    });
  },

  /** Get the current user's shift history with stats. */
  myHistory: async (params?: MyHistoryParams): Promise<MyHistoryResponse> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/my-history/`, { params });
    return parseResponse(MyHistoryResponseSchema, response.data, {
      context: 'attendanceApi.myHistory',
    });
  },

  /** Clock in to a shift. */
  clockIn: async (shiftId: number, payload?: ClockInPayload): Promise<ClockInResponse> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${shiftId}/start/`, payload ?? {});
    return parseResponse(ClockInResponseSchema, response.data, {
      context: 'attendanceApi.clockIn',
    });
  },

  /** Emergency clock-in: create an ad-hoc shift and immediately clock in. */
  emergencyClockIn: async (payload: EmergencyClockInPayload): Promise<ClockInResponse> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/emergency-clock-in/`, payload);
    return parseResponse(ClockInResponseSchema, response.data, {
      context: 'attendanceApi.emergencyClockIn',
    });
  },

  /** Clock out of a shift. */
  clockOut: async (shiftId: number): Promise<ClockOutResponse> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${shiftId}/complete/`);
    return parseResponse(ClockOutResponseSchema, response.data, {
      context: 'attendanceApi.clockOut',
    });
  },

  /** Take a break during an active shift. */
  takeBreak: async (shiftId: number): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${shiftId}/take-break/`);
    return parseResponse(ShiftSchema, response.data, {
      context: 'attendanceApi.takeBreak',
    });
  },

  /** Resume shift from break. */
  resume: async (shiftId: number): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/${shiftId}/resume/`);
    return parseResponse(ShiftSchema, response.data, {
      context: 'attendanceApi.resume',
    });
  },

  /** Get weekly attendance trends for chart rendering. */
  trends: async (params?: AttendanceTrendsParams): Promise<AttendanceTrendWeek[]> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/attendance-trends/`, { params });
    return parseResponse(AttendanceTrendsResponseSchema, response.data, {
      context: 'attendanceApi.trends',
    });
  },

  /** Clock in via QR code scan. */
  qrClockIn: async (payload: QRClockInPayload): Promise<Shift> => {
    const response = await apiClient.post(`${BASE_URL}/shifts/qr-clock-in/`, payload);
    return parseResponse(ShiftSchema, response.data, {
      context: 'attendanceApi.qrClockIn',
    });
  },

  /** Generate a rotating QR token for the current facility. */
  getQRToken: async (): Promise<QRTokenResponse> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/qr-token/`);
    return parseResponse(QRTokenResponseSchema, response.data, {
      context: 'attendanceApi.getQRToken',
    });
  },

  /** Export attendance data as CSV for payroll processing. */
  payrollExport: async (params: PayrollExportParams): Promise<Blob> => {
    const response = await apiClient.get(`${BASE_URL}/shifts/payroll-export/`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

// =============================================================================
// Shift Swaps API
// =============================================================================

export interface PaginatedShiftSwaps {
  count: number;
  next: string | null;
  previous: string | null;
  results: ShiftSwapListItem[];
}

export const shiftSwapsApi = {
  /** List all swap requests (paginated). */
  list: async (params?: Record<string, unknown>): Promise<PaginatedShiftSwaps> => {
    const response = await apiClient.get(`${BASE_URL}/shift-swaps/`, { params });
    return parseResponse(PaginatedShiftSwapListSchema, response.data, {
      context: 'shiftSwapsApi.list',
    });
  },

  /** Get swap request detail. */
  get: async (id: number): Promise<ShiftSwapRequest> => {
    const response = await apiClient.get(`${BASE_URL}/shift-swaps/${id}/`);
    return parseResponse(ShiftSwapRequestSchema, response.data, {
      context: 'shiftSwapsApi.get',
    });
  },

  /** Create a swap request. */
  create: async (data: ShiftSwapCreateData): Promise<ShiftSwapRequest> => {
    const response = await apiClient.post(`${BASE_URL}/shift-swaps/`, data);
    return parseResponse(ShiftSwapRequestSchema, response.data, {
      context: 'shiftSwapsApi.create',
    });
  },

  /** Delete a PENDING swap request. */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/shift-swaps/${id}/`);
  },

  /** Accept a swap request. */
  accept: async (id: number, data?: ShiftSwapAcceptData): Promise<ShiftSwapRequest> => {
    const response = await apiClient.post(`${BASE_URL}/shift-swaps/${id}/accept/`, data ?? {});
    return parseResponse(ShiftSwapRequestSchema, response.data, {
      context: 'shiftSwapsApi.accept',
    });
  },

  /** Reject a swap request. */
  reject: async (id: number, data?: ShiftSwapRejectData): Promise<ShiftSwapRequest> => {
    const response = await apiClient.post(`${BASE_URL}/shift-swaps/${id}/reject/`, data ?? {});
    return parseResponse(ShiftSwapRequestSchema, response.data, {
      context: 'shiftSwapsApi.reject',
    });
  },

  /** Approve a swap request (manager). */
  approve: async (id: number, data?: ShiftSwapApproveData): Promise<ShiftSwapRequest> => {
    const response = await apiClient.post(`${BASE_URL}/shift-swaps/${id}/approve/`, data ?? {});
    return parseResponse(ShiftSwapRequestSchema, response.data, {
      context: 'shiftSwapsApi.approve',
    });
  },

  /** Cancel own swap request. */
  cancel: async (id: number): Promise<ShiftSwapRequest> => {
    const response = await apiClient.post(`${BASE_URL}/shift-swaps/${id}/cancel/`);
    return parseResponse(ShiftSwapRequestSchema, response.data, {
      context: 'shiftSwapsApi.cancel',
    });
  },

  /** List open swap requests the current user can accept. */
  available: async (): Promise<ShiftSwapListItem[]> => {
    const response = await apiClient.get(`${BASE_URL}/shift-swaps/available/`);
    return parseResponse(z.array(ShiftSwapListItemSchema), response.data, {
      context: 'shiftSwapsApi.available',
    });
  },

  /** List swap requests created by or targeting the current user. */
  myRequests: async (): Promise<ShiftSwapListItem[]> => {
    const response = await apiClient.get(`${BASE_URL}/shift-swaps/my-requests/`);
    return parseResponse(z.array(ShiftSwapListItemSchema), response.data, {
      context: 'shiftSwapsApi.myRequests',
    });
  },
};

/**
 * Scheduling API Client
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
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
};

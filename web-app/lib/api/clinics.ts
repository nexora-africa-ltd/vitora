/**
 * Clinics API client.
 *
 * Provides API methods for clinic management, sessions, visits (queue),
 * staff assignments, schedules, and enrollments.
 *
 * All responses are validated with Zod schemas to catch data shape mismatches
 * at runtime before they cause errors in components.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ClinicSchema,
  ClinicListItemSchema,
  ClinicSessionSchema,
  ClinicVisitSchema,
  ClinicStaffSchema,
  ClinicScheduleSchema,
  ClinicEnrollmentSchema,
  ClinicQueueStatsSchema,
  ClinicDashboardStatsSchema,
  PaginatedClinicListSchema,
  PaginatedClinicSessionSchema,
  PaginatedClinicVisitSchema,
  PaginatedClinicEnrollmentSchema,
  ClinicVisitArrayResponseSchema,
  ClinicStaffArrayResponseSchema,
  ClinicScheduleArrayResponseSchema,
} from '@/lib/schemas/clinic.schema';
import type {
  Clinic,
  ClinicListItem,
  ClinicListParams,
  ClinicSession,
  ClinicVisit,
  ClinicVisitCreateData,
  ClinicVisitListParams,
  ClinicVisitReferData,
  ClinicStaff,
  ClinicStaffCreateData,
  ClinicSchedule,
  ClinicScheduleCreateData,
  ClinicEnrollment,
  ClinicEnrollmentCreateData,
  ClinicEnrollmentListParams,
  ClinicQueueStats,
  ClinicDashboardStats,
} from '@/lib/types/clinic';
import type { PaginatedResponse } from '@/lib/types';

// =============================================================================
// CLINIC ENDPOINTS
// =============================================================================

export const clinicsApi = {
  // -------------------------------------------------------------------------
  // Clinic CRUD
  // -------------------------------------------------------------------------

  /**
   * List all clinics
   */
  list: async (params?: ClinicListParams): Promise<PaginatedResponse<ClinicListItem>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicListItem>>('/api/clinics/', { params });
    return parseResponse(PaginatedClinicListSchema, response.data, { context: 'clinicsApi.list' });
  },

  /**
   * Get clinic by ID
   */
  get: async (id: number): Promise<Clinic> => {
    const response = await apiClient.get<Clinic>(`/api/clinics/${id}/`);
    return parseResponse(ClinicSchema, response.data, { context: 'clinicsApi.get' });
  },

  /**
   * Create a new clinic
   */
  create: async (data: Partial<Clinic>): Promise<Clinic> => {
    const response = await apiClient.post<Clinic>('/api/clinics/', data);
    return parseResponse(ClinicSchema, response.data, { context: 'clinicsApi.create' });
  },

  /**
   * Update a clinic
   */
  update: async (id: number, data: Partial<Clinic>): Promise<Clinic> => {
    const response = await apiClient.patch<Clinic>(`/api/clinics/${id}/`, data);
    return parseResponse(ClinicSchema, response.data, { context: 'clinicsApi.update' });
  },

  /**
   * Delete a clinic
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/clinics/${id}/`);
  },

  /**
   * Get clinic dashboard stats
   */
  getDashboard: async (id: number): Promise<ClinicDashboardStats> => {
    const response = await apiClient.get<ClinicDashboardStats>(`/api/clinics/${id}/dashboard/`);
    return parseResponse(ClinicDashboardStatsSchema, response.data, { context: 'clinicsApi.getDashboard' });
  },

  // -------------------------------------------------------------------------
  // Clinic Sessions
  // -------------------------------------------------------------------------

  /**
   * List sessions for a clinic
   */
  listSessions: async (clinicId: number, params?: { date_from?: string; date_to?: string }): Promise<PaginatedResponse<ClinicSession>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicSession>>(`/api/clinics/${clinicId}/sessions/`, { params });
    return parseResponse(PaginatedClinicSessionSchema, response.data, { context: 'clinicsApi.listSessions' });
  },

  /**
   * Get today's session for a clinic
   */
  getTodaySession: async (clinicId: number): Promise<ClinicSession> => {
    const response = await apiClient.get<ClinicSession>(`/api/clinics/${clinicId}/sessions/today/`);
    return parseResponse(ClinicSessionSchema, response.data, { context: 'clinicsApi.getTodaySession' });
  },

  /**
   * Open today's session
   */
  openSession: async (clinicId: number): Promise<ClinicSession> => {
    const response = await apiClient.post<ClinicSession>(`/api/clinics/${clinicId}/sessions/today/open/`);
    return parseResponse(ClinicSessionSchema, response.data, { context: 'clinicsApi.openSession' });
  },

  /**
   * Close today's session
   */
  closeSession: async (clinicId: number): Promise<ClinicSession> => {
    const response = await apiClient.post<ClinicSession>(`/api/clinics/${clinicId}/sessions/today/close/`);
    return parseResponse(ClinicSessionSchema, response.data, { context: 'clinicsApi.closeSession' });
  },

  // -------------------------------------------------------------------------
  // Clinic Queue
  // -------------------------------------------------------------------------

  /**
   * Get current queue for a clinic
   */
  getQueue: async (clinicId: number): Promise<ClinicVisit[]> => {
    const response = await apiClient.get<{ results: ClinicVisit[] }>(`/api/clinics/${clinicId}/queue/`);
    const validated = parseResponse(ClinicVisitArrayResponseSchema, response.data, { context: 'clinicsApi.getQueue' });
    return validated.results;
  },

  /**
   * Add patient to queue
   */
  addToQueue: async (clinicId: number, data: ClinicVisitCreateData): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinics/${clinicId}/queue/`, data);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.addToQueue' });
  },

  /**
   * Get queue statistics
   */
  getQueueStats: async (clinicId: number): Promise<ClinicQueueStats> => {
    const response = await apiClient.get<ClinicQueueStats>(`/api/clinics/${clinicId}/queue/stats/`);
    return parseResponse(ClinicQueueStatsSchema, response.data, { context: 'clinicsApi.getQueueStats' });
  },

  // -------------------------------------------------------------------------
  // Clinic Visits
  // -------------------------------------------------------------------------

  /**
   * List all visits (filtered)
   */
  listVisits: async (params?: ClinicVisitListParams): Promise<PaginatedResponse<ClinicVisit>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicVisit>>('/api/clinic-visits/', { params });
    return parseResponse(PaginatedClinicVisitSchema, response.data, { context: 'clinicsApi.listVisits' });
  },

  /**
   * Get visit by ID
   */
  getVisit: async (id: number): Promise<ClinicVisit> => {
    const response = await apiClient.get<ClinicVisit>(`/api/clinic-visits/${id}/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.getVisit' });
  },

  /**
   * Create a visit
   */
  createVisit: async (data: ClinicVisitCreateData): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>('/api/clinic-visits/', data);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.createVisit' });
  },

  /**
   * Update a visit
   */
  updateVisit: async (id: number, data: Partial<ClinicVisit>): Promise<ClinicVisit> => {
    const response = await apiClient.patch<ClinicVisit>(`/api/clinic-visits/${id}/`, data);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.updateVisit' });
  },

  /**
   * Call a patient (summon from queue)
   */
  callPatient: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/call/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.callPatient' });
  },

  /**
   * Start consultation
   */
  startConsultation: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/start/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.startConsultation' });
  },

  /**
   * Complete visit
   */
  completeVisit: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/complete/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.completeVisit' });
  },

  /**
   * Refer patient to another clinic
   */
  referVisit: async (visitId: number, data: ClinicVisitReferData): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/refer/`, data);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.referVisit' });
  },

  /**
   * Mark patient as no-show
   */
  markNoShow: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/no-show/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.markNoShow' });
  },

  /**
   * Cancel visit
   */
  cancelVisit: async (visitId: number, reason?: string): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/cancel/`, { reason });
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicsApi.cancelVisit' });
  },

  // -------------------------------------------------------------------------
  // Clinic Staff
  // -------------------------------------------------------------------------

  /**
   * List staff for a clinic
   */
  listStaff: async (clinicId: number): Promise<ClinicStaff[]> => {
    const response = await apiClient.get<{ results: ClinicStaff[] }>(`/api/clinics/${clinicId}/staff/`);
    const validated = parseResponse(ClinicStaffArrayResponseSchema, response.data, { context: 'clinicsApi.listStaff' });
    return validated.results;
  },

  /**
   * Assign staff to clinic
   */
  assignStaff: async (clinicId: number, data: ClinicStaffCreateData): Promise<ClinicStaff> => {
    const response = await apiClient.post<ClinicStaff>(`/api/clinics/${clinicId}/staff/`, data);
    return parseResponse(ClinicStaffSchema, response.data, { context: 'clinicsApi.assignStaff' });
  },

  /**
   * Remove staff from clinic
   */
  removeStaff: async (clinicId: number, userId: number): Promise<void> => {
    await apiClient.delete(`/api/clinics/${clinicId}/staff/${userId}/`);
  },

  // -------------------------------------------------------------------------
  // Clinic Schedule
  // -------------------------------------------------------------------------

  /**
   * Get clinic schedule
   */
  getSchedule: async (clinicId: number): Promise<ClinicSchedule[]> => {
    const response = await apiClient.get<{ results: ClinicSchedule[] }>(`/api/clinics/${clinicId}/schedule/`);
    const validated = parseResponse(ClinicScheduleArrayResponseSchema, response.data, { context: 'clinicsApi.getSchedule' });
    return validated.results;
  },

  /**
   * Add schedule entry
   */
  addSchedule: async (clinicId: number, data: ClinicScheduleCreateData): Promise<ClinicSchedule> => {
    const response = await apiClient.post<ClinicSchedule>(`/api/clinics/${clinicId}/schedule/`, data);
    return parseResponse(ClinicScheduleSchema, response.data, { context: 'clinicsApi.addSchedule' });
  },

  /**
   * Update schedule entry
   */
  updateSchedule: async (clinicId: number, scheduleId: number, data: Partial<ClinicScheduleCreateData>): Promise<ClinicSchedule> => {
    const response = await apiClient.patch<ClinicSchedule>(`/api/clinics/${clinicId}/schedule/${scheduleId}/`, data);
    return parseResponse(ClinicScheduleSchema, response.data, { context: 'clinicsApi.updateSchedule' });
  },

  /**
   * Delete schedule entry
   */
  deleteSchedule: async (clinicId: number, scheduleId: number): Promise<void> => {
    await apiClient.delete(`/api/clinics/${clinicId}/schedule/${scheduleId}/`);
  },

  // -------------------------------------------------------------------------
  // Clinic Enrollments (Chronic Care)
  // -------------------------------------------------------------------------

  /**
   * List enrollments
   */
  listEnrollments: async (params?: ClinicEnrollmentListParams): Promise<PaginatedResponse<ClinicEnrollment>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicEnrollment>>('/api/clinic-enrollments/', { params });
    return parseResponse(PaginatedClinicEnrollmentSchema, response.data, { context: 'clinicsApi.listEnrollments' });
  },

  /**
   * Get enrollment by ID
   */
  getEnrollment: async (id: number): Promise<ClinicEnrollment> => {
    const response = await apiClient.get<ClinicEnrollment>(`/api/clinic-enrollments/${id}/`);
    return parseResponse(ClinicEnrollmentSchema, response.data, { context: 'clinicsApi.getEnrollment' });
  },

  /**
   * Create enrollment
   */
  createEnrollment: async (data: ClinicEnrollmentCreateData): Promise<ClinicEnrollment> => {
    const response = await apiClient.post<ClinicEnrollment>('/api/clinic-enrollments/', data);
    return parseResponse(ClinicEnrollmentSchema, response.data, { context: 'clinicsApi.createEnrollment' });
  },

  /**
   * Update enrollment
   */
  updateEnrollment: async (id: number, data: Partial<ClinicEnrollment>): Promise<ClinicEnrollment> => {
    const response = await apiClient.patch<ClinicEnrollment>(`/api/clinic-enrollments/${id}/`, data);
    return parseResponse(ClinicEnrollmentSchema, response.data, { context: 'clinicsApi.updateEnrollment' });
  },

  /**
   * Get overdue enrollments
   */
  getOverdueEnrollments: async (): Promise<PaginatedResponse<ClinicEnrollment>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicEnrollment>>('/api/clinic-enrollments/overdue/');
    return parseResponse(PaginatedClinicEnrollmentSchema, response.data, { context: 'clinicsApi.getOverdueEnrollments' });
  },

  /**
   * Get defaulters (lost to follow-up)
   */
  getDefaulters: async (): Promise<PaginatedResponse<ClinicEnrollment>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicEnrollment>>('/api/clinic-enrollments/defaulters/');
    return parseResponse(PaginatedClinicEnrollmentSchema, response.data, { context: 'clinicsApi.getDefaulters' });
  },
};

export default clinicsApi;

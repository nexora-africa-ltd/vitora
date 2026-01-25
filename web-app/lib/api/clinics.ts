/**
 * Clinics API client.
 *
 * Provides API methods for clinic management, sessions, visits (queue),
 * staff assignments, schedules, and enrollments.
 */

import { apiClient } from './client';
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
    return response.data;
  },

  /**
   * Get clinic by ID
   */
  get: async (id: number): Promise<Clinic> => {
    const response = await apiClient.get<Clinic>(`/api/clinics/${id}/`);
    return response.data;
  },

  /**
   * Create a new clinic
   */
  create: async (data: Partial<Clinic>): Promise<Clinic> => {
    const response = await apiClient.post<Clinic>('/api/clinics/', data);
    return response.data;
  },

  /**
   * Update a clinic
   */
  update: async (id: number, data: Partial<Clinic>): Promise<Clinic> => {
    const response = await apiClient.patch<Clinic>(`/api/clinics/${id}/`, data);
    return response.data;
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
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Clinic Sessions
  // -------------------------------------------------------------------------

  /**
   * List sessions for a clinic
   */
  listSessions: async (clinicId: number, params?: { date_from?: string; date_to?: string }): Promise<PaginatedResponse<ClinicSession>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicSession>>(`/api/clinics/${clinicId}/sessions/`, { params });
    return response.data;
  },

  /**
   * Get today's session for a clinic
   */
  getTodaySession: async (clinicId: number): Promise<ClinicSession> => {
    const response = await apiClient.get<ClinicSession>(`/api/clinics/${clinicId}/sessions/today/`);
    return response.data;
  },

  /**
   * Open today's session
   */
  openSession: async (clinicId: number): Promise<ClinicSession> => {
    const response = await apiClient.post<ClinicSession>(`/api/clinics/${clinicId}/sessions/today/open/`);
    return response.data;
  },

  /**
   * Close today's session
   */
  closeSession: async (clinicId: number): Promise<ClinicSession> => {
    const response = await apiClient.post<ClinicSession>(`/api/clinics/${clinicId}/sessions/today/close/`);
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Clinic Queue
  // -------------------------------------------------------------------------

  /**
   * Get current queue for a clinic
   */
  getQueue: async (clinicId: number): Promise<ClinicVisit[]> => {
    const response = await apiClient.get<{ results: ClinicVisit[] }>(`/api/clinics/${clinicId}/queue/`);
    return response.data.results;
  },

  /**
   * Add patient to queue
   */
  addToQueue: async (clinicId: number, data: ClinicVisitCreateData): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinics/${clinicId}/queue/`, data);
    return response.data;
  },

  /**
   * Get queue statistics
   */
  getQueueStats: async (clinicId: number): Promise<ClinicQueueStats> => {
    const response = await apiClient.get<ClinicQueueStats>(`/api/clinics/${clinicId}/queue/stats/`);
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Clinic Visits
  // -------------------------------------------------------------------------

  /**
   * List all visits (filtered)
   */
  listVisits: async (params?: ClinicVisitListParams): Promise<PaginatedResponse<ClinicVisit>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicVisit>>('/api/clinic-visits/', { params });
    return response.data;
  },

  /**
   * Get visit by ID
   */
  getVisit: async (id: number): Promise<ClinicVisit> => {
    const response = await apiClient.get<ClinicVisit>(`/api/clinic-visits/${id}/`);
    return response.data;
  },

  /**
   * Create a visit
   */
  createVisit: async (data: ClinicVisitCreateData): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>('/api/clinic-visits/', data);
    return response.data;
  },

  /**
   * Update a visit
   */
  updateVisit: async (id: number, data: Partial<ClinicVisit>): Promise<ClinicVisit> => {
    const response = await apiClient.patch<ClinicVisit>(`/api/clinic-visits/${id}/`, data);
    return response.data;
  },

  /**
   * Call a patient (summon from queue)
   */
  callPatient: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/call/`);
    return response.data;
  },

  /**
   * Start consultation
   */
  startConsultation: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/start/`);
    return response.data;
  },

  /**
   * Complete visit
   */
  completeVisit: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/complete/`);
    return response.data;
  },

  /**
   * Refer patient to another clinic
   */
  referVisit: async (visitId: number, data: ClinicVisitReferData): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/refer/`, data);
    return response.data;
  },

  /**
   * Mark patient as no-show
   */
  markNoShow: async (visitId: number): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/no-show/`);
    return response.data;
  },

  /**
   * Cancel visit
   */
  cancelVisit: async (visitId: number, reason?: string): Promise<ClinicVisit> => {
    const response = await apiClient.post<ClinicVisit>(`/api/clinic-visits/${visitId}/cancel/`, { reason });
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Clinic Staff
  // -------------------------------------------------------------------------

  /**
   * List staff for a clinic
   */
  listStaff: async (clinicId: number): Promise<ClinicStaff[]> => {
    const response = await apiClient.get<ClinicStaff[]>(`/api/clinics/${clinicId}/staff/`);
    return response.data;
  },

  /**
   * Assign staff to clinic
   */
  assignStaff: async (clinicId: number, data: ClinicStaffCreateData): Promise<ClinicStaff> => {
    const response = await apiClient.post<ClinicStaff>(`/api/clinics/${clinicId}/staff/`, data);
    return response.data;
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
    const response = await apiClient.get<ClinicSchedule[]>(`/api/clinics/${clinicId}/schedule/`);
    return response.data;
  },

  /**
   * Add schedule entry
   */
  addSchedule: async (clinicId: number, data: ClinicScheduleCreateData): Promise<ClinicSchedule> => {
    const response = await apiClient.post<ClinicSchedule>(`/api/clinics/${clinicId}/schedule/`, data);
    return response.data;
  },

  /**
   * Update schedule entry
   */
  updateSchedule: async (clinicId: number, scheduleId: number, data: Partial<ClinicScheduleCreateData>): Promise<ClinicSchedule> => {
    const response = await apiClient.patch<ClinicSchedule>(`/api/clinics/${clinicId}/schedule/${scheduleId}/`, data);
    return response.data;
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
    return response.data;
  },

  /**
   * Get enrollment by ID
   */
  getEnrollment: async (id: number): Promise<ClinicEnrollment> => {
    const response = await apiClient.get<ClinicEnrollment>(`/api/clinic-enrollments/${id}/`);
    return response.data;
  },

  /**
   * Create enrollment
   */
  createEnrollment: async (data: ClinicEnrollmentCreateData): Promise<ClinicEnrollment> => {
    const response = await apiClient.post<ClinicEnrollment>('/api/clinic-enrollments/', data);
    return response.data;
  },

  /**
   * Update enrollment
   */
  updateEnrollment: async (id: number, data: Partial<ClinicEnrollment>): Promise<ClinicEnrollment> => {
    const response = await apiClient.patch<ClinicEnrollment>(`/api/clinic-enrollments/${id}/`, data);
    return response.data;
  },

  /**
   * Get overdue enrollments
   */
  getOverdueEnrollments: async (): Promise<PaginatedResponse<ClinicEnrollment>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicEnrollment>>('/api/clinic-enrollments/overdue/');
    return response.data;
  },

  /**
   * Get defaulters (lost to follow-up)
   */
  getDefaulters: async (): Promise<PaginatedResponse<ClinicEnrollment>> => {
    const response = await apiClient.get<PaginatedResponse<ClinicEnrollment>>('/api/clinic-enrollments/defaulters/');
    return response.data;
  },
};

export default clinicsApi;

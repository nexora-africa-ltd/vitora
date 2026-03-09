/**
 * Clinics Module Hooks
 *
 * React Query hooks for clinic operations including:
 * - Clinic CRUD and listing
 * - Session management
 * - Queue management and visits
 * - Staff assignments
 * - Enrollments (chronic care)
 *
 * Queue mutations sync to patient-journey store for real-time tracking.
 */

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicsApi } from '@/lib/api/clinics';
import { consultationQueueKeys } from '@/lib/hooks/use-consultation-queue';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';
import type { PaginatedResponse } from '@/lib/types';
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

// =============================================================================
// QUERY KEYS
// =============================================================================

export const clinicKeys = {
  all: ['clinics'] as const,
  lists: () => [...clinicKeys.all, 'list'] as const,
  list: (params?: ClinicListParams) => [...clinicKeys.lists(), params] as const,
  infiniteList: (params?: Omit<ClinicListParams, 'page'>) => [...clinicKeys.lists(), 'infinite', params] as const,
  details: () => [...clinicKeys.all, 'detail'] as const,
  detail: (id: number) => [...clinicKeys.details(), id] as const,
  dashboard: (id: number) => [...clinicKeys.all, 'dashboard', id] as const,

  // Sessions
  sessions: (clinicId: number) => [...clinicKeys.all, 'sessions', clinicId] as const,
  todaySession: (clinicId: number) => [...clinicKeys.all, 'session', 'today', clinicId] as const,

  // Queue
  queue: (clinicId: number) => [...clinicKeys.all, 'queue', clinicId] as const,
  queueStats: (clinicId: number) => [...clinicKeys.all, 'queue-stats', clinicId] as const,

  // Visits
  visits: () => [...clinicKeys.all, 'visits'] as const,
  visitsList: (params?: ClinicVisitListParams) => [...clinicKeys.visits(), 'list', params] as const,
  visit: (id: number) => [...clinicKeys.visits(), id] as const,

  // Staff
  staff: (clinicId: number) => [...clinicKeys.all, 'staff', clinicId] as const,

  // Schedule
  schedule: (clinicId: number) => [...clinicKeys.all, 'schedule', clinicId] as const,

  // Enrollments
  enrollments: () => [...clinicKeys.all, 'enrollments'] as const,
  enrollmentsList: (params?: ClinicEnrollmentListParams) => [...clinicKeys.enrollments(), 'list', params] as const,
  enrollment: (id: number) => [...clinicKeys.enrollments(), id] as const,
  overdueEnrollments: () => [...clinicKeys.enrollments(), 'overdue'] as const,
  defaulters: () => [...clinicKeys.enrollments(), 'defaulters'] as const,
};

// =============================================================================
// CLINIC HOOKS
// =============================================================================

/**
 * Fetch list of clinics
 */
export function useClinics(params?: ClinicListParams) {
  return useQuery({
    queryKey: clinicKeys.list(params),
    queryFn: () => clinicsApi.list(params),
  });
}

/**
 * Fetch clinics with infinite pagination support.
 */
export function useInfiniteClinics(params?: Omit<ClinicListParams, 'page'>) {
  return useInfiniteQuery<PaginatedResponse<ClinicListItem>>({
    queryKey: clinicKeys.infiniteList(params),
    queryFn: ({ pageParam }) =>
      clinicsApi.list({
        ...params,
        page: pageParam as number,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.next ? allPages.length + 1 : undefined,
    initialPageParam: 1,
  });
}

/**
 * Fetch a single clinic by ID
 */
export function useClinic(id: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.detail(id!),
    queryFn: () => clinicsApi.get(id!),
    enabled: !!id,
  });
}

/**
 * Fetch clinic dashboard stats
 */
export function useClinicDashboard(id: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.dashboard(id!),
    queryFn: () => clinicsApi.getDashboard(id!),
    enabled: !!id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Create a new clinic
 */
export function useCreateClinic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Clinic>) => clinicsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.lists() });
    },
  });
}

/**
 * Update a clinic
 */
export function useUpdateClinic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Clinic> }) => clinicsApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.lists() });
    },
  });
}

/**
 * Delete a clinic
 */
export function useDeleteClinic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => clinicsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.lists() });
    },
  });
}

// =============================================================================
// SESSION HOOKS
// =============================================================================

/**
 * Fetch sessions for a clinic
 */
export function useClinicSessions(clinicId: number | undefined, params?: { date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: clinicKeys.sessions(clinicId!),
    queryFn: () => clinicsApi.listSessions(clinicId!, params),
    enabled: !!clinicId,
  });
}

/**
 * Fetch today's session for a clinic
 */
export function useTodaySession(clinicId: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.todaySession(clinicId!),
    queryFn: () => clinicsApi.getTodaySession(clinicId!),
    enabled: !!clinicId,
  });
}

/**
 * Open today's session
 */
export function useOpenSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clinicId: number) => clinicsApi.openSession(clinicId),
    onSuccess: (_data, clinicId) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.todaySession(clinicId) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.sessions(clinicId) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.dashboard(clinicId) });
    },
  });
}

/**
 * Close today's session
 */
export function useCloseSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clinicId: number) => clinicsApi.closeSession(clinicId),
    onSuccess: (_data, clinicId) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.todaySession(clinicId) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.sessions(clinicId) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.dashboard(clinicId) });
    },
  });
}

// =============================================================================
// QUEUE HOOKS
// =============================================================================

/**
 * Fetch current queue for a clinic
 */
export function useClinicQueue(clinicId: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.queue(clinicId!),
    queryFn: () => clinicsApi.getQueue(clinicId!),
    enabled: !!clinicId,
    refetchInterval: 15000, // Refresh every 15 seconds for real-time updates
  });
}

/**
 * Fetch queue statistics
 */
export function useQueueStats(clinicId: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.queueStats(clinicId!),
    queryFn: () => clinicsApi.getQueueStats(clinicId!),
    enabled: !!clinicId,
    refetchInterval: 30000,
  });
}

/**
 * Add patient to queue
 */
export function useAddToQueue() {
  const queryClient = useQueryClient();
  const { registerPatient, addToWaitingQueue } = usePatientJourneyStore();

  return useMutation({
    mutationFn: ({ clinicId, data }: { clinicId: number; data: ClinicVisitCreateData }) =>
      clinicsApi.addToQueue(clinicId, data),
    onSuccess: (visit, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: clinicKeys.queue(variables.clinicId) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.queueStats(variables.clinicId) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.dashboard(variables.clinicId) });
      queryClient.invalidateQueries({ queryKey: consultationQueueKeys.all });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });

      // Sync to patient journey store (non-blocking - don't fail mutation on store errors)
      try {
        const patient = visit.patient;
        registerPatient({
          id: patient.id,
          mrn: patient.mrn,
          name: patient.full_name,
          date_of_birth: patient.date_of_birth,
          gender: patient.gender as 'M' | 'F' | 'O' | undefined,
          phone: patient.phone_number,
        });
        addToWaitingQueue(patient.id);
      } catch (error) {
        console.warn('[useAddToQueue] Failed to sync to journey store:', error);
      }
    },
  });
}

// =============================================================================
// VISIT HOOKS
// =============================================================================

/**
 * Fetch list of visits
 */
export function useClinicVisits(params?: ClinicVisitListParams) {
  return useQuery({
    queryKey: clinicKeys.visitsList(params),
    queryFn: () => clinicsApi.listVisits(params),
  });
}

/**
 * Fetch a single visit
 */
export function useClinicVisit(id: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.visit(id!),
    queryFn: () => clinicsApi.getVisit(id!),
    enabled: !!id,
  });
}

/**
 * Call a patient (summon from queue)
 */
export function useCallPatient() {
  const queryClient = useQueryClient();
  const { callPatient } = usePatientJourneyStore();

  return useMutation({
    mutationFn: (visitId: number) => clinicsApi.callPatient(visitId),
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all });

      // Sync to patient journey store (non-blocking)
      try {
        callPatient(visit.patient.id);
      } catch (error) {
        console.warn('[useCallPatient] Failed to sync to journey store:', error);
      }
    },
  });
}

/**
 * Start consultation
 */
export function useStartConsultation() {
  const queryClient = useQueryClient();
  const { startConsultation, setEncounter } = usePatientJourneyStore();

  return useMutation({
    mutationFn: (visitId: number) => clinicsApi.startConsultation(visitId),
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all });

      // Sync to patient journey store (non-blocking)
      try {
        const patientId = visit.patient.id;
        startConsultation(
          patientId,
          visit.assigned_clinician ?? undefined,
          visit.assigned_clinician_name ?? undefined
        );

        // Set encounter if available - use visit_type as encounter type indicator
        if (visit.encounter) {
          const encounterType = visit.visit_type === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'OPD';
          setEncounter(patientId, visit.encounter, encounterType);
        }
      } catch (error) {
        console.warn('[useStartConsultation] Failed to sync to journey store:', error);
      }
    },
  });
}

/**
 * Complete visit
 */
export function useCompleteVisit() {
  const queryClient = useQueryClient();
  const { endConsultation } = usePatientJourneyStore();

  return useMutation({
    mutationFn: (visitId: number) => clinicsApi.completeVisit(visitId),
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all });

      // Sync to patient journey store (non-blocking)
      try {
        endConsultation(visit.patient.id);
      } catch (error) {
        console.warn('[useCompleteVisit] Failed to sync to journey store:', error);
      }
    },
  });
}

/**
 * Refer patient to another clinic
 */
export function useReferVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ visitId, data }: { visitId: number; data: ClinicVisitReferData }) =>
      clinicsApi.referVisit(visitId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all });
    },
  });
}

/**
 * Mark patient as no-show
 */
export function useMarkNoShow() {
  const queryClient = useQueryClient();
  const { markLeftWithoutBeingSeen } = usePatientJourneyStore();

  return useMutation({
    mutationFn: (visitId: number) => clinicsApi.markNoShow(visitId),
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all });

      // Sync to patient journey store (non-blocking)
      try {
        markLeftWithoutBeingSeen(visit.patient.id);
      } catch (error) {
        console.warn('[useMarkNoShow] Failed to sync to journey store:', error);
      }
    },
  });
}

/**
 * Cancel visit
 */
export function useCancelVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ visitId, reason }: { visitId: number; reason?: string }) =>
      clinicsApi.cancelVisit(visitId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.all });
    },
  });
}

// =============================================================================
// STAFF HOOKS
// =============================================================================

/**
 * Fetch staff for a clinic
 */
export function useClinicStaff(clinicId: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.staff(clinicId!),
    queryFn: () => clinicsApi.listStaff(clinicId!),
    enabled: !!clinicId,
  });
}

/**
 * Assign staff to clinic
 */
export function useAssignStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clinicId, data }: { clinicId: number; data: ClinicStaffCreateData }) =>
      clinicsApi.assignStaff(clinicId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.staff(variables.clinicId) });
    },
  });
}

/**
 * Remove staff from clinic
 */
export function useRemoveStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clinicId, userId }: { clinicId: number; userId: number }) =>
      clinicsApi.removeStaff(clinicId, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.staff(variables.clinicId) });
    },
  });
}

// =============================================================================
// SCHEDULE HOOKS
// =============================================================================

/**
 * Fetch schedule for a clinic
 */
export function useClinicSchedule(clinicId: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.schedule(clinicId!),
    queryFn: () => clinicsApi.getSchedule(clinicId!),
    enabled: !!clinicId,
  });
}

/**
 * Add schedule entry
 */
export function useAddSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clinicId, data }: { clinicId: number; data: ClinicScheduleCreateData }) =>
      clinicsApi.addSchedule(clinicId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.schedule(variables.clinicId) });
    },
  });
}

/**
 * Update schedule entry
 */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clinicId,
      scheduleId,
      data,
    }: {
      clinicId: number;
      scheduleId: number;
      data: Partial<ClinicScheduleCreateData>;
    }) => clinicsApi.updateSchedule(clinicId, scheduleId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.schedule(variables.clinicId) });
    },
  });
}

/**
 * Delete schedule entry
 */
export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clinicId, scheduleId }: { clinicId: number; scheduleId: number }) =>
      clinicsApi.deleteSchedule(clinicId, scheduleId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.schedule(variables.clinicId) });
    },
  });
}

// =============================================================================
// ENROLLMENT HOOKS
// =============================================================================

/**
 * Fetch list of enrollments
 */
export function useClinicEnrollments(params?: ClinicEnrollmentListParams) {
  return useQuery({
    queryKey: clinicKeys.enrollmentsList(params),
    queryFn: () => clinicsApi.listEnrollments(params),
  });
}

/**
 * Fetch a single enrollment
 */
export function useClinicEnrollment(id: number | undefined) {
  return useQuery({
    queryKey: clinicKeys.enrollment(id!),
    queryFn: () => clinicsApi.getEnrollment(id!),
    enabled: !!id,
  });
}

/**
 * Create enrollment
 */
export function useCreateEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClinicEnrollmentCreateData) => clinicsApi.createEnrollment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.enrollments() });
    },
  });
}

/**
 * Update enrollment
 */
export function useUpdateEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ClinicEnrollment> }) =>
      clinicsApi.updateEnrollment(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clinicKeys.enrollment(variables.id) });
      queryClient.invalidateQueries({ queryKey: clinicKeys.enrollments() });
    },
  });
}

/**
 * Fetch overdue enrollments
 */
export function useOverdueEnrollments() {
  return useQuery({
    queryKey: clinicKeys.overdueEnrollments(),
    queryFn: () => clinicsApi.getOverdueEnrollments(),
  });
}

/**
 * Fetch defaulters
 */
export function useDefaulters() {
  return useQuery({
    queryKey: clinicKeys.defaulters(),
    queryFn: () => clinicsApi.getDefaulters(),
  });
}

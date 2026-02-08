/**
 * Triage Module Hooks
 *
 * React Query hooks for triage module API operations.
 * Provides data fetching, mutations, and caching for triage assessments,
 * queue management, and reporting.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { triageApi } from '@/lib/api/triage';
import type {
  TriageAssessment,
  TriageAssessmentCreateData,
  TriageQueueEntry,
  TriageVitalThreshold,
  TriageReportSummary,
  TriageCategory,
  AssignedArea,
  TriageAlert,
  WaitTimeStats,
} from '@/lib/types/triage';

// =============================================================================
// QUERY KEYS
// =============================================================================

export const triageKeys = {
  all: ['triage'] as const,
  assessments: () => [...triageKeys.all, 'assessments'] as const,
  assessment: (id: number) => [...triageKeys.assessments(), id] as const,
  queue: () => [...triageKeys.all, 'queue'] as const,
  queueFiltered: (filters: QueueFilters) => [...triageKeys.queue(), filters] as const,
  waitingQueue: () => [...triageKeys.all, 'waiting'] as const,
  waitingQueueFiltered: (filters: WaitingQueueFilters) => [...triageKeys.waitingQueue(), filters] as const,
  thresholds: () => [...triageKeys.all, 'thresholds'] as const,
  reports: () => [...triageKeys.all, 'reports'] as const,
  reportsFiltered: (filters: ReportFilters) => [...triageKeys.reports(), filters] as const,
  waitTimeStats: (dateRange: string) => [...triageKeys.all, 'waitTimeStats', dateRange] as const,
};

// =============================================================================
// TYPES
// =============================================================================

interface QueueFilters {
  area?: AssignedArea;
  category?: TriageCategory;
  status?: string;
}

interface WaitingQueueFilters {
  status?: string;
  priority_hint?: string;
  show_all?: boolean;
}

interface WaitingQueueEntry {
  id: number;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number | null;
  patient_gender: string;
  encounter: number | null;
  check_in_time: string;
  reason_for_visit: string;
  status: 'WAITING_TRIAGE' | 'IN_TRIAGE' | 'TRIAGED' | 'CANCELLED';
  priority_hint: string;
  notes: string;
  wait_time_minutes: number;
  created_at: string;
}

interface WaitingQueueCreateData {
  patient_id: number;
  reason_for_visit?: string;
  priority_hint?: string;
  create_encounter?: boolean;
  notes?: string;
}

interface ReportFilters {
  dateRange: string;
  customStartDate?: string;
  customEndDate?: string;
  area?: AssignedArea;
  category?: TriageCategory;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface CalculateCategoryRequest {
  spo2?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  temperature?: number;
  respiratory_rate?: number;
  mental_status: string;
  chief_complaint_category: string;
  pain_score?: number;
  mobility?: string;
}

interface CalculateCategoryResponse {
  suggested_category: TriageCategory;
  alerts: TriageAlert[];
}

interface CurrentQueueStats {
  count: number;
  avg_wait_minutes: number;
  max_wait_minutes: number;
  longest_waiting_patient: number;
}

interface WaitTimeStatsResponse {
  total_assessments: number;
  avg_wait_minutes: number;
  median_wait_minutes: number;
  max_wait_minutes: number;
  min_wait_minutes: number;
  target_met_percentage: number;
  by_category: WaitTimeStats[];
  current_queue: CurrentQueueStats;
}

// =============================================================================
// TRIAGE ASSESSMENT HOOKS
// =============================================================================

/**
 * Fetch a single triage assessment by ID
 */
export function useTriageAssessment(id: number | undefined) {
  return useQuery({
    queryKey: triageKeys.assessment(id!),
    queryFn: async () => {
      const response = await apiClient.get<TriageAssessment>(`/api/triage/assessments/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new triage assessment
 */
export function useCreateTriageAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TriageAssessmentCreateData) => {
      return triageApi.createAssessment(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
      queryClient.invalidateQueries({ queryKey: triageKeys.assessments() });
    },
  });
}

/**
 * Update an existing triage assessment
 */
export function useUpdateTriageAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TriageAssessment> }) => {
      const response = await apiClient.patch<TriageAssessment>(`/api/triage/assessments/${id}/`, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: triageKeys.assessment(data.id) });
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });
}

/**
 * Complete a triage assessment (sets triage_end_time)
 */
export function useCompleteTriageAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return triageApi.completeAssessment(id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: triageKeys.assessment(data.id) });
      queryClient.invalidateQueries({ queryKey: triageKeys.assessments() });
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });
}

/**
 * Route triaged patient to a specific clinic.
 * Creates a ClinicVisit in the target clinic's queue.
 */
export function useRouteToClinic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assessmentId,
      clinicId,
      notes,
    }: {
      assessmentId: number;
      clinicId: number;
      notes?: string;
    }) => {
      return triageApi.routeToClinic(assessmentId, { clinic_id: clinicId, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
      queryClient.invalidateQueries({ queryKey: triageKeys.assessments() });
      queryClient.invalidateQueries({ queryKey: triageKeys.waitingQueue() });
      // Also invalidate clinic queues
      queryClient.invalidateQueries({ queryKey: ['clinics'] });
    },
  });
}

/**
 * Calculate triage category based on vitals and symptoms
 */
export function useCalculateTriageCategory() {
  return useMutation({
    mutationFn: async (data: CalculateCategoryRequest) => {
      const response = await apiClient.post<CalculateCategoryResponse>(
        '/api/triage/assessments/calculate-category/',
        data
      );
      return response.data;
    },
  });
}

// =============================================================================
// TRIAGE QUEUE HOOKS
// =============================================================================

/**
 * Fetch triage queue with optional filters
 */
export function useTriageQueue(filters: QueueFilters = {}) {
  return useQuery({
    queryKey: triageKeys.queueFiltered(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.area) params.append('assigned_area', filters.area);
      if (filters.category) params.append('triage_category', filters.category);
      if (filters.status) params.append('status', filters.status);

      const response = await apiClient.get<PaginatedResponse<TriageQueueEntry>>(
        `/api/triage/queue/?${params.toString()}`
      );
      return response.data;
    },
    refetchInterval: 15000, // Auto-refresh every 15 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is in background
  });
}

/**
 * Queue action mutations (call, with-clinician, complete, LWBS)
 */
export function useTriageQueueActions() {
  const queryClient = useQueryClient();

  const callPatient = useMutation({
    mutationFn: async (queueEntryId: number) => {
      const response = await apiClient.post(`/api/triage/queue/${queueEntryId}/call/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });

  const markWithClinician = useMutation({
    mutationFn: async (queueEntryId: number) => {
      const response = await apiClient.post(`/api/triage/queue/${queueEntryId}/with-clinician/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });

  const markComplete = useMutation({
    mutationFn: async (queueEntryId: number) => {
      const response = await apiClient.post(`/api/triage/queue/${queueEntryId}/complete/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });

  const markLWBS = useMutation({
    mutationFn: async ({ queueEntryId, reason }: { queueEntryId: number; reason: string }) => {
      const response = await apiClient.post(`/api/triage/queue/${queueEntryId}/lwbs/`, { reason });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
    },
  });

  return {
    callPatient: callPatient.mutateAsync,
    markWithClinician: markWithClinician.mutateAsync,
    markComplete: markComplete.mutateAsync,
    markLWBS: (queueEntryId: number, reason: string) =>
      markLWBS.mutateAsync({ queueEntryId, reason }),
    isLoading:
      callPatient.isPending ||
      markWithClinician.isPending ||
      markComplete.isPending ||
      markLWBS.isPending,
  };
}

// =============================================================================
// TRIAGE VITAL THRESHOLDS HOOKS
// =============================================================================

/**
 * Fetch all vital thresholds
 */
export function useTriageVitalThresholds() {
  return useQuery({
    queryKey: triageKeys.thresholds(),
    queryFn: async () => {
      const response = await apiClient.get<TriageVitalThreshold[]>('/api/triage/vital-thresholds/');
      return response.data;
    },
  });
}

/**
 * Update a vital threshold
 */
export function useUpdateVitalThreshold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threshold: TriageVitalThreshold) => {
      const response = await apiClient.put<TriageVitalThreshold>(
        `/api/triage/vital-thresholds/${threshold.id}/`,
        threshold
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.thresholds() });
    },
  });
}

/**
 * Toggle threshold active status
 */
export function useToggleThresholdActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiClient.patch<TriageVitalThreshold>(
        `/api/triage/vital-thresholds/${id}/`,
        { is_active: isActive }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.thresholds() });
    },
  });
}

/**
 * Reset a single threshold to defaults
 */
export function useResetThresholdToDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post(`/api/triage/vital-thresholds/${id}/reset/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.thresholds() });
    },
  });
}

/**
 * Reset all thresholds to defaults
 */
export function useResetAllThresholdsToDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/triage/vital-thresholds/reset-all/');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.thresholds() });
    },
  });
}

/**
 * Export thresholds to JSON
 */
export function useExportThresholds() {
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.get('/api/triage/vital-thresholds/export/', {
        responseType: 'blob',
      });
      return response.data as Blob;
    },
  });
}

/**
 * Import thresholds from JSON
 */
export function useImportThresholds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiClient.post('/api/triage/vital-thresholds/import/', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.thresholds() });
    },
  });
}

// =============================================================================
// TRIAGE REPORTS HOOKS
// =============================================================================

/**
 * Fetch triage reports with filters
 */
export function useTriageReports(filters: ReportFilters) {
  return useQuery({
    queryKey: triageKeys.reportsFiltered(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('date_range', filters.dateRange);
      if (filters.customStartDate) params.append('start_date', filters.customStartDate);
      if (filters.customEndDate) params.append('end_date', filters.customEndDate);
      if (filters.area) params.append('area', filters.area);
      if (filters.category) params.append('category', filters.category);

      const response = await apiClient.get<TriageReportSummary>(
        `/api/triage/reports/?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch wait time stats (for dashboard widget)
 */
export function useTriageWaitTimeStats(params: { dateRange: string }) {
  return useQuery({
    queryKey: triageKeys.waitTimeStats(params.dateRange),
    queryFn: async () => {
      const response = await apiClient.get<WaitTimeStatsResponse>(
        `/api/triage/reports/wait-times/?date_range=${params.dateRange}`
      );
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds for more real-time updates
  });
}

/**
 * Export triage report
 */
export function useExportTriageReport() {
  return useMutation({
    mutationFn: async ({
      format,
      filters,
    }: {
      format: 'pdf' | 'csv' | 'excel';
      filters: ReportFilters;
    }) => {
      const params = new URLSearchParams();
      params.append('format', format);
      params.append('date_range', filters.dateRange);
      if (filters.customStartDate) params.append('start_date', filters.customStartDate);
      if (filters.customEndDate) params.append('end_date', filters.customEndDate);
      if (filters.area) params.append('area', filters.area);
      if (filters.category) params.append('category', filters.category);

      const response = await apiClient.get(`/api/triage/reports/export/?${params.toString()}`, {
        responseType: 'blob',
      });

      // Create download link
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `triage-report-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return response.data;
    },
  });
}

// =============================================================================
// WAITING QUEUE HOOKS
// =============================================================================

/**
 * Fetch waiting queue (patients awaiting triage)
 */
export function useWaitingQueue(filters: WaitingQueueFilters = {}) {
  return useQuery({
    queryKey: triageKeys.waitingQueueFiltered(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.priority_hint) params.append('priority_hint', filters.priority_hint);
      if (filters.show_all) params.append('show_all', 'true');

      const response = await apiClient.get<PaginatedResponse<WaitingQueueEntry>>(
        `/api/triage/waiting/?${params.toString()}`
      );
      return response.data;
    },
    refetchInterval: 15000, // Auto-refresh every 15 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is in background
  });
}

/**
 * Check in a patient (add to waiting queue)
 */
export function useCheckInPatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: WaitingQueueCreateData) => {
      const response = await apiClient.post<WaitingQueueEntry>('/api/triage/waiting/', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.waitingQueue() });
    },
  });
}

/**
 * Start triage for a waiting patient
 */
export function useStartTriage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (waitingQueueId: number) => {
      const response = await apiClient.post<WaitingQueueEntry>(
        `/api/triage/waiting/${waitingQueueId}/start-triage/`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.waitingQueue() });
    },
  });
}

/**
 * Cancel/remove a patient from waiting queue
 */
export function useCancelWaitingEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const response = await apiClient.post<WaitingQueueEntry>(
        `/api/triage/waiting/${id}/cancel/`,
        { reason }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.waitingQueue() });
    },
  });
}

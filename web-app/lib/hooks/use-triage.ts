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
import { consultationQueueKeys } from '@/lib/hooks/use-consultation-queue';
import { triageApi, type TriageAssessmentUpdateData } from '@/lib/api/triage';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { useOfflineMutation } from '@/lib/powersync/use-offline-mutation';
import { generateId } from '@/lib/powersync/uuid';
import { transformTriageRow } from '@/lib/powersync/transforms';
import type { TriageAssessmentRow } from '@/lib/powersync/schema';
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
  assessmentByEncounter: (encounterId: number) => [...triageKeys.assessments(), 'encounter', encounterId] as const,
  history: () => [...triageKeys.all, 'history'] as const,
  historyFiltered: (filters: TriageHistoryFilters) => [...triageKeys.history(), filters] as const,
  queue: () => [...triageKeys.all, 'queue'] as const,
  queueFiltered: (filters: QueueFilters) => [...triageKeys.queue(), filters] as const,
  waitingQueue: () => [...triageKeys.all, 'waiting'] as const,
  waitingQueueFiltered: (filters: WaitingQueueFilters) => [...triageKeys.waitingQueue(), filters] as const,
  thresholds: () => [...triageKeys.all, 'thresholds'] as const,
  reports: () => [...triageKeys.all, 'reports'] as const,
  reportsFiltered: (filters: ReportFilters) => [...triageKeys.reports(), filters] as const,
  waitTimeStats: (dateRange: string) => [...triageKeys.all, 'waitTimeStats', dateRange] as const,
  volumeStats: (dateRange: string) => [...triageKeys.all, 'volumeStats', dateRange] as const,
  // Emergency module keys
  criticalPatients: () => [...triageKeys.all, 'critical'] as const,
  zonesSummary: () => [...triageKeys.all, 'zones'] as const,
  // ER Bed Board keys
  erBeds: () => [...triageKeys.all, 'er-beds'] as const,
  erBedBoard: (zone?: string) => [...triageKeys.erBeds(), 'board', zone] as const,
  erBedSummary: () => [...triageKeys.erBeds(), 'summary'] as const,
  // Triage room routing keys
  availableTriageRooms: () => [...triageKeys.all, 'available-rooms'] as const,
  triageSettings: () => [...triageKeys.all, 'settings'] as const,
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
  triage_room: number | null;
  triage_room_name: string | null;
  notes: string;
  wait_time_minutes: number;
  created_at: string;
}

interface WaitingQueueCreateData {
  patient_id: number;
  encounter_id?: number | null;
  reason_for_visit?: string;
  priority_hint?: string;
  create_encounter?: boolean;
  triage_room_id?: number | null;
  notes?: string;
}

interface ReportFilters {
  dateRange: string;
  customStartDate?: string;
  customEndDate?: string;
  area?: AssignedArea;
  category?: TriageCategory;
}

// History filters for completed triages
export interface TriageHistoryFilters {
  search?: string;
  dateRange?: 'today' | 'week' | 'month' | 'quarter' | 'all';
  startDate?: string;
  endDate?: string;
  category?: TriageCategory;
  page?: number;
  pageSize?: number;
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
  // Glasgow Coma Scale (optional)
  gcs_total?: number;
  // ETAT fields (pediatric)
  patient_age_years?: number;
  etat_danger_signs?: string[];
  dehydration_level?: string;
  fontanelle_status?: string;
  breastfeeding_ability?: string;
  capillary_refill_seconds?: number;
  muac_cm?: number;
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

interface CompletionTimeStats {
  count: number;
  avg_minutes: number;
  median_minutes: number;
}

interface TriageDurationStats {
  count: number;
  avg_minutes: number;
}

interface WaitTimeStatsResponse {
  total_assessments: number;
  // Historical wait times (arrival → triage start)
  avg_wait_minutes: number;
  median_wait_minutes: number;
  max_wait_minutes: number;
  min_wait_minutes: number;
  target_met_percentage: number;
  by_category: WaitTimeStats[];
  // Real-time queue stats
  current_queue: CurrentQueueStats;
  // Completion time stats (arrival → triage end)
  completion_time: CompletionTimeStats;
  // Triage duration stats (triage start → triage end)
  triage_duration: TriageDurationStats;
}

// =============================================================================
// TRIAGE ASSESSMENT HOOKS — Dual-mode: PowerSync + API fallback
// =============================================================================

type TriageJoinedRow = TriageAssessmentRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string };

/**
 * Fetch a single triage assessment by ID.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useTriageAssessment(id: number | undefined) {
  return useOfflineQuery<TriageJoinedRow, TriageAssessment>({
    sql: `SELECT t.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM triage_triageassessment t
      LEFT JOIN encounters_encounter e ON t.encounter_id = e.id
      LEFT JOIN patients_patient p ON e.patient_id = p.id
      WHERE t.id = ?`,
    params: [String(id ?? 0)],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Triage assessment ${id} not found`);
      return transformTriageRow(rows[0]!) as unknown as TriageAssessment;
    },
    queryKey: triageKeys.assessment(id!),
    queryFn: async () => {
      const response = await apiClient.get<TriageAssessment>(`/api/triage/assessments/${id}/`);
      return response.data;
    },
    forceApi: !id,
  });
}

/**
 * Fetch triage assessment by encounter ID.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useTriageAssessmentByEncounter(encounterId: number | undefined) {
  return useOfflineQuery<TriageJoinedRow, TriageAssessment | null>({
    sql: `SELECT t.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM triage_triageassessment t
      LEFT JOIN encounters_encounter e ON t.encounter_id = e.id
      LEFT JOIN patients_patient p ON e.patient_id = p.id
      WHERE t.encounter_id = ?
      LIMIT 1`,
    params: [String(encounterId ?? 0)],
    transform: (rows) => rows.length > 0 ? transformTriageRow(rows[0]!) as unknown as TriageAssessment : null,
    queryKey: triageKeys.assessmentByEncounter(encounterId!),
    queryFn: async () => {
      try {
        const response = await triageApi.listAssessments({ encounter: encounterId });
        return response.results?.[0] ?? null;
      } catch (error) {
        console.error('[useTriageAssessmentByEncounter] Failed to check for existing assessment:', {
          encounterId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    forceApi: !encounterId,
  });
}

/**
 * Fetch paginated triage history (completed assessments) with filters.
 * Supports search by patient name/MRN, date range, and category filtering.
 */
export function useTriageHistory(filters: TriageHistoryFilters = {}) {
  return useQuery({
    queryKey: triageKeys.historyFiltered(filters),
    queryFn: async () => {
      const params: Record<string, string | number | undefined> = {
        page: filters.page ?? 1,
        page_size: filters.pageSize ?? 20,
      };

      // Apply search filter (API should handle patient name/MRN search)
      if (filters.search) {
        params.search = filters.search;
      }

      // Apply category filter
      if (filters.category) {
        params.triage_category = filters.category;
      }

      // Apply date range filter
      if (filters.dateRange && filters.dateRange !== 'all') {
        const today = new Date();
        let startDate: Date;

        switch (filters.dateRange) {
          case 'today':
            startDate = today;
            break;
          case 'week':
            startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'quarter':
            startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        params.start_date = startDate.toISOString().split('T')[0];
        params.end_date = today.toISOString().split('T')[0];
      }

      // Apply custom date range
      if (filters.startDate) {
        params.start_date = filters.startDate;
      }
      if (filters.endDate) {
        params.end_date = filters.endDate;
      }

      const response = await triageApi.listAssessments(params);
      return response;
    },
    staleTime: 30000, // Data fresh for 30 seconds
  });
}

/**
 * Create a new triage assessment.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useCreateTriageAssessment() {
  const queryClient = useQueryClient();

  return useOfflineMutation<TriageAssessmentCreateData, TriageAssessment>({
    table: 'triage_triageassessment',
    operation: 'create',
    // Triage creation MUST go through the API directly because:
    // 1. Callers immediately use result.id for completeAssessment and routing
    // 2. The backend runs auto-calculation logic for triage category
    forceApi: true,
    buildLocalData: (data) => ({
      id: generateId(),
      encounter_id: String(data.encounter),
      chief_complaint: data.chief_complaint || '',
      chief_complaint_category: data.chief_complaint_category || '',
      pain_score: data.pain_score ?? null,
      mental_status: data.mental_status || 'A',
      gcs_eye: data.gcs_eye ?? null,
      gcs_verbal: data.gcs_verbal ?? null,
      gcs_motor: data.gcs_motor ?? null,
      mobility: data.mobility || '',
      arrival_mode: data.arrival_mode || '',
      referring_facility_name: data.referring_facility_name || null,
      allergies_noted: data.allergies_noted || null,
      spo2: data.spo2 ?? null,
      heart_rate: data.heart_rate ?? null,
      systolic_bp: data.systolic_bp ?? null,
      diastolic_bp: data.diastolic_bp ?? null,
      temperature: data.temperature ?? null,
      respiratory_rate: data.respiratory_rate ?? null,
      weight: data.weight ?? null,
      height: data.height ?? null,
      triage_category: data.triage_category || '',
      auto_calculated_category: data.auto_calculated_category || null,
      category_override_reason: data.category_override_reason || null,
      assigned_area: data.assigned_area || null,
      assigned_clinic_id: data.assigned_clinic ? String(data.assigned_clinic) : null,
      assigned_clinician_id: data.assigned_clinician ? String(data.assigned_clinician) : null,
      arrival_time: data.arrival_time || new Date().toISOString(),
      triage_start_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    mutationFn: (data) => triageApi.createAssessment(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
      queryClient.invalidateQueries({ queryKey: triageKeys.assessments() });
      queryClient.invalidateQueries({ queryKey: ['encounters', variables.encounter] });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}

/**
 * Update an existing triage assessment.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useUpdateTriageAssessment() {
  const queryClient = useQueryClient();

  return useOfflineMutation<{ id: number; data: TriageAssessmentUpdateData }, TriageAssessment>({
    table: 'triage_triageassessment',
    operation: 'update',
    getId: (input) => input.id,
    buildLocalData: ({ data }) => {
      const fields: Record<string, string | number | null> = {};
      if (data.chief_complaint !== undefined) fields.chief_complaint = data.chief_complaint;
      if (data.chief_complaint_category !== undefined) fields.chief_complaint_category = data.chief_complaint_category;
      if (data.mental_status !== undefined) fields.mental_status = data.mental_status;
      if (data.pain_score !== undefined) fields.pain_score = data.pain_score ?? null;
      if (data.mobility !== undefined) fields.mobility = data.mobility;
      if (data.allergies_noted !== undefined) fields.allergies_noted = data.allergies_noted || null;
      if (data.spo2 !== undefined) fields.spo2 = data.spo2 ?? null;
      if (data.heart_rate !== undefined) fields.heart_rate = data.heart_rate ?? null;
      if (data.systolic_bp !== undefined) fields.systolic_bp = data.systolic_bp ?? null;
      if (data.diastolic_bp !== undefined) fields.diastolic_bp = data.diastolic_bp ?? null;
      if (data.temperature !== undefined) fields.temperature = data.temperature ?? null;
      if (data.respiratory_rate !== undefined) fields.respiratory_rate = data.respiratory_rate ?? null;
      if (data.triage_category !== undefined) fields.triage_category = data.triage_category;
      if (data.auto_calculated_category !== undefined) fields.auto_calculated_category = data.auto_calculated_category || null;
      if (data.category_override_reason !== undefined) fields.category_override_reason = data.category_override_reason || null;
      if (data.assigned_area !== undefined) fields.assigned_area = data.assigned_area || null;
      if (data.assigned_clinic !== undefined) fields.assigned_clinic_id = data.assigned_clinic ? String(data.assigned_clinic) : null;
      fields.updated_at = new Date().toISOString();
      return fields;
    },
    mutationFn: ({ id, data }) => {
      return apiClient.patch<TriageAssessment>(`/api/triage/assessments/${id}/`, data).then(r => r.data);
    },
    onSuccess: (result, input) => {
      const data = result as TriageAssessment | null;
      if (data && data.id) {
        queryClient.invalidateQueries({ queryKey: triageKeys.assessment(data.id) });
      }
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
      // Use result.encounter if available, otherwise fall back to input for local writes
      const encounterId = data?.encounter ?? input.id;
      if (encounterId) {
        queryClient.invalidateQueries({ queryKey: ['encounters', encounterId] });
      }
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
      // Invalidate the encounter query so the updated triage_status is reflected
      if (data.encounter) {
        queryClient.invalidateQueries({ queryKey: ['encounters', data.encounter] });
      }
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
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
      queryClient.invalidateQueries({ queryKey: consultationQueueKeys.all });
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
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

type TriageQueueJoinedRow = TriageAssessmentRow & {
  id: string;
  patient_first_name?: string;
  patient_last_name?: string;
  patient_mrn?: string;
  patient_date_of_birth?: string;
  patient_gender?: string;
  patient_id?: string;
};

/**
 * Fetch triage queue with optional filters.
 * Reads from local PowerSync SQLite when available, falls back to API.
 *
 * Note: Offline mode provides best-effort queue data from triage_triageassessment.
 * Computed fields (position, wait_time_minutes, alerts) are approximated locally.
 */
export function useTriageQueue(filters: QueueFilters = {}) {
  const conditions: string[] = ['t.triage_end_time IS NULL'];
  const sqlParams: (string | number | null)[] = [];

  if (filters.area) {
    conditions.push('t.assigned_area = ?');
    sqlParams.push(filters.area);
  }
  if (filters.category) {
    conditions.push('t.triage_category = ?');
    sqlParams.push(filters.category);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return useOfflineQuery<TriageQueueJoinedRow, PaginatedResponse<TriageQueueEntry>>({
    sql: `SELECT t.*, p.first_name as patient_first_name, p.last_name as patient_last_name,
        p.mrn as patient_mrn, p.date_of_birth as patient_date_of_birth, p.gender as patient_gender,
        e.patient_id as patient_id
      FROM triage_triageassessment t
      LEFT JOIN encounters_encounter e ON t.encounter_id = e.id
      LEFT JOIN patients_patient p ON e.patient_id = p.id
      ${whereClause}
      ORDER BY
        CASE t.triage_category
          WHEN 'EMERGENCY' THEN 1 WHEN 'PRIORITY' THEN 2
          WHEN 'QUEUE' THEN 3 WHEN 'NON_URGENT' THEN 4 ELSE 5
        END,
        t.arrival_time ASC`,
    params: sqlParams,
    transform: (rows) => {
      const results: TriageQueueEntry[] = rows.map((row, idx) => {
        const arrivalTime = (row.arrival_time as string) || new Date().toISOString();
        const waitMs = Date.now() - new Date(arrivalTime).getTime();
        const waitMinutes = Math.max(0, Math.round(waitMs / 60000));
        const name = row.patient_first_name && row.patient_last_name
          ? `${row.patient_first_name} ${row.patient_last_name}`
          : 'Unknown';
        let age = 0;
        if (row.patient_date_of_birth) {
          const dob = new Date(row.patient_date_of_birth as string);
          age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        }

        let alerts: TriageAlert[] = [];
        try {
          if (row.alerts) alerts = JSON.parse(row.alerts as string);
        } catch { /* keep empty */ }

        return {
          id: parseInt(row.id, 10) || 0,
          triage_assessment: parseInt(row.id, 10) || 0,
          patient_id: row.patient_id ? parseInt(row.patient_id as string, 10) : 0,
          patient_name: name,
          patient_mrn: (row.patient_mrn as string) || '',
          patient_age: age,
          patient_gender: (row.patient_gender as string) || '',
          triage_category: ((row.triage_category as string) || 'QUEUE') as TriageCategory,
          chief_complaint_category: (row.chief_complaint_category as string) || '',
          chief_complaint: (row.chief_complaint as string) || '',
          assigned_area: ((row.assigned_area as string) || 'WAITING') as AssignedArea,
          assigned_area_label: (row.assigned_area as string) || 'Waiting',
          assigned_area_display: (row.assigned_area as string) || 'Waiting',
          assigned_clinic: row.assigned_clinic_id ? parseInt(row.assigned_clinic_id as string, 10) : null,
          assigned_clinic_name: null,
          routing_destination: null,
          arrival_time: arrivalTime,
          triage_time: (row.triage_start_time as string) || arrivalTime,
          notes: null,
          wait_time_minutes: waitMinutes,
          is_wait_exceeded: waitMinutes > 30,
          status: 'WAITING' as const,
          called_at: null,
          called_by_name: null,
          position: idx + 1,
          alerts,
          alerts_count: alerts.length,
          created_at: (row.created_at as string) || '',
          updated_at: (row.updated_at as string) || '',
        } as TriageQueueEntry;
      });

      return { count: results.length, next: null, previous: null, results };
    },
    queryKey: triageKeys.queueFiltered(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.area) params.append('area', filters.area);
      if (filters.category) params.append('triage_category', filters.category);
      if (filters.status) params.append('status', filters.status);

      const response = await apiClient.get<PaginatedResponse<TriageQueueEntry>>(
        `/api/triage/queue/?${params.toString()}`
      );
      return response.data;
    },
    queryOptions: {
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    },
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
      const response = await apiClient.get<{ results: TriageVitalThreshold[] } | TriageVitalThreshold[]>(
        '/api/triage/vital-thresholds/',
        { params: { page_size: 100 } } // Fetch all thresholds
      );
      // Handle both paginated and non-paginated responses
      const data = response.data;
      if (Array.isArray(data)) {
        return data;
      }
      return data.results ?? [];
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
 * Fetch triage volume report (by category and area).
 */
export function useTriageVolumeReport(params: { dateRange: string }) {
  return useQuery({
    queryKey: triageKeys.volumeStats(params.dateRange),
    queryFn: () => triageApi.getVolumeReport({ date_range: params.dateRange }),
    refetchInterval: 30000,
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

/**
 * Assign or clear a triage room for a waiting patient
 */
export function useAssignTriageRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ waitingId, roomId }: { waitingId: number; roomId: number | null }) => {
      return triageApi.assignTriageRoom(waitingId, roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.waitingQueue() });
      queryClient.invalidateQueries({ queryKey: triageKeys.availableTriageRooms() });
    },
  });
}

/**
 * Fetch available triage rooms with occupancy info
 */
export function useAvailableTriageRooms(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: triageKeys.availableTriageRooms(),
    queryFn: () => triageApi.getAvailableTriageRooms(),
    refetchInterval: 30000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Fetch triage settings for the current facility
 */
export function useTriageSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: triageKeys.triageSettings(),
    queryFn: () => triageApi.getTriageSettings(),
    enabled: options?.enabled ?? true,
  });
}

/**
 * Update triage settings
 */
export function useUpdateTriageSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { auto_route_to_room?: boolean; triage_department?: number | null } }) => {
      return triageApi.updateTriageSettings(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.triageSettings() });
    },
  });
}

// =============================================================================
// EMERGENCY MODULE HOOKS
// =============================================================================

/**
 * Get critical (RED) patients in ER zones.
 * Used for emergency department critical alerts banner.
 * Auto-refreshes every 10 seconds for real-time alerts.
 */
export function useCriticalPatients(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: triageKeys.criticalPatients(),
    queryFn: () => triageApi.getCriticalPatients(),
    refetchInterval: 10000, // Refresh every 10 seconds for real-time alerts
    enabled: options?.enabled ?? true,
  });
}

/**
 * Get summary stats for all ER zones.
 * Used for emergency department dashboard cards.
 * Auto-refreshes every 15 seconds.
 */
export function useZonesSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: triageKeys.zonesSummary(),
    queryFn: () => triageApi.getZonesSummary(),
    refetchInterval: 15000, // Refresh every 15 seconds
    enabled: options?.enabled ?? true,
  });
}

// =============================================================================
// ER BED BOARD HOOKS (Phase 3)
// =============================================================================

/**
 * Get ER bed board data grouped by zone.
 * Auto-refreshes every 10 seconds for near real-time display.
 */
export function useERBedBoard(zone?: string) {
  return useQuery({
    queryKey: triageKeys.erBedBoard(zone),
    queryFn: () => triageApi.getERBedBoard(zone),
    refetchInterval: 10000,
  });
}

/**
 * Get ER bed summary (occupancy stats per zone).
 * Auto-refreshes every 15 seconds.
 */
export function useERBedSummary() {
  return useQuery({
    queryKey: triageKeys.erBedSummary(),
    queryFn: () => triageApi.getERBedSummary(),
    refetchInterval: 15000,
  });
}

/**
 * Mutations for ER bed actions (assign, release, update status).
 */
export function useERBedActions() {
  const queryClient = useQueryClient();

  const invalidateBeds = () => {
    queryClient.invalidateQueries({ queryKey: triageKeys.erBeds() });
  };

  const assignPatient = useMutation({
    mutationFn: (data: { bedId: number; patient: number; triage_assessment?: number }) =>
      triageApi.assignERBedPatient(data.bedId, {
        patient: data.patient,
        triage_assessment: data.triage_assessment,
      }),
    onSuccess: invalidateBeds,
  });

  const releaseBed = useMutation({
    mutationFn: (data: { bedId: number; markCleaning?: boolean }) =>
      triageApi.releaseERBed(data.bedId, data.markCleaning ?? true),
    onSuccess: invalidateBeds,
  });

  const updateStatus = useMutation({
    mutationFn: (data: { bedId: number; status: 'AVAILABLE' | 'OUT_OF_SERVICE'; reason?: string }) =>
      triageApi.updateERBedStatus(data.bedId, { status: data.status, reason: data.reason }),
    onSuccess: invalidateBeds,
  });

  const createBed = useMutation({
    mutationFn: (data: { zone: string; bed_number: string }) =>
      triageApi.createERBed(data),
    onSuccess: invalidateBeds,
  });

  return { assignPatient, releaseBed, updateStatus, createBed };
}

/**
 * Suggest an available ER bed for a given zone.
 *
 * Returns the first available bed in the zone or null if none are free.
 * Disabled when zone is empty/undefined.
 */
export function useSuggestedERBed(zone?: string) {
  return useQuery({
    queryKey: [...triageKeys.erBeds(), 'suggest', zone] as const,
    queryFn: () => triageApi.suggestERBed(zone!),
    enabled: !!zone,
    staleTime: 10_000,
  });
}

// =============================================================================
// Phase 4: Auto-Escalation & Alerts Hooks
// =============================================================================

/**
 * Fetch active wait time breach alerts.
 *
 * @param options - Query options
 * @param options.activeOnly - Only return active (unresolved) breaches
 * @param options.severity - Filter by severity level
 * @param options.refetchInterval - Polling interval in ms (default: 30s)
 */
export function useWaitTimeBreaches(options?: {
  activeOnly?: boolean;
  severity?: string;
  triageCategory?: string;
  refetchInterval?: number;
}) {
  const {
    activeOnly = true,
    severity,
    triageCategory,
    refetchInterval = 30_000,
  } = options ?? {};

  return useQuery({
    queryKey: [...triageKeys.all, 'breaches', { activeOnly, severity, triageCategory }] as const,
    queryFn: () =>
      triageApi.getBreaches({
        active_only: activeOnly,
        severity,
        triage_category: triageCategory,
      }),
    refetchInterval,
  });
}

/**
 * Fetch breach summary (counts by severity and category).
 */
export function useBreachSummary(options?: { refetchInterval?: number }) {
  const { refetchInterval = 30_000 } = options ?? {};

  return useQuery({
    queryKey: [...triageKeys.all, 'breaches', 'summary'] as const,
    queryFn: () => triageApi.getBreachSummary(),
    refetchInterval,
  });
}

/**
 * Actions for wait time breaches (acknowledge, resolve).
 */
export function useBreachActions() {
  const queryClient = useQueryClient();

  const invalidateBreaches = () => {
    queryClient.invalidateQueries({ queryKey: [...triageKeys.all, 'breaches'] });
  };

  const acknowledge = useMutation({
    mutationFn: ({ breachId, notes }: { breachId: number; notes?: string }) =>
      triageApi.acknowledgeBreach(breachId, notes),
    onSuccess: invalidateBreaches,
  });

  const resolve = useMutation({
    mutationFn: (breachId: number) => triageApi.resolveBreach(breachId),
    onSuccess: invalidateBreaches,
  });

  return {
    acknowledgeBreach: acknowledge.mutateAsync,
    resolveBreach: resolve.mutateAsync,
    isLoading: acknowledge.isPending || resolve.isPending,
  };
}

/**
 * Fetch escalation records.
 *
 * @param options - Query options
 */
export function useEscalations(options?: {
  activeOnly?: boolean;
  escalationType?: string;
  refetchInterval?: number;
}) {
  const {
    activeOnly = true,
    escalationType,
    refetchInterval = 30_000,
  } = options ?? {};

  return useQuery({
    queryKey: [...triageKeys.all, 'escalations', { activeOnly, escalationType }] as const,
    queryFn: () =>
      triageApi.getEscalations({
        active_only: activeOnly,
        escalation_type: escalationType,
      }),
    refetchInterval,
  });
}

/**
 * Queue escalation action (creates escalation from queue entry).
 */
export function useEscalatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      queueEntryId,
      escalationType,
      reason,
    }: {
      queueEntryId: number;
      escalationType: string;
      reason: string;
    }) => triageApi.escalateQueueEntry(queueEntryId, { escalation_type: escalationType, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triageKeys.queue() });
      queryClient.invalidateQueries({ queryKey: [...triageKeys.all, 'escalations'] });
    },
  });
}

/**
 * Actions for escalation management (resolve, dismiss).
 */
export function useEscalationActions() {
  const queryClient = useQueryClient();

  const invalidateEscalations = () => {
    queryClient.invalidateQueries({ queryKey: [...triageKeys.all, 'escalations'] });
  };

  const resolveEsc = useMutation({
    mutationFn: ({ escalationId, notes }: { escalationId: number; notes?: string }) =>
      triageApi.resolveEscalation(escalationId, notes),
    onSuccess: invalidateEscalations,
  });

  const dismissEsc = useMutation({
    mutationFn: ({ escalationId, notes }: { escalationId: number; notes?: string }) =>
      triageApi.dismissEscalation(escalationId, notes),
    onSuccess: invalidateEscalations,
  });

  return {
    resolveEscalation: resolveEsc.mutateAsync,
    dismissEscalation: dismissEsc.mutateAsync,
    isLoading: resolveEsc.isPending || dismissEsc.isPending,
  };
}

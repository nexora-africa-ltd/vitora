/**
 * Patient hooks for data fetching and mutations.
 *
 * Consolidated from use-patients.ts and use-patients-enhanced.ts
 * to provide a single source of truth for patient-related hooks.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '@/lib/api/patients';
import type { Patient, PatientListParams, PatientCreateData, PatientUpdateData, DuplicateCheckParams, EmergencyContact, PatientEncounter } from '@/lib/types/patient';
import type { TimeRange } from '@/components/shared/vitals-trend-chart';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { transformPatientRow } from '@/lib/powersync/transforms';
import type { PatientRow } from '@/lib/powersync/schema';
import type { PaginatedResponse } from '@/lib/types';

// =============================================================================
// QUERY KEYS
// =============================================================================

/**
 * Standardized query keys for patient data.
 * Use these keys consistently across all patient-related queries.
 */
export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (params?: PatientListParams) => [...patientKeys.lists(), params] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: number) => [...patientKeys.details(), id] as const,
  emergencyContacts: (id: number) => [...patientKeys.detail(id), 'emergency-contacts'] as const,
  encounters: (id: number) => [...patientKeys.detail(id), 'encounters'] as const,
  qrCode: (id: number) => [...patientKeys.detail(id), 'qr-code'] as const,
  duplicateCheck: (params: DuplicateCheckParams) => [...patientKeys.all, 'duplicate-check', params] as const,
  vitalsHistory: (id: number, range: string) => [...patientKeys.detail(id), 'vitals-history', range] as const,
};

// =============================================================================
// QUERY HOOKS — Dual-mode: PowerSync (local SQLite) with API fallback
// =============================================================================

/**
 * Hook for fetching paginated patients list.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePatients(params: PatientListParams = {}) {
  const searchTerm = params.search || '';
  const limit = params.page_size || 20;
  const offset = ((params.page || 1) - 1) * limit;

  // Build WHERE clauses for PowerSync SQL
  const conditions: string[] = [];
  const sqlParams: (string | number | null)[] = [];

  if (searchTerm) {
    conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.mrn LIKE ?)');
    const pattern = `%${searchTerm}%`;
    sqlParams.push(pattern, pattern, pattern);
  }
  if (params.gender) {
    conditions.push('p.gender = ?');
    sqlParams.push(params.gender);
  }
  if (params.county) {
    conditions.push('p.county_id = ?');
    sqlParams.push(String(params.county));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = params.ordering || 'p.last_name ASC';

  const sql = `SELECT p.*, c.name as county_name, sc.name as sub_county_name
    FROM patients_patient p
    LEFT JOIN core_county c ON p.county_id = c.id
    LEFT JOIN core_subcounty sc ON p.sub_county_id = sc.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;

  const countSql = `SELECT COUNT(*) as count FROM patients_patient p ${whereClause}`;

  return useOfflineQuery<
    PatientRow & { id: string; county_name?: string; sub_county_name?: string },
    PaginatedResponse<Patient>
  >({
    sql,
    params: [...sqlParams, limit, offset],
    transform: (rows) => {
      // We need to run a separate count — for now approximate from the rows
      // In PowerSync mode, we get the full result set
      return {
        count: rows.length < limit ? offset + rows.length : offset + limit + 1,
        next: null,
        previous: null,
        results: rows.map(r => transformPatientRow(r) as unknown as Patient),
      };
    },
    queryKey: patientKeys.list(params),
    queryFn: () => patientsApi.getPatients(params),
    queryOptions: { staleTime: 30000 },
  });
}

/**
 * Hook for fetching a single patient.
 * Base data from PowerSync (offline-capable), PII fields from API (online-only).
 */
export function usePatient(id: number | string) {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  const strId = String(numericId);

  return useOfflineQuery<
    PatientRow & { id: string; county_name?: string; sub_county_name?: string; ward_name?: string },
    Patient
  >({
    sql: `SELECT p.*, c.name as county_name, sc.name as sub_county_name, w.name as ward_name
      FROM patients_patient p
      LEFT JOIN core_county c ON p.county_id = c.id
      LEFT JOIN core_subcounty sc ON p.sub_county_id = sc.id
      LEFT JOIN core_ward w ON p.ward_id = w.id
      WHERE p.id = ?`,
    params: [strId],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Patient ${numericId} not found`);
      return transformPatientRow(rows[0]!) as unknown as Patient;
    },
    queryKey: patientKeys.detail(numericId),
    queryFn: () => patientsApi.getPatient(numericId),
    forceApi: !id || isNaN(numericId),
  });
}

/**
 * Hook for fetching patient's emergency contacts.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePatientEmergencyContacts(patientId: number) {
  return useOfflineQuery<
    Record<string, unknown> & { id: string },
    EmergencyContact[]
  >({
    sql: 'SELECT * FROM patients_emergencycontact WHERE patient_id = ? ORDER BY created_at',
    params: [String(patientId)],
    transform: (rows) => rows.map(row => ({
      id: parseInt(row.id, 10) || 0,
      full_name: (row.full_name as string) || '',
      relationship: (row.relationship as string) || '',
      phone_number: (row.phone_number as string) || '',
      alternative_phone: (row.alternative_phone as string) || undefined,
      created_at: (row.created_at as string) || '',
      updated_at: (row.updated_at as string) || '',
    } as EmergencyContact)),
    queryKey: patientKeys.emergencyContacts(patientId),
    queryFn: () => patientsApi.getEmergencyContacts(patientId),
    forceApi: !patientId,
  });
}

/**
 * Hook for fetching patient's encounters.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePatientEncounters(patientId: number) {
  return useOfflineQuery<
    Record<string, unknown> & { id: string },
    PatientEncounter[]
  >({
    sql: `SELECT id, encounter_type, encounter_date, chief_complaint, consultation_status as status, created_at
      FROM encounters_encounter
      WHERE patient_id = ?
      ORDER BY encounter_date DESC`,
    params: [String(patientId)],
    transform: (rows) => rows.map(row => ({
      id: parseInt(row.id, 10) || 0,
      encounter_type: (row.encounter_type as string) || '',
      status: ((row.status as string) || 'CREATED') as PatientEncounter['status'],
      encounter_date: (row.encounter_date as string) || '',
      chief_complaint: (row.chief_complaint as string) || '',
      created_at: (row.created_at as string) || '',
    })),
    queryKey: patientKeys.encounters(patientId),
    queryFn: () => patientsApi.getEncounters(patientId),
    forceApi: !patientId,
  });
}

/**
 * Hook for creating a patient with optional idempotency support.
 *
 * Sprint 1.7: Data Integrity - Idempotent API Operations
 *
 * @example
 * const createPatient = useCreatePatient();
 * const [idempotencyKey, clearKey] = useIdempotencyKey('patient-registration');
 *
 * await createPatient.mutateAsync({ data, idempotencyKey });
 * clearKey(); // Clear after success
 */
export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, idempotencyKey }: { data: PatientCreateData; idempotencyKey?: string }) =>
      patientsApi.createPatient(data, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
    },
  });
}

/**
 * Hook for updating a patient
 */
export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PatientUpdateData }) =>
      patientsApi.updatePatient(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
    },
  });
}

/**
 * Hook for deleting a patient
 */
export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => patientsApi.deletePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
    },
  });
}

/**
 * Hook for checking duplicate patients before registration.
 *
 * This hook performs a debounced check for potential duplicate patients
 * based on identification number and/or demographic information.
 *
 * @param params - Search criteria (ID, name, DOB, gender)
 * @param options - Query options including enabled flag
 * @returns Query result with duplicate matches
 *
 * @example
 * const { data: duplicates } = useDuplicateCheck({
 *   identification_number: '12345678',
 *   identification_type: 'national_id',
 * }, { enabled: idNumber.length >= 5 });
 */
export function useDuplicateCheck(
  params: DuplicateCheckParams,
  options?: { enabled?: boolean }
) {
  // Only enable if we have meaningful search criteria
  const hasIdCriteria = Boolean(
    params.identification_number && params.identification_number.length >= 5
  );
  const hasDemographicCriteria = Boolean(
    params.first_name && params.last_name && params.date_of_birth
  );
  const hasSearchCriteria = hasIdCriteria || hasDemographicCriteria;

  return useQuery({
    queryKey: patientKeys.duplicateCheck(params),
    queryFn: () => patientsApi.checkDuplicate(params),
    enabled: options?.enabled !== false && hasSearchCriteria,
    staleTime: 60000, // 1 minute - duplicates don't change often
    gcTime: 300000, // 5 minutes cache
  });
}

/**
 * Hook for fetching a patient's QR code.
 * Only fetches when enabled (e.g., when dialog is open).
 */
export function usePatientQRCode(patientId: number, enabled = false) {
  return useQuery({
    queryKey: patientKeys.qrCode(patientId),
    queryFn: () => patientsApi.getQRCode(patientId),
    enabled: !!patientId && enabled,
    staleTime: Infinity, // QR is deterministic from MRN, never changes
  });
}

/**
 * Hook for fetching aggregated vitals history for a patient.
 * Merges data from triage, encounters, and inpatient nursing sources.
 */
export function usePatientVitalsHistory(patientId: number, range: TimeRange = 'all') {
  return useQuery({
    queryKey: patientKeys.vitalsHistory(patientId, range),
    queryFn: () => patientsApi.getVitalsHistory(patientId, range),
    enabled: !!patientId,
    staleTime: 30_000, // 30s — vitals can change frequently for inpatients
  });
}

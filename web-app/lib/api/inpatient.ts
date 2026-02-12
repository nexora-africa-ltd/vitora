/**
 * Inpatient (Admissions/IPD) API client.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  WardSchema,
  BedSchema,
  AdmissionRecommendationSchema,
  AdmissionSchema,
  DischargeSchema,
  TransferSchema,
  WardRoundSchema,
  NursingKardexSchema,
  KardexShiftNoteSchema,
  KardexHandoverNoteSchema,
  ShiftHandoverSchema,
  PaginatedWardSchema,
  PaginatedBedSchema,
  PaginatedAdmissionRecommendationSchema,
  PaginatedAdmissionSchema,
  PaginatedDischargeSchema,
  PaginatedTransferSchema,
  PaginatedWardRoundSchema,
  PaginatedNursingKardexSchema,
  PaginatedShiftHandoverSchema,
  BedArraySchema,
} from '@/lib/schemas/inpatient.schema';
import type {
  Admission,
  AdmissionCreateInput,
  AdmissionListParams,
  AdmissionListResponse,
  AdmissionRecommendation,
  AdmissionRecommendationListParams,
  AdmissionRecommendationListResponse,
  Bed,
  BedListParams,
  BulkCompatibilityResult,
  CompatibilityCheckResult,
  Discharge,
  DischargeCreateData,
  DischargeListParams,
  DischargeListResponse,
  InpatientWard,
  KardexHandoverNote,
  KardexHandoverNoteCreateData,
  KardexListParams,
  KardexListResponse,
  KardexShiftNote,
  KardexShiftNoteCreateData,
  KardexUpdateData,
  NursingKardex,
  ShiftHandover,
  ShiftHandoverCreateData,
  ShiftHandoverListParams,
  ShiftHandoverListResponse,
  SupervisorAlertsResponse,
  Transfer,
  TransferCreateData,
  TransferListParams,
  TransferListResponse,
  WardRound,
  WardRoundCreateData,
  WardRoundListParams,
  WardRoundListResponse,
  WardUpdatesResponse,
} from '@/lib/types/inpatient';

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export const inpatientApi = {
  // ============================================================================
  // Wards
  // ============================================================================
  async listWards(params?: { ward_type?: string; page?: number; page_size?: number }): Promise<Paginated<InpatientWard>> {
    const response = await apiClient.get<Paginated<InpatientWard>>('/api/inpatient/wards/', { params });
    return parseResponse(PaginatedWardSchema, response.data, { context: 'inpatientApi.listWards' });
  },

  async getWard(wardId: number): Promise<InpatientWard> {
    const response = await apiClient.get<InpatientWard>(`/api/inpatient/wards/${wardId}/`);
    return parseResponse(WardSchema, response.data, { context: 'inpatientApi.getWard' });
  },

  async updateWard(wardId: number, data: Partial<InpatientWard>): Promise<InpatientWard> {
    const response = await apiClient.patch<InpatientWard>(`/api/inpatient/wards/${wardId}/`, data);
    return parseResponse(WardSchema, response.data, { context: 'inpatientApi.updateWard' });
  },

  async listWardBeds(
    wardId: number,
    params?: Omit<BedListParams, 'ward'> & { page?: number; page_size?: number }
  ): Promise<Paginated<Bed> | Bed[]> {
    const response = await apiClient.get(`/api/inpatient/wards/${wardId}/beds/`, { params });
    // Response can be paginated or array - try paginated first, fall back to array
    if (response.data && 'results' in response.data) {
      return parseResponse(PaginatedBedSchema, response.data, { context: 'inpatientApi.listWardBeds' });
    }
    return parseResponse(BedArraySchema, response.data, { context: 'inpatientApi.listWardBeds' });
  },

  // ============================================================================
  // Beds
  // ============================================================================
  async listBeds(params?: BedListParams & { page?: number; page_size?: number }): Promise<Paginated<Bed>> {
    const response = await apiClient.get<Paginated<Bed>>('/api/inpatient/beds/', { params });
    return parseResponse(PaginatedBedSchema, response.data, { context: 'inpatientApi.listBeds' });
  },

  async updateBed(bedId: number, data: Partial<Bed>): Promise<Bed> {
    const response = await apiClient.patch<Bed>(`/api/inpatient/beds/${bedId}/`, data);
    return parseResponse(BedSchema, response.data, { context: 'inpatientApi.updateBed' });
  },

  // ============================================================================
  // Admission Recommendations
  // ============================================================================
  async listAdmissionRecommendations(
    params?: AdmissionRecommendationListParams
  ): Promise<AdmissionRecommendationListResponse> {
    const response = await apiClient.get<AdmissionRecommendationListResponse>(
      '/api/inpatient/admission-recommendations/',
      { params }
    );
    return parseResponse(PaginatedAdmissionRecommendationSchema, response.data, { context: 'inpatientApi.listAdmissionRecommendations' });
  },

  async createAdmissionRecommendation(
    data: Partial<AdmissionRecommendation>
  ): Promise<AdmissionRecommendation> {
    const response = await apiClient.post<AdmissionRecommendation>(
      '/api/inpatient/admission-recommendations/',
      data
    );
    return parseResponse(AdmissionRecommendationSchema, response.data, { context: 'inpatientApi.createAdmissionRecommendation' });
  },

  async acceptAdmissionRecommendation(recommendationId: number, userId: number) {
    const response = await apiClient.post<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${recommendationId}/accept/`,
      { user: userId }
    );
    return parseResponse(AdmissionRecommendationSchema, response.data, { context: 'inpatientApi.acceptAdmissionRecommendation' });
  },

  async declineAdmissionRecommendation(recommendationId: number, userId: number, reason: string) {
    const response = await apiClient.post<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${recommendationId}/decline/`,
      { user: userId, reason }
    );
    return parseResponse(AdmissionRecommendationSchema, response.data, { context: 'inpatientApi.declineAdmissionRecommendation' });
  },

  // ============================================================================
  // Admissions
  // ============================================================================
  async listAdmissions(params?: AdmissionListParams): Promise<AdmissionListResponse> {
    const response = await apiClient.get<AdmissionListResponse>('/api/inpatient/admissions/', {
      params,
    });
    return parseResponse(PaginatedAdmissionSchema, response.data, { context: 'inpatientApi.listAdmissions' });
  },

  async getAdmission(admissionId: number): Promise<Admission> {
    const response = await apiClient.get<Admission>(`/api/inpatient/admissions/${admissionId}/`);
    return parseResponse(AdmissionSchema, response.data, { context: 'inpatientApi.getAdmission' });
  },

  async createAdmission(data: AdmissionCreateInput): Promise<Admission> {
    const response = await apiClient.post<Admission>('/api/inpatient/admissions/', data);
    return parseResponse(AdmissionSchema, response.data, { context: 'inpatientApi.createAdmission' });
  },

  async updateAdmission(admissionId: number, data: Partial<Admission>): Promise<Admission> {
    const response = await apiClient.patch<Admission>(`/api/inpatient/admissions/${admissionId}/`, data);
    return parseResponse(AdmissionSchema, response.data, { context: 'inpatientApi.updateAdmission' });
  },

  // ============================================================================
  // Discharges
  // ============================================================================
  async listDischarges(params?: DischargeListParams): Promise<DischargeListResponse> {
    const response = await apiClient.get<DischargeListResponse>('/api/inpatient/discharges/', {
      params,
    });
    return parseResponse(PaginatedDischargeSchema, response.data, { context: 'inpatientApi.listDischarges' });
  },

  async getDischarge(dischargeId: number): Promise<Discharge> {
    const response = await apiClient.get<Discharge>(`/api/inpatient/discharges/${dischargeId}/`);
    return parseResponse(DischargeSchema, response.data, { context: 'inpatientApi.getDischarge' });
  },

  async createDischarge(data: DischargeCreateData): Promise<Discharge> {
    const response = await apiClient.post<Discharge>('/api/inpatient/discharges/', data);
    return parseResponse(DischargeSchema, response.data, { context: 'inpatientApi.createDischarge' });
  },

  async updateDischarge(dischargeId: number, data: Partial<DischargeCreateData>): Promise<Discharge> {
    const response = await apiClient.patch<Discharge>(`/api/inpatient/discharges/${dischargeId}/`, data);
    return parseResponse(DischargeSchema, response.data, { context: 'inpatientApi.updateDischarge' });
  },

  // ============================================================================
  // Transfers
  // ============================================================================
  async listTransfers(params?: TransferListParams): Promise<TransferListResponse> {
    const response = await apiClient.get<TransferListResponse>('/api/inpatient/transfers/', {
      params,
    });
    return parseResponse(PaginatedTransferSchema, response.data, { context: 'inpatientApi.listTransfers' });
  },

  async getTransfer(transferId: number): Promise<Transfer> {
    const response = await apiClient.get<Transfer>(`/api/inpatient/transfers/${transferId}/`);
    return parseResponse(TransferSchema, response.data, { context: 'inpatientApi.getTransfer' });
  },

  async createTransfer(data: TransferCreateData): Promise<Transfer> {
    const response = await apiClient.post<Transfer>('/api/inpatient/transfers/', data);
    return parseResponse(TransferSchema, response.data, { context: 'inpatientApi.createTransfer' });
  },

  // ============================================================================
  // Ward Rounds
  // ============================================================================
  async listWardRounds(params?: WardRoundListParams): Promise<WardRoundListResponse> {
    const response = await apiClient.get<WardRoundListResponse>('/api/inpatient/ward-rounds/', {
      params,
    });
    return parseResponse(PaginatedWardRoundSchema, response.data, { context: 'inpatientApi.listWardRounds' });
  },

  async getWardRound(wardRoundId: number): Promise<WardRound> {
    const response = await apiClient.get<WardRound>(`/api/inpatient/ward-rounds/${wardRoundId}/`);
    return parseResponse(WardRoundSchema, response.data, { context: 'inpatientApi.getWardRound' });
  },

  async createWardRound(data: WardRoundCreateData): Promise<WardRound> {
    const response = await apiClient.post<WardRound>('/api/inpatient/ward-rounds/', data);
    return parseResponse(WardRoundSchema, response.data, { context: 'inpatientApi.createWardRound' });
  },

  async updateWardRound(wardRoundId: number, data: Partial<WardRoundCreateData>): Promise<WardRound> {
    const response = await apiClient.patch<WardRound>(`/api/inpatient/ward-rounds/${wardRoundId}/`, data);
    return parseResponse(WardRoundSchema, response.data, { context: 'inpatientApi.updateWardRound' });
  },

  // ============================================================================
  // Nursing Kardex
  // ============================================================================
  async listKardex(params?: KardexListParams): Promise<KardexListResponse> {
    const response = await apiClient.get<KardexListResponse>('/api/inpatient/kardex/', {
      params,
    });
    return parseResponse(PaginatedNursingKardexSchema, response.data, { context: 'inpatientApi.listKardex' });
  },

  async getKardex(kardexId: number): Promise<NursingKardex> {
    const response = await apiClient.get<NursingKardex>(`/api/inpatient/kardex/${kardexId}/`);
    return parseResponse(NursingKardexSchema, response.data, { context: 'inpatientApi.getKardex' });
  },

  async getKardexByAdmission(admissionId: number): Promise<NursingKardex | null> {
    const response = await apiClient.get<KardexListResponse>('/api/inpatient/kardex/', {
      params: { admission: admissionId },
    });
    const validated = parseResponse(PaginatedNursingKardexSchema, response.data, { context: 'inpatientApi.getKardexByAdmission' });
    // Return the first (and should be only) kardex for this admission, or null if none
    const kardex = validated.results[0];
    return kardex ?? null;
  },

  async updateKardex(kardexId: number, data: KardexUpdateData): Promise<NursingKardex> {
    const response = await apiClient.patch<NursingKardex>(`/api/inpatient/kardex/${kardexId}/`, data);
    return parseResponse(NursingKardexSchema, response.data, { context: 'inpatientApi.updateKardex' });
  },

  async addKardexShiftNote(kardexId: number, data: KardexShiftNoteCreateData): Promise<KardexShiftNote> {
    const response = await apiClient.post<KardexShiftNote>(
      `/api/inpatient/kardex/${kardexId}/add-shift-note/`,
      data
    );
    return parseResponse(KardexShiftNoteSchema, response.data, { context: 'inpatientApi.addKardexShiftNote' });
  },

  async addKardexHandoverNote(kardexId: number, data: KardexHandoverNoteCreateData): Promise<KardexHandoverNote> {
    const response = await apiClient.post<KardexHandoverNote>(
      `/api/inpatient/kardex/${kardexId}/add-handover-note/`,
      data
    );
    return parseResponse(KardexHandoverNoteSchema, response.data, { context: 'inpatientApi.addKardexHandoverNote' });
  },

  // ============================================================================
  // Shift Handovers
  // ============================================================================
  async listShiftHandovers(params?: ShiftHandoverListParams): Promise<ShiftHandoverListResponse> {
    const response = await apiClient.get<ShiftHandoverListResponse>('/api/inpatient/shift-handovers/', {
      params,
    });
    return parseResponse(PaginatedShiftHandoverSchema, response.data, { context: 'inpatientApi.listShiftHandovers' });
  },

  async getShiftHandover(handoverId: number): Promise<ShiftHandover> {
    const response = await apiClient.get<ShiftHandover>(`/api/inpatient/shift-handovers/${handoverId}/`);
    return parseResponse(ShiftHandoverSchema, response.data, { context: 'inpatientApi.getShiftHandover' });
  },

  async createShiftHandover(data: ShiftHandoverCreateData): Promise<ShiftHandover> {
    const response = await apiClient.post<ShiftHandover>('/api/inpatient/shift-handovers/', data);
    return parseResponse(ShiftHandoverSchema, response.data, { context: 'inpatientApi.createShiftHandover' });
  },

  async acknowledgeShiftHandover(handoverId: number): Promise<ShiftHandover> {
    const response = await apiClient.post<ShiftHandover>(
      `/api/inpatient/shift-handovers/${handoverId}/acknowledge/`
    );
    return parseResponse(ShiftHandoverSchema, response.data, { context: 'inpatientApi.acknowledgeShiftHandover' });
  },

  async autoPopulateShiftHandover(handoverId: number): Promise<ShiftHandover> {
    const response = await apiClient.post<ShiftHandover>(
      `/api/inpatient/shift-handovers/${handoverId}/auto-populate/`
    );
    return parseResponse(ShiftHandoverSchema, response.data, { context: 'inpatientApi.autoPopulateShiftHandover' });
  },

  // ============================================================================
  // Ward Compatibility
  // ============================================================================

  /**
   * Check if a patient is compatible with a specific ward.
   */
  async checkWardCompatibility(
    wardId: number,
    patientId: number,
    requiresIsolation?: boolean
  ): Promise<CompatibilityCheckResult> {
    const response = await apiClient.post<CompatibilityCheckResult>(
      `/api/inpatient/wards/${wardId}/check_compatibility/`,
      { patient_id: patientId, requires_isolation: requiresIsolation ?? false }
    );
    return response.data;
  },

  /**
   * Bulk check patient compatibility across all active wards.
   * Useful for emergency admissions needing quick bed assignment.
   */
  async bulkCheckCompatibility(
    patientIds: number[],
    requiresIsolation?: boolean[]
  ): Promise<BulkCompatibilityResult> {
    const response = await apiClient.post<BulkCompatibilityResult>(
      '/api/inpatient/wards/bulk_check_compatibility/',
      {
        patient_ids: patientIds,
        requires_isolation: requiresIsolation ?? [],
      }
    );
    return response.data;
  },

  /**
   * Polling fallback for ward updates when WebSocket is unavailable.
   */
  async getWardUpdates(wardId: number, since?: string): Promise<WardUpdatesResponse> {
    const params: Record<string, string> = {};
    if (since) params.since = since;
    const response = await apiClient.get<WardUpdatesResponse>(
      `/api/inpatient/wards/${wardId}/updates/`,
      { params }
    );
    return response.data;
  },

  /**
   * Get supervisor critical violation alerts (polling fallback).
   * Requires receive_critical_alerts permission.
   */
  async getSupervisorAlerts(since?: string, limit?: number): Promise<SupervisorAlertsResponse> {
    const params: Record<string, string | number> = {};
    if (since) params.since = since;
    if (limit) params.limit = limit;
    const response = await apiClient.get<SupervisorAlertsResponse>(
      '/api/inpatient/supervisor/alerts/',
      { params }
    );
    return response.data;
  },
};

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
  ReviewRequestSchema,
  PaginatedReviewRequestSchema,
  NursingKardexSchema,
  NursingCarePlanEntrySchema,
  KardexShiftNoteSchema,
  KardexHandoverNoteSchema,
  InpatientConsumableUsageArraySchema,
  InpatientConsumableUsageSchema,
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
  BulkCompatibilityResultSchema,
  CompatibilityCheckResultSchema,
  TemperatureReadingSchema,
  PaginatedTemperatureReadingSchema,
  FluidBalanceSheetSchema,
  PaginatedFluidBalanceSheetSchema,
  FluidBalanceEntrySchema,
  PaginatedFluidBalanceEntrySchema,
  BloodTransfusionSchema,
  PaginatedBloodTransfusionSchema,
  TransfusionObservationEntrySchema,
  BPMonitoringReadingSchema,
  PaginatedBPMonitoringReadingSchema,
  RuleBasedBedAssignmentResponseSchema,
  PredictedDischargesResponseSchema,
  BedUtilizationSchema,
  SmartRecommendBedResponseSchema,
  SetExpectedDischargeResponseSchema,
} from '@/lib/schemas/inpatient.schema';
import type { LabOrder } from '@/lib/types/laboratory';
import type { ImagingOrder } from '@/lib/types/imaging';
import type { Prescription } from '@/lib/types/pharmacy';
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
  ConstraintOverrideMetrics,
  Discharge,
  DischargeCreateData,
  DischargeListParams,
  DischargeListResponse,
  InpatientWard,
  InpatientConsumableUsage,
  InpatientConsumableUsageCreateData,
  InpatientConsumableUsageReverseData,
  KardexHandoverNote,
  KardexHandoverNoteCreateData,
  KardexListParams,
  KardexListResponse,
  KardexShiftNote,
  KardexShiftNoteCreateData,
  KardexUpdateData,
  NursingKardex,
  NursingCarePlanEntry,
  NursingCarePlanEntryCreateData,
  NursingCarePlanEntryUpdateData,
  ReviewRequest,
  ReviewRequestCreateData,
  ReviewRequestListParams,
  ReviewRequestListResponse,
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
  AdmissionOrdersResponse,
  AcknowledgeAlertRequest,
  AcknowledgeAlertResponse,
  TemperatureReading,
  TemperatureReadingCreateData,
  TemperatureReadingListResponse,
  FluidBalanceSheet,
  FluidBalanceSheetCreateData,
  FluidBalanceSheetListResponse,
  FluidBalanceSheetUpdateData,
  FluidBalanceEntry,
  FluidBalanceEntryCreateData,
  FluidBalanceEntryListResponse,
  BloodTransfusion,
  BloodTransfusionCreateData,
  BloodTransfusionListResponse,
  TransfusionObservationEntry,
  TransfusionObservationEntryCreateData,
  BPMonitoringReading,
  BPMonitoringReadingCreateData,
  BPMonitoringReadingListResponse,
  RuleBasedBedAssignmentResponse,
  BedOverrideRequest,
  BedOverrideResponse,
  PredictedDischargesResponse,
  BedUtilization,
  SmartRecommendBedRequest,
  SmartRecommendBedResponse,
  SetExpectedDischargeRequest,
  SetExpectedDischargeResponse,
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

  /**
   * Generate missing beds for a ward based on its capacity.
   * Creates bed records up to the ward's capacity if fewer beds currently exist.
   */
  async generateWardBeds(wardId: number): Promise<{
    created: number;
    total: number;
    capacity: number;
    message: string;
  }> {
    const response = await apiClient.post(`/api/inpatient/wards/${wardId}/generate_beds/`);
    return response.data;
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

  async markBedCleaning(bedId: number, notes?: string): Promise<Bed> {
    const response = await apiClient.post<Bed>(`/api/inpatient/beds/${bedId}/mark_cleaning/`, {
      ...(notes ? { notes } : {}),
    });
    return parseResponse(BedSchema, response.data, { context: 'inpatientApi.markBedCleaning' });
  },

  async markBedAvailable(bedId: number): Promise<Bed> {
    const response = await apiClient.post<Bed>(`/api/inpatient/beds/${bedId}/mark_available/`, {});
    return parseResponse(BedSchema, response.data, { context: 'inpatientApi.markBedAvailable' });
  },

  // ============================================================================
  // Admission Recommendations
  // ============================================================================
  async getAdmissionRecommendation(id: number): Promise<AdmissionRecommendation> {
    const response = await apiClient.get<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${id}/`
    );
    return parseResponse(AdmissionRecommendationSchema, response.data, { context: 'inpatientApi.getAdmissionRecommendation' });
  },

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
  // Review Requests
  // ============================================================================
  async listReviewRequests(params?: ReviewRequestListParams): Promise<ReviewRequestListResponse> {
    const response = await apiClient.get<ReviewRequestListResponse>('/api/inpatient/review-requests/', {
      params,
    });
    return parseResponse(PaginatedReviewRequestSchema, response.data, { context: 'inpatientApi.listReviewRequests' });
  },

  async getReviewRequest(requestId: number): Promise<ReviewRequest> {
    const response = await apiClient.get<ReviewRequest>(`/api/inpatient/review-requests/${requestId}/`);
    return parseResponse(ReviewRequestSchema, response.data, { context: 'inpatientApi.getReviewRequest' });
  },

  async createReviewRequest(data: ReviewRequestCreateData): Promise<ReviewRequest> {
    const response = await apiClient.post<ReviewRequest>('/api/inpatient/review-requests/', data);
    return parseResponse(ReviewRequestSchema, response.data, { context: 'inpatientApi.createReviewRequest' });
  },

  async acknowledgeReviewRequest(requestId: number): Promise<ReviewRequest> {
    const response = await apiClient.post<ReviewRequest>(`/api/inpatient/review-requests/${requestId}/acknowledge/`);
    return parseResponse(ReviewRequestSchema, response.data, { context: 'inpatientApi.acknowledgeReviewRequest' });
  },

  async completeReviewRequest(requestId: number): Promise<ReviewRequest> {
    const response = await apiClient.post<ReviewRequest>(`/api/inpatient/review-requests/${requestId}/complete/`);
    return parseResponse(ReviewRequestSchema, response.data, { context: 'inpatientApi.completeReviewRequest' });
  },

  async cancelReviewRequest(requestId: number, reason: string): Promise<ReviewRequest> {
    const response = await apiClient.post<ReviewRequest>(`/api/inpatient/review-requests/${requestId}/cancel/`, {
      reason,
    });
    return parseResponse(ReviewRequestSchema, response.data, { context: 'inpatientApi.cancelReviewRequest' });
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

  async addCarePlanEntry(kardexId: number, data: NursingCarePlanEntryCreateData): Promise<NursingCarePlanEntry> {
    const response = await apiClient.post<NursingCarePlanEntry>(
      `/api/inpatient/kardex/${kardexId}/add-care-plan-entry/`,
      data
    );
    return parseResponse(NursingCarePlanEntrySchema, response.data, { context: 'inpatientApi.addCarePlanEntry' });
  },

  async updateCarePlanEntry(kardexId: number, entryId: number, data: NursingCarePlanEntryUpdateData): Promise<NursingCarePlanEntry> {
    const response = await apiClient.patch<NursingCarePlanEntry>(
      `/api/inpatient/kardex/${kardexId}/update-care-plan-entry/${entryId}/`,
      data
    );
    return parseResponse(NursingCarePlanEntrySchema, response.data, { context: 'inpatientApi.updateCarePlanEntry' });
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
    return parseResponse(CompatibilityCheckResultSchema, response.data, { context: 'inpatientApi.checkWardCompatibility' });
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
    return parseResponse(BulkCompatibilityResultSchema, response.data, { context: 'inpatientApi.bulkCheckCompatibility' });
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

  // ============================================================================
  // Admission Orders
  // ============================================================================
  /**
   * Get all medical orders for an admission (combined view).
   */
  async getAdmissionOrders(admissionId: number): Promise<AdmissionOrdersResponse> {
    const response = await apiClient.get<AdmissionOrdersResponse>(
      `/api/inpatient/admissions/${admissionId}/orders/`
    );
    return response.data;
  },

  /**
   * Get lab orders for an admission.
   */
  async getAdmissionLabOrders(admissionId: number): Promise<LabOrder[]> {
    const response = await apiClient.get<LabOrder[]>(
      `/api/inpatient/admissions/${admissionId}/lab-orders/`
    );
    return response.data;
  },

  /**
   * Get imaging orders for an admission.
   */
  async getAdmissionImagingOrders(admissionId: number): Promise<ImagingOrder[]> {
    const response = await apiClient.get<ImagingOrder[]>(
      `/api/inpatient/admissions/${admissionId}/imaging-orders/`
    );
    return response.data;
  },

  /**
   * Get prescriptions for an admission.
   */
  async getAdmissionPrescriptions(admissionId: number): Promise<Prescription[]> {
    const response = await apiClient.get<Prescription[]>(
      `/api/inpatient/admissions/${admissionId}/prescriptions/`
    );
    return response.data;
  },

  /**
   * Get recorded consumable usage for an admission.
   */
  async getAdmissionConsumableUsage(admissionId: number): Promise<InpatientConsumableUsage[]> {
    const response = await apiClient.get<InpatientConsumableUsage[]>(
      `/api/inpatient/admissions/${admissionId}/consumable-usage/`
    );
    return parseResponse(InpatientConsumableUsageArraySchema, response.data, {
      context: 'inpatientApi.getAdmissionConsumableUsage',
    });
  },

  /**
   * Record consumable usage for an admission.
   */
  async recordAdmissionConsumableUsage(
    admissionId: number,
    data: InpatientConsumableUsageCreateData
  ): Promise<InpatientConsumableUsage> {
    const response = await apiClient.post<InpatientConsumableUsage>(
      `/api/inpatient/admissions/${admissionId}/record-consumable-usage/`,
      data
    );
    return parseResponse(InpatientConsumableUsageSchema, response.data, {
      context: 'inpatientApi.recordAdmissionConsumableUsage',
    });
  },

  /**
   * Reverse a consumable usage record for an admission.
   */
  async reverseAdmissionConsumableUsage(
    admissionId: number,
    usageId: number,
    data: InpatientConsumableUsageReverseData
  ): Promise<InpatientConsumableUsage> {
    const response = await apiClient.post<InpatientConsumableUsage>(
      `/api/inpatient/admissions/${admissionId}/reverse-consumable-usage/${usageId}/`,
      data
    );
    return parseResponse(InpatientConsumableUsageSchema, response.data, {
      context: 'inpatientApi.reverseAdmissionConsumableUsage',
    });
  },

  // ============================================================================
  // Supervisor Alert Acknowledgment
  // ============================================================================

  /**
   * Acknowledge a critical constraint violation alert.
   * Requires receive_critical_alerts permission.
   */
  async acknowledgeAlert(data: AcknowledgeAlertRequest): Promise<AcknowledgeAlertResponse> {
    const response = await apiClient.post<AcknowledgeAlertResponse>(
      '/api/inpatient/supervisor/alerts/acknowledge/',
      data
    );
    return response.data;
  },

  /**
   * Get constraint override metrics.
   * Requires receive_critical_alerts permission.
   */
  async getConstraintOverrideMetrics(days?: number): Promise<ConstraintOverrideMetrics> {
    const params: Record<string, number> = {};
    if (days) params.days = days;
    const response = await apiClient.get<ConstraintOverrideMetrics>(
      '/api/inpatient/supervisor/alerts/metrics/',
      { params }
    );
    return response.data;
  },

  // ============================================================================
  // Temperature Readings
  // ============================================================================

  async listTemperatureReadings(
    params?: { admission?: number; page?: number; page_size?: number }
  ): Promise<TemperatureReadingListResponse> {
    const response = await apiClient.get('/api/inpatient/temperature-readings/', { params });
    return parseResponse(PaginatedTemperatureReadingSchema, response.data, {
      context: 'inpatientApi.listTemperatureReadings',
    });
  },

  async createTemperatureReading(data: TemperatureReadingCreateData): Promise<TemperatureReading> {
    const response = await apiClient.post('/api/inpatient/temperature-readings/', data);
    return parseResponse(TemperatureReadingSchema, response.data, {
      context: 'inpatientApi.createTemperatureReading',
    });
  },

  async listFluidBalanceSheets(
    params?: { admission?: number; chart_date?: string; page?: number; page_size?: number }
  ): Promise<FluidBalanceSheetListResponse> {
    const response = await apiClient.get('/api/inpatient/fluid-balance-sheets/', { params });
    return parseResponse(PaginatedFluidBalanceSheetSchema, response.data, {
      context: 'inpatientApi.listFluidBalanceSheets',
    });
  },

  async getFluidBalanceSheet(id: number): Promise<FluidBalanceSheet> {
    const response = await apiClient.get(`/api/inpatient/fluid-balance-sheets/${id}/`);
    return parseResponse(FluidBalanceSheetSchema, response.data, {
      context: 'inpatientApi.getFluidBalanceSheet',
    });
  },

  async createFluidBalanceSheet(data: FluidBalanceSheetCreateData): Promise<FluidBalanceSheet> {
    const response = await apiClient.post('/api/inpatient/fluid-balance-sheets/', data);
    return parseResponse(FluidBalanceSheetSchema, response.data, {
      context: 'inpatientApi.createFluidBalanceSheet',
    });
  },

  async updateFluidBalanceSheet(
    id: number,
    data: FluidBalanceSheetUpdateData
  ): Promise<FluidBalanceSheet> {
    const response = await apiClient.patch(`/api/inpatient/fluid-balance-sheets/${id}/`, data);
    return parseResponse(FluidBalanceSheetSchema, response.data, {
      context: 'inpatientApi.updateFluidBalanceSheet',
    });
  },

  async listFluidBalanceEntries(
    params?: { fluid_balance_sheet?: number; entry_type?: string; page?: number; page_size?: number }
  ): Promise<FluidBalanceEntryListResponse> {
    const response = await apiClient.get('/api/inpatient/fluid-balance-entries/', { params });
    return parseResponse(PaginatedFluidBalanceEntrySchema, response.data, {
      context: 'inpatientApi.listFluidBalanceEntries',
    });
  },

  async createFluidBalanceEntry(data: FluidBalanceEntryCreateData): Promise<FluidBalanceEntry> {
    const response = await apiClient.post('/api/inpatient/fluid-balance-entries/', data);
    return parseResponse(FluidBalanceEntrySchema, response.data, {
      context: 'inpatientApi.createFluidBalanceEntry',
    });
  },

  // ============================================================================
  // Blood Transfusions
  // ============================================================================

  async listBloodTransfusions(
    params?: { admission?: number; status?: string; page?: number; page_size?: number }
  ): Promise<BloodTransfusionListResponse> {
    const response = await apiClient.get('/api/inpatient/blood-transfusions/', { params });
    return parseResponse(PaginatedBloodTransfusionSchema, response.data, {
      context: 'inpatientApi.listBloodTransfusions',
    });
  },

  async getBloodTransfusion(id: number): Promise<BloodTransfusion> {
    const response = await apiClient.get(`/api/inpatient/blood-transfusions/${id}/`);
    return parseResponse(BloodTransfusionSchema, response.data, {
      context: 'inpatientApi.getBloodTransfusion',
    });
  },

  async createBloodTransfusion(data: BloodTransfusionCreateData): Promise<BloodTransfusion> {
    const response = await apiClient.post('/api/inpatient/blood-transfusions/', data);
    return parseResponse(BloodTransfusionSchema, response.data, {
      context: 'inpatientApi.createBloodTransfusion',
    });
  },

  async addTransfusionObservation(
    transfusionId: number,
    data: TransfusionObservationEntryCreateData
  ): Promise<TransfusionObservationEntry> {
    const response = await apiClient.post(
      `/api/inpatient/blood-transfusions/${transfusionId}/add-observation/`,
      data
    );
    return parseResponse(TransfusionObservationEntrySchema, response.data, {
      context: 'inpatientApi.addTransfusionObservation',
    });
  },

  async markTransfusionReaction(
    transfusionId: number,
    data: { reaction_type: string; action_taken?: string }
  ): Promise<BloodTransfusion> {
    const response = await apiClient.post(
      `/api/inpatient/blood-transfusions/${transfusionId}/mark-reaction/`,
      data
    );
    return parseResponse(BloodTransfusionSchema, response.data, {
      context: 'inpatientApi.markTransfusionReaction',
    });
  },

  async completeTransfusion(
    transfusionId: number,
    data?: { time_ended?: string }
  ): Promise<BloodTransfusion> {
    const response = await apiClient.post(
      `/api/inpatient/blood-transfusions/${transfusionId}/complete/`,
      data ?? {}
    );
    return parseResponse(BloodTransfusionSchema, response.data, {
      context: 'inpatientApi.completeTransfusion',
    });
  },

  // ============================================================================
  // BP Monitoring
  // ============================================================================

  async listBPReadings(
    params?: { admission?: number; page?: number; page_size?: number }
  ): Promise<BPMonitoringReadingListResponse> {
    const response = await apiClient.get('/api/inpatient/bp-readings/', { params });
    return parseResponse(PaginatedBPMonitoringReadingSchema, response.data, {
      context: 'inpatientApi.listBPReadings',
    });
  },

  async createBPReading(data: BPMonitoringReadingCreateData): Promise<BPMonitoringReading> {
    const response = await apiClient.post('/api/inpatient/bp-readings/', data);
    return parseResponse(BPMonitoringReadingSchema, response.data, {
      context: 'inpatientApi.createBPReading',
    });
  },

  // ============================================================================
  // Rule-Based Bed Assignment (Phase B)
  // ============================================================================

  /**
   * Recommend a bed using rule-based scoring without assigning.
   * Returns scored candidates and the top recommendation.
   */
  async recommendBed(
    wardId: number,
    data: { patient_id: number; requires_isolation?: boolean; requires_oxygen?: boolean; requires_ventilator?: boolean }
  ): Promise<RuleBasedBedAssignmentResponse> {
    const response = await apiClient.post(
      `/api/inpatient/wards/${wardId}/recommend_bed/`,
      data
    );
    return parseResponse(RuleBasedBedAssignmentResponseSchema, response.data, {
      context: 'inpatientApi.recommendBed',
    });
  },

  /**
   * Override a bed assignment with justification.
   * Logs the override to AssignmentOverride for audit.
   */
  async overrideBed(
    admissionId: number,
    data: BedOverrideRequest
  ): Promise<BedOverrideResponse> {
    const response = await apiClient.post(
      `/api/inpatient/admissions/${admissionId}/override_bed/`,
      data
    );
    return response.data;
  },

  // ============================================================================
  // Smart Allocation (Phase C)
  // ============================================================================

  /**
   * Get predicted discharges for a ward within a time window.
   * Combines explicit expected_discharge_date and avg LOS estimates.
   */
  async getPredictedDischarges(
    wardId: number,
    hoursAhead?: number
  ): Promise<PredictedDischargesResponse> {
    const params: Record<string, number> = {};
    if (hoursAhead) params.hours_ahead = hoursAhead;
    const response = await apiClient.get(
      `/api/inpatient/wards/${wardId}/predicted_discharges/`,
      { params }
    );
    return parseResponse(PredictedDischargesResponseSchema, response.data, {
      context: 'inpatientApi.getPredictedDischarges',
    });
  },

  /**
   * Get comprehensive bed utilization analytics for a ward.
   * Includes occupancy, buffer, workload, and predicted discharges.
   */
  async getBedUtilization(wardId: number): Promise<BedUtilization> {
    const response = await apiClient.get(
      `/api/inpatient/wards/${wardId}/bed_utilization/`
    );
    return parseResponse(BedUtilizationSchema, response.data, {
      context: 'inpatientApi.getBedUtilization',
    });
  },

  /**
   * Smart bed recommendation using Phase C allocation algorithm.
   * Considers infection control, emergency buffer, cohort grouping, and workload.
   */
  async smartRecommendBed(
    wardId: number,
    data: SmartRecommendBedRequest
  ): Promise<SmartRecommendBedResponse> {
    const response = await apiClient.post(
      `/api/inpatient/wards/${wardId}/smart_recommend_bed/`,
      data
    );
    return parseResponse(SmartRecommendBedResponseSchema, response.data, {
      context: 'inpatientApi.smartRecommendBed',
    });
  },

  /**
   * Set expected discharge date for an active admission.
   * Used for bed planning and predictive discharge.
   */
  async setExpectedDischarge(
    admissionId: number,
    data: SetExpectedDischargeRequest
  ): Promise<SetExpectedDischargeResponse> {
    const response = await apiClient.post(
      `/api/inpatient/admissions/${admissionId}/set_expected_discharge/`,
      data
    );
    return parseResponse(SetExpectedDischargeResponseSchema, response.data, {
      context: 'inpatientApi.setExpectedDischarge',
    });
  },
};

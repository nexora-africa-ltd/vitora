/**
 * Inpatient (Admissions/IPD) API client.
 */

import { apiClient } from './client';
import type {
  Admission,
  AdmissionListParams,
  AdmissionListResponse,
  AdmissionRecommendation,
  AdmissionRecommendationListParams,
  AdmissionRecommendationListResponse,
  Bed,
  BedListParams,
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
  Transfer,
  TransferCreateData,
  TransferListParams,
  TransferListResponse,
  WardRound,
  WardRoundCreateData,
  WardRoundListParams,
  WardRoundListResponse,
} from '@/lib/types/inpatient';

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export const inpatientApi = {
  // ============================================================================
  // Wards
  // ============================================================================
  async listWards(params?: { ward_type?: string; page?: number; page_size?: number }): Promise<Paginated<InpatientWard>> {
    const response = await apiClient.get<Paginated<InpatientWard>>('/api/inpatient/wards/', { params });
    return response.data;
  },

  async getWard(wardId: number): Promise<InpatientWard> {
    const response = await apiClient.get<InpatientWard>(`/api/inpatient/wards/${wardId}/`);
    return response.data;
  },

  async listWardBeds(
    wardId: number,
    params?: Omit<BedListParams, 'ward'> & { page?: number; page_size?: number }
  ): Promise<Paginated<Bed> | Bed[]> {
    const response = await apiClient.get(`/api/inpatient/wards/${wardId}/beds/`, { params });
    return response.data as any;
  },

  // ============================================================================
  // Beds
  // ============================================================================
  async listBeds(params?: BedListParams & { page?: number; page_size?: number }): Promise<Paginated<Bed>> {
    const response = await apiClient.get<Paginated<Bed>>('/api/inpatient/beds/', { params });
    return response.data;
  },

  async updateBed(bedId: number, data: Partial<Bed>): Promise<Bed> {
    const response = await apiClient.patch<Bed>(`/api/inpatient/beds/${bedId}/`, data);
    return response.data;
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
    return response.data;
  },

  async createAdmissionRecommendation(
    data: Partial<AdmissionRecommendation>
  ): Promise<AdmissionRecommendation> {
    const response = await apiClient.post<AdmissionRecommendation>(
      '/api/inpatient/admission-recommendations/',
      data
    );
    return response.data;
  },

  async acceptAdmissionRecommendation(recommendationId: number, userId: number) {
    const response = await apiClient.post<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${recommendationId}/accept/`,
      { user: userId }
    );
    return response.data;
  },

  async declineAdmissionRecommendation(recommendationId: number, userId: number, reason: string) {
    const response = await apiClient.post<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${recommendationId}/decline/`,
      { user: userId, reason }
    );
    return response.data;
  },

  // ============================================================================
  // Admissions
  // ============================================================================
  async listAdmissions(params?: AdmissionListParams): Promise<AdmissionListResponse> {
    const response = await apiClient.get<AdmissionListResponse>('/api/inpatient/admissions/', {
      params,
    });
    return response.data;
  },

  async getAdmission(admissionId: number): Promise<Admission> {
    const response = await apiClient.get<Admission>(`/api/inpatient/admissions/${admissionId}/`);
    return response.data;
  },

  async createAdmission(data: Partial<Admission>): Promise<Admission> {
    const response = await apiClient.post<Admission>('/api/inpatient/admissions/', data);
    return response.data;
  },

  async updateAdmission(admissionId: number, data: Partial<Admission>): Promise<Admission> {
    const response = await apiClient.patch<Admission>(`/api/inpatient/admissions/${admissionId}/`, data);
    return response.data;
  },

  // ============================================================================
  // Discharges
  // ============================================================================
  async listDischarges(params?: DischargeListParams): Promise<DischargeListResponse> {
    const response = await apiClient.get<DischargeListResponse>('/api/inpatient/discharges/', {
      params,
    });
    return response.data;
  },

  async getDischarge(dischargeId: number): Promise<Discharge> {
    const response = await apiClient.get<Discharge>(`/api/inpatient/discharges/${dischargeId}/`);
    return response.data;
  },

  async createDischarge(data: DischargeCreateData): Promise<Discharge> {
    const response = await apiClient.post<Discharge>('/api/inpatient/discharges/', data);
    return response.data;
  },

  async updateDischarge(dischargeId: number, data: Partial<DischargeCreateData>): Promise<Discharge> {
    const response = await apiClient.patch<Discharge>(`/api/inpatient/discharges/${dischargeId}/`, data);
    return response.data;
  },

  // ============================================================================
  // Transfers
  // ============================================================================
  async listTransfers(params?: TransferListParams): Promise<TransferListResponse> {
    const response = await apiClient.get<TransferListResponse>('/api/inpatient/transfers/', {
      params,
    });
    return response.data;
  },

  async getTransfer(transferId: number): Promise<Transfer> {
    const response = await apiClient.get<Transfer>(`/api/inpatient/transfers/${transferId}/`);
    return response.data;
  },

  async createTransfer(data: TransferCreateData): Promise<Transfer> {
    const response = await apiClient.post<Transfer>('/api/inpatient/transfers/', data);
    return response.data;
  },

  // ============================================================================
  // Ward Rounds
  // ============================================================================
  async listWardRounds(params?: WardRoundListParams): Promise<WardRoundListResponse> {
    const response = await apiClient.get<WardRoundListResponse>('/api/inpatient/ward-rounds/', {
      params,
    });
    return response.data;
  },

  async getWardRound(wardRoundId: number): Promise<WardRound> {
    const response = await apiClient.get<WardRound>(`/api/inpatient/ward-rounds/${wardRoundId}/`);
    return response.data;
  },

  async createWardRound(data: WardRoundCreateData): Promise<WardRound> {
    const response = await apiClient.post<WardRound>('/api/inpatient/ward-rounds/', data);
    return response.data;
  },

  async updateWardRound(wardRoundId: number, data: Partial<WardRoundCreateData>): Promise<WardRound> {
    const response = await apiClient.patch<WardRound>(`/api/inpatient/ward-rounds/${wardRoundId}/`, data);
    return response.data;
  },

  // ============================================================================
  // Nursing Kardex
  // ============================================================================
  async listKardex(params?: KardexListParams): Promise<KardexListResponse> {
    const response = await apiClient.get<KardexListResponse>('/api/inpatient/kardex/', {
      params,
    });
    return response.data;
  },

  async getKardex(kardexId: number): Promise<NursingKardex> {
    const response = await apiClient.get<NursingKardex>(`/api/inpatient/kardex/${kardexId}/`);
    return response.data;
  },

  async getKardexByAdmission(admissionId: number): Promise<NursingKardex | null> {
    const response = await apiClient.get<KardexListResponse>('/api/inpatient/kardex/', {
      params: { admission: admissionId },
    });
    // Return the first (and should be only) kardex for this admission, or null if none
    const kardex = response.data.results[0];
    return kardex ?? null;
  },

  async updateKardex(kardexId: number, data: KardexUpdateData): Promise<NursingKardex> {
    const response = await apiClient.patch<NursingKardex>(`/api/inpatient/kardex/${kardexId}/`, data);
    return response.data;
  },

  async addKardexShiftNote(kardexId: number, data: KardexShiftNoteCreateData): Promise<KardexShiftNote> {
    const response = await apiClient.post<KardexShiftNote>(
      `/api/inpatient/kardex/${kardexId}/add-shift-note/`,
      data
    );
    return response.data;
  },

  async addKardexHandoverNote(kardexId: number, data: KardexHandoverNoteCreateData): Promise<KardexHandoverNote> {
    const response = await apiClient.post<KardexHandoverNote>(
      `/api/inpatient/kardex/${kardexId}/add-handover-note/`,
      data
    );
    return response.data;
  },

  // ============================================================================
  // Shift Handovers
  // ============================================================================
  async listShiftHandovers(params?: ShiftHandoverListParams): Promise<ShiftHandoverListResponse> {
    const response = await apiClient.get<ShiftHandoverListResponse>('/api/inpatient/shift-handovers/', {
      params,
    });
    return response.data;
  },

  async getShiftHandover(handoverId: number): Promise<ShiftHandover> {
    const response = await apiClient.get<ShiftHandover>(`/api/inpatient/shift-handovers/${handoverId}/`);
    return response.data;
  },

  async createShiftHandover(data: ShiftHandoverCreateData): Promise<ShiftHandover> {
    const response = await apiClient.post<ShiftHandover>('/api/inpatient/shift-handovers/', data);
    return response.data;
  },

  async acknowledgeShiftHandover(handoverId: number): Promise<ShiftHandover> {
    const response = await apiClient.post<ShiftHandover>(
      `/api/inpatient/shift-handovers/${handoverId}/acknowledge/`
    );
    return response.data;
  },

  async autoPopulateShiftHandover(handoverId: number): Promise<ShiftHandover> {
    const response = await apiClient.post<ShiftHandover>(
      `/api/inpatient/shift-handovers/${handoverId}/auto-populate/`
    );
    return response.data;
  },
};

import { apiClient } from './client';
import {
  AdmissionSchema,
  BedSchema,
  BedSwapResultSchema,
  DischargeSchema,
  InpatientWardSchema,
  MARScheduleGenerateResultSchema,
  PaginatedAdmissionSchema,
  PaginatedBedSchema,
  PaginatedWardSchema,
  TransferSchema,
} from '@/lib/schemas/inpatient.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { PaginatedResponse } from '@/lib/types/common';
import type {
  Admission,
  AdmissionCreateData,
  AdmissionListParams,
  Bed,
  BedSwapData,
  BedSwapResult,
  Discharge,
  DischargeCreateData,
  InpatientWard,
  MARScheduleGenerateData,
  MARScheduleGenerateResult,
  Transfer,
  WardListParams,
} from '@/lib/types/inpatient';

export const inpatientApi = {
  // ── Wards ──

  async listWards(params: WardListParams = {}): Promise<PaginatedResponse<InpatientWard>> {
    const response = await apiClient.get('/api/inpatient/wards/', { params });
    return parseResponse(PaginatedWardSchema, response.data, { context: 'inpatient.listWards' });
  },

  async getWard(id: number): Promise<InpatientWard> {
    const response = await apiClient.get(`/api/inpatient/wards/${id}/`);
    return parseResponse(InpatientWardSchema, response.data, { context: 'inpatient.getWard' });
  },

  async getWardBeds(wardId: number): Promise<PaginatedResponse<Bed>> {
    const response = await apiClient.get(`/api/inpatient/wards/${wardId}/beds/`);
    return parseResponse(PaginatedBedSchema, response.data, { context: 'inpatient.getWardBeds' });
  },

  // ── Beds ──

  async getBed(id: number): Promise<Bed> {
    const response = await apiClient.get(`/api/inpatient/beds/${id}/`);
    return parseResponse(BedSchema, response.data, { context: 'inpatient.getBed' });
  },

  // ── Admissions ──

  async listAdmissions(params: AdmissionListParams = {}): Promise<PaginatedResponse<Admission>> {
    const response = await apiClient.get('/api/inpatient/admissions/', { params });
    return parseResponse(PaginatedAdmissionSchema, response.data, { context: 'inpatient.listAdmissions' });
  },

  async getAdmission(id: number): Promise<Admission> {
    const response = await apiClient.get(`/api/inpatient/admissions/${id}/`);
    return parseResponse(AdmissionSchema, response.data, { context: 'inpatient.getAdmission' });
  },

  async createAdmission(data: AdmissionCreateData): Promise<Admission> {
    const response = await apiClient.post('/api/inpatient/admissions/', data);
    return parseResponse(AdmissionSchema, response.data, { context: 'inpatient.createAdmission' });
  },

  // ── Discharges ──

  async createDischarge(data: DischargeCreateData): Promise<Discharge> {
    const response = await apiClient.post('/api/inpatient/discharges/', data);
    return parseResponse(DischargeSchema, response.data, { context: 'inpatient.createDischarge' });
  },

  // ── Transfers ──

  async createTransfer(data: { admission: number; destination_ward: number; destination_bed?: number; reason: string; clinical_handover_notes?: string }): Promise<Transfer> {
    const response = await apiClient.post('/api/inpatient/transfers/', data);
    return parseResponse(TransferSchema, response.data, { context: 'inpatient.createTransfer' });
  },

  // ── Bed Swap ──

  async swapBeds(data: BedSwapData): Promise<BedSwapResult> {
    const response = await apiClient.post('/api/inpatient/beds/swap/', data);
    return parseResponse(BedSwapResultSchema, response.data, { context: 'inpatient.swapBeds' });
  },

  // ── MAR Schedule Generation ──

  async generateMARSchedule(data: MARScheduleGenerateData): Promise<MARScheduleGenerateResult> {
    const response = await apiClient.post('/api/inpatient/medication-administrations/generate-schedule/', data);
    return parseResponse(MARScheduleGenerateResultSchema, response.data, { context: 'inpatient.generateMARSchedule' });
  },
};

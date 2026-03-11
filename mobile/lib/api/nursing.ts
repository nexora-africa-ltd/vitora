import { apiClient } from './client';
import {
  FluidBalanceEntrySchema,
  FluidBalanceSheetSchema,
  KardexShiftNoteSchema,
  MedicationAdministrationSchema,
  NursingCarePlanEntrySchema,
  NursingKardexSchema,
  PaginatedFluidBalanceSheetSchema,
  PaginatedMedicationAdministrationSchema,
  PaginatedTemperatureReadingSchema,
  PaginatedWardRoundSchema,
  TemperatureReadingSchema,
  WardRoundSchema,
} from '@/lib/schemas/inpatient.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { PaginatedResponse } from '@/lib/types/common';
import type {
  CarePlanEntryCreateData,
  FluidBalanceEntry,
  FluidBalanceEntryCreateData,
  FluidBalanceSheet,
  KardexShiftNote,
  MARActionData,
  MARListParams,
  MedicationAdministration,
  MedicationAdministrationCreateData,
  NursingCarePlanEntry,
  NursingKardex,
  ShiftNoteCreateData,
  TemperatureReading,
  TemperatureReadingCreateData,
  WardRound,
  WardRoundCreateData,
  WardRoundListParams,
} from '@/lib/types/inpatient';

export const nursingApi = {
  // ── Kardex ──

  async getKardex(admissionId: number): Promise<NursingKardex> {
    const response = await apiClient.get('/api/inpatient/kardex/', {
      params: { admission: admissionId },
    });
    // The API returns a paginated list; get the first (auto-created per admission)
    const list = response.data?.results ?? [response.data];
    const kardex = Array.isArray(list) ? list[0] : response.data;
    return parseResponse(NursingKardexSchema, kardex, { context: 'nursing.getKardex' });
  },

  async addShiftNote(kardexId: number, data: ShiftNoteCreateData): Promise<KardexShiftNote> {
    const response = await apiClient.post(`/api/inpatient/kardex/${kardexId}/add-shift-note/`, data);
    return parseResponse(KardexShiftNoteSchema, response.data, { context: 'nursing.addShiftNote' });
  },

  async addCarePlanEntry(kardexId: number, data: CarePlanEntryCreateData): Promise<NursingCarePlanEntry> {
    const response = await apiClient.post(`/api/inpatient/kardex/${kardexId}/add-care-plan-entry/`, data);
    return parseResponse(NursingCarePlanEntrySchema, response.data, { context: 'nursing.addCarePlanEntry' });
  },

  // ── Ward Rounds ──

  async listWardRounds(params: WardRoundListParams = {}): Promise<PaginatedResponse<WardRound>> {
    const response = await apiClient.get('/api/inpatient/ward-rounds/', { params });
    return parseResponse(PaginatedWardRoundSchema, response.data, { context: 'nursing.listWardRounds' });
  },

  async createWardRound(data: WardRoundCreateData): Promise<WardRound> {
    const response = await apiClient.post('/api/inpatient/ward-rounds/', data);
    return parseResponse(WardRoundSchema, response.data, { context: 'nursing.createWardRound' });
  },

  // ── Temperature / TPR ──

  async listTemperatureReadings(admissionId: number): Promise<PaginatedResponse<TemperatureReading>> {
    const response = await apiClient.get('/api/inpatient/temperature-readings/', {
      params: { admission: admissionId },
    });
    return parseResponse(PaginatedTemperatureReadingSchema, response.data, { context: 'nursing.listTemperatureReadings' });
  },

  async createTemperatureReading(data: TemperatureReadingCreateData): Promise<TemperatureReading> {
    const response = await apiClient.post('/api/inpatient/temperature-readings/', data);
    return parseResponse(TemperatureReadingSchema, response.data, { context: 'nursing.createTemperatureReading' });
  },

  // ── Fluid Balance ──

  async listFluidBalanceSheets(admissionId: number): Promise<PaginatedResponse<FluidBalanceSheet>> {
    const response = await apiClient.get('/api/inpatient/fluid-balance-sheets/', {
      params: { admission: admissionId },
    });
    return parseResponse(PaginatedFluidBalanceSheetSchema, response.data, { context: 'nursing.listFluidBalanceSheets' });
  },

  async getFluidBalanceSheet(id: number): Promise<FluidBalanceSheet> {
    const response = await apiClient.get(`/api/inpatient/fluid-balance-sheets/${id}/`);
    return parseResponse(FluidBalanceSheetSchema, response.data, { context: 'nursing.getFluidBalanceSheet' });
  },

  async createFluidBalanceEntry(data: FluidBalanceEntryCreateData): Promise<FluidBalanceEntry> {
    const response = await apiClient.post('/api/inpatient/fluid-balance-entries/', data);
    return parseResponse(FluidBalanceEntrySchema, response.data, { context: 'nursing.createFluidBalanceEntry' });
  },

  // ── Medication Administration (MAR) ──

  async listMedicationAdministrations(params: MARListParams = {}): Promise<PaginatedResponse<MedicationAdministration>> {
    const response = await apiClient.get('/api/inpatient/medication-administrations/', { params });
    return parseResponse(PaginatedMedicationAdministrationSchema, response.data, { context: 'nursing.listMedicationAdministrations' });
  },

  async createMedicationAdministration(data: MedicationAdministrationCreateData): Promise<MedicationAdministration> {
    const response = await apiClient.post('/api/inpatient/medication-administrations/', data);
    return parseResponse(MedicationAdministrationSchema, response.data, { context: 'nursing.createMedicationAdministration' });
  },

  async recordAdministration(id: number, data: MARActionData): Promise<MedicationAdministration> {
    const response = await apiClient.post(`/api/inpatient/medication-administrations/${id}/record/`, data);
    return parseResponse(MedicationAdministrationSchema, response.data, { context: 'nursing.recordAdministration' });
  },
};

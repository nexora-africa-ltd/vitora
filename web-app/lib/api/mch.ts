/**
 * MCH (Maternal & Child Health) API client.
 *
 * Provides API methods for MCH registrations, ANC visits, deliveries,
 * PNC visits, growth measurements, immunizations, and HEI follow-up.
 *
 * All responses are validated with Zod schemas to catch data shape mismatches
 * at runtime before they cause errors in components.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  MCHRegistrationSchema,
  MCHRegistrationListItemSchema,
  PaginatedMCHRegistrationListSchema,
  ANCVisitSchema,
  ANCVisitListItemSchema,
  PaginatedANCVisitListSchema,
  DeliverySchema,
  DeliveryListItemSchema,
  PaginatedDeliveryListSchema,
  PNCVisitSchema,
  PNCVisitListItemSchema,
  PaginatedPNCVisitListSchema,
  GrowthMeasurementSchema,
  GrowthMeasurementListItemSchema,
  PaginatedGrowthMeasurementListSchema,
  GrowthChartDataSchema,
  VaccineSchema,
  VaccineArraySchema,
  ImmunizationRecordSchema,
  ImmunizationRecordListItemSchema,
  PaginatedImmunizationRecordListSchema,
  VitaminASupplementSchema,
  PaginatedVitaminASupplementListSchema,
  AEFISchema,
  AEFIListItemSchema,
  PaginatedAEFIListSchema,
  HEIFollowUpSchema,
  HEIFollowUpListItemSchema,
  PaginatedHEIFollowUpListSchema,
  HEIPCRTestSchema,
  DetermineStatusResponseSchema,
  UpdateFeedingResponseSchema,
} from '@/lib/schemas/mch.schema';
import type {
  MCHRegistration,
  MCHRegistrationListItem,
  MCHRegistrationCreateData,
  MCHRegistrationListParams,
  ANCVisit,
  ANCVisitListItem,
  ANCVisitCreateData,
  Delivery,
  DeliveryListItem,
  DeliveryCreateData,
  PNCVisit,
  PNCVisitListItem,
  PNCVisitCreateData,
  GrowthMeasurement,
  GrowthMeasurementListItem,
  GrowthMeasurementCreateData,
  GrowthMeasurementListParams,
  GrowthChartData,
  GrowthChartType,
  Vaccine,
  ImmunizationRecord,
  ImmunizationRecordListItem,
  ImmunizationRecordListParams,
  AdministerVaccineData,
  VitaminASupplement,
  AEFI,
  AEFIListItem,
  AEFIReportData,
  HEIFollowUp,
  HEIFollowUpListItem,
  HEIFollowUpCreateData,
  HEIFollowUpListParams,
  HEIPCRTest,
  RecordPCRTestData,
  UpdateFeedingData,
  DetermineStatusResponse,
  UpdateFeedingResponse,
} from '@/lib/types/mch';
import type { PaginatedResponse } from '@/lib/types';

const BASE_URL = '/api/mch';

// =============================================================================
// MCH REGISTRATION API
// =============================================================================

export const mchRegistrationsApi = {
  /**
   * List MCH registrations
   */
  list: async (params?: MCHRegistrationListParams): Promise<PaginatedResponse<MCHRegistrationListItem>> => {
    const response = await apiClient.get<PaginatedResponse<MCHRegistrationListItem>>(
      `${BASE_URL}/registrations/`,
      { params }
    );
    return parseResponse(PaginatedMCHRegistrationListSchema, response.data, {
      context: 'mchRegistrationsApi.list',
    });
  },

  /**
   * Get MCH registration by ID
   */
  get: async (id: number): Promise<MCHRegistration> => {
    const response = await apiClient.get<MCHRegistration>(`${BASE_URL}/registrations/${id}/`);
    return parseResponse(MCHRegistrationSchema, response.data, {
      context: 'mchRegistrationsApi.get',
    });
  },

  /**
   * Create a new MCH registration
   */
  create: async (data: MCHRegistrationCreateData): Promise<MCHRegistration> => {
    const response = await apiClient.post<MCHRegistration>(`${BASE_URL}/registrations/`, data);
    return parseResponse(MCHRegistrationSchema, response.data, {
      context: 'mchRegistrationsApi.create',
    });
  },

  /**
   * Update an MCH registration
   */
  update: async (id: number, data: Partial<MCHRegistrationCreateData>): Promise<MCHRegistration> => {
    const response = await apiClient.patch<MCHRegistration>(`${BASE_URL}/registrations/${id}/`, data);
    return parseResponse(MCHRegistrationSchema, response.data, {
      context: 'mchRegistrationsApi.update',
    });
  },

  /**
   * Delete an MCH registration
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/registrations/${id}/`);
  },

  /**
   * Transition status of an MCH registration
   */
  transitionStatus: async (id: number, newStatus: string): Promise<MCHRegistration> => {
    const response = await apiClient.post<MCHRegistration>(
      `${BASE_URL}/registrations/${id}/transition_status/`,
      { status: newStatus }
    );
    return parseResponse(MCHRegistrationSchema, response.data, {
      context: 'mchRegistrationsApi.transitionStatus',
    });
  },
};

// =============================================================================
// ANC VISIT API
// =============================================================================

export const ancVisitsApi = {
  /**
   * List ANC visits
   */
  list: async (registrationId?: number, page = 1): Promise<PaginatedResponse<ANCVisitListItem>> => {
    const params: Record<string, unknown> = { page };
    if (registrationId) params.registration = registrationId;
    const response = await apiClient.get<PaginatedResponse<ANCVisitListItem>>(
      `${BASE_URL}/anc-visits/`,
      { params }
    );
    return parseResponse(PaginatedANCVisitListSchema, response.data, {
      context: 'ancVisitsApi.list',
    });
  },

  /**
   * Get ANC visit by ID
   */
  get: async (id: number): Promise<ANCVisit> => {
    const response = await apiClient.get<ANCVisit>(`${BASE_URL}/anc-visits/${id}/`);
    return parseResponse(ANCVisitSchema, response.data, {
      context: 'ancVisitsApi.get',
    });
  },

  /**
   * Create a new ANC visit
   */
  create: async (data: ANCVisitCreateData): Promise<ANCVisit> => {
    const response = await apiClient.post<ANCVisit>(`${BASE_URL}/anc-visits/`, data);
    return parseResponse(ANCVisitSchema, response.data, {
      context: 'ancVisitsApi.create',
    });
  },

  /**
   * Update an ANC visit
   */
  update: async (id: number, data: Partial<ANCVisitCreateData>): Promise<ANCVisit> => {
    const response = await apiClient.patch<ANCVisit>(`${BASE_URL}/anc-visits/${id}/`, data);
    return parseResponse(ANCVisitSchema, response.data, {
      context: 'ancVisitsApi.update',
    });
  },

  /**
   * Delete an ANC visit
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/anc-visits/${id}/`);
  },
};

// =============================================================================
// DELIVERY API
// =============================================================================

export const deliveriesApi = {
  /**
   * List deliveries
   */
  list: async (registrationId?: number, page = 1): Promise<PaginatedResponse<DeliveryListItem>> => {
    const params: Record<string, unknown> = { page };
    if (registrationId) params.registration = registrationId;
    const response = await apiClient.get<PaginatedResponse<DeliveryListItem>>(
      `${BASE_URL}/deliveries/`,
      { params }
    );
    return parseResponse(PaginatedDeliveryListSchema, response.data, {
      context: 'deliveriesApi.list',
    });
  },

  /**
   * Get delivery by ID
   */
  get: async (id: number): Promise<Delivery> => {
    const response = await apiClient.get<Delivery>(`${BASE_URL}/deliveries/${id}/`);
    return parseResponse(DeliverySchema, response.data, {
      context: 'deliveriesApi.get',
    });
  },

  /**
   * Create a new delivery
   */
  create: async (data: DeliveryCreateData): Promise<Delivery> => {
    const response = await apiClient.post<Delivery>(`${BASE_URL}/deliveries/`, data);
    return parseResponse(DeliverySchema, response.data, {
      context: 'deliveriesApi.create',
    });
  },

  /**
   * Update a delivery
   */
  update: async (id: number, data: Partial<DeliveryCreateData>): Promise<Delivery> => {
    const response = await apiClient.patch<Delivery>(`${BASE_URL}/deliveries/${id}/`, data);
    return parseResponse(DeliverySchema, response.data, {
      context: 'deliveriesApi.update',
    });
  },

  /**
   * Delete a delivery
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/deliveries/${id}/`);
  },
};

// =============================================================================
// PNC VISIT API
// =============================================================================

export const pncVisitsApi = {
  /**
   * List PNC visits
   */
  list: async (registrationId?: number, page = 1): Promise<PaginatedResponse<PNCVisitListItem>> => {
    const params: Record<string, unknown> = { page };
    if (registrationId) params.registration = registrationId;
    const response = await apiClient.get<PaginatedResponse<PNCVisitListItem>>(
      `${BASE_URL}/pnc-visits/`,
      { params }
    );
    return parseResponse(PaginatedPNCVisitListSchema, response.data, {
      context: 'pncVisitsApi.list',
    });
  },

  /**
   * Get PNC visit by ID
   */
  get: async (id: number): Promise<PNCVisit> => {
    const response = await apiClient.get<PNCVisit>(`${BASE_URL}/pnc-visits/${id}/`);
    return parseResponse(PNCVisitSchema, response.data, {
      context: 'pncVisitsApi.get',
    });
  },

  /**
   * Create a new PNC visit
   */
  create: async (data: PNCVisitCreateData): Promise<PNCVisit> => {
    const response = await apiClient.post<PNCVisit>(`${BASE_URL}/pnc-visits/`, data);
    return parseResponse(PNCVisitSchema, response.data, {
      context: 'pncVisitsApi.create',
    });
  },

  /**
   * Update a PNC visit
   */
  update: async (id: number, data: Partial<PNCVisitCreateData>): Promise<PNCVisit> => {
    const response = await apiClient.patch<PNCVisit>(`${BASE_URL}/pnc-visits/${id}/`, data);
    return parseResponse(PNCVisitSchema, response.data, {
      context: 'pncVisitsApi.update',
    });
  },

  /**
   * Delete a PNC visit
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/pnc-visits/${id}/`);
  },
};

// =============================================================================
// GROWTH MEASUREMENT API
// =============================================================================

export const growthMeasurementsApi = {
  /**
   * List growth measurements
   */
  list: async (params?: GrowthMeasurementListParams): Promise<PaginatedResponse<GrowthMeasurementListItem>> => {
    const response = await apiClient.get<PaginatedResponse<GrowthMeasurementListItem>>(
      `${BASE_URL}/growth-measurements/`,
      { params }
    );
    return parseResponse(PaginatedGrowthMeasurementListSchema, response.data, {
      context: 'growthMeasurementsApi.list',
    });
  },

  /**
   * Get growth measurement by ID
   */
  get: async (id: number): Promise<GrowthMeasurement> => {
    const response = await apiClient.get<GrowthMeasurement>(`${BASE_URL}/growth-measurements/${id}/`);
    return parseResponse(GrowthMeasurementSchema, response.data, {
      context: 'growthMeasurementsApi.get',
    });
  },

  /**
   * Create a new growth measurement
   */
  create: async (data: GrowthMeasurementCreateData): Promise<GrowthMeasurement> => {
    const response = await apiClient.post<GrowthMeasurement>(`${BASE_URL}/growth-measurements/`, data);
    return parseResponse(GrowthMeasurementSchema, response.data, {
      context: 'growthMeasurementsApi.create',
    });
  },

  /**
   * Update a growth measurement
   */
  update: async (id: number, data: Partial<GrowthMeasurementCreateData>): Promise<GrowthMeasurement> => {
    const response = await apiClient.patch<GrowthMeasurement>(
      `${BASE_URL}/growth-measurements/${id}/`,
      data
    );
    return parseResponse(GrowthMeasurementSchema, response.data, {
      context: 'growthMeasurementsApi.update',
    });
  },

  /**
   * Delete a growth measurement
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/growth-measurements/${id}/`);
  },

  /**
   * Get growth chart data for a patient
   */
  getChartData: async (
    patientId: number,
    chartType: GrowthChartType = 'weight_for_age',
    sex?: 'M' | 'F'
  ): Promise<GrowthChartData> => {
    const params: Record<string, unknown> = { patient: patientId, chart_type: chartType };
    if (sex) params.sex = sex;
    const response = await apiClient.get<GrowthChartData>(
      `${BASE_URL}/growth-measurements/chart-data/`,
      { params }
    );
    return parseResponse(GrowthChartDataSchema, response.data, {
      context: 'growthMeasurementsApi.getChartData',
    });
  },

  /**
   * Export growth chart as PDF
   */
  exportPdf: async (patientId: number): Promise<Blob> => {
    const response = await apiClient.get(
      `${BASE_URL}/growth-measurements/export-pdf/`,
      { params: { patient: patientId }, responseType: 'blob' }
    );
    return response.data as Blob;
  },
};

// =============================================================================
// VACCINE API
// =============================================================================

export const vaccinesApi = {
  /**
   * List all vaccines
   */
  list: async (): Promise<Vaccine[]> => {
    const response = await apiClient.get<Vaccine[]>(`${BASE_URL}/vaccines/`);
    return parseResponse(VaccineArraySchema, response.data, {
      context: 'vaccinesApi.list',
    });
  },

  /**
   * Get vaccine by ID
   */
  get: async (id: number): Promise<Vaccine> => {
    const response = await apiClient.get<Vaccine>(`${BASE_URL}/vaccines/${id}/`);
    return parseResponse(VaccineSchema, response.data, {
      context: 'vaccinesApi.get',
    });
  },
};

// =============================================================================
// IMMUNIZATION RECORD API
// =============================================================================

export const immunizationsApi = {
  /**
   * List immunization records
   */
  list: async (params?: ImmunizationRecordListParams): Promise<PaginatedResponse<ImmunizationRecordListItem>> => {
    const response = await apiClient.get<PaginatedResponse<ImmunizationRecordListItem>>(
      `${BASE_URL}/immunizations/`,
      { params }
    );
    return parseResponse(PaginatedImmunizationRecordListSchema, response.data, {
      context: 'immunizationsApi.list',
    });
  },

  /**
   * Get immunization record by ID
   */
  get: async (id: number): Promise<ImmunizationRecord> => {
    const response = await apiClient.get<ImmunizationRecord>(`${BASE_URL}/immunizations/${id}/`);
    return parseResponse(ImmunizationRecordSchema, response.data, {
      context: 'immunizationsApi.get',
    });
  },

  /**
   * Administer a vaccine
   */
  administer: async (id: number, data: AdministerVaccineData): Promise<ImmunizationRecord> => {
    const response = await apiClient.post<ImmunizationRecord>(
      `${BASE_URL}/immunizations/${id}/administer/`,
      data
    );
    return parseResponse(ImmunizationRecordSchema, response.data, {
      context: 'immunizationsApi.administer',
    });
  },

  /**
   * Generate immunization schedule for a patient
   */
  generateSchedule: async (patientId: number): Promise<ImmunizationRecordListItem[]> => {
    const response = await apiClient.post<ImmunizationRecordListItem[]>(
      `${BASE_URL}/immunizations/generate-schedule/`,
      { patient: patientId }
    );
    // Backend returns serialized array directly (not wrapped in { records: [...] })
    return response.data;
  },

  /**
   * Report AEFI for an immunization
   */
  reportAEFI: async (id: number, data: AEFIReportData): Promise<AEFI> => {
    const response = await apiClient.post<AEFI>(
      `${BASE_URL}/immunizations/${id}/report-aefi/`,
      data
    );
    return parseResponse(AEFISchema, response.data, {
      context: 'immunizationsApi.reportAEFI',
    });
  },
};

// =============================================================================
// VITAMIN A SUPPLEMENT API
// =============================================================================

export const vitaminAApi = {
  /**
   * List vitamin A supplements
   */
  list: async (patientId?: number, page = 1): Promise<PaginatedResponse<VitaminASupplement>> => {
    const params: Record<string, unknown> = { page };
    if (patientId) params.patient = patientId;
    const response = await apiClient.get<PaginatedResponse<VitaminASupplement>>(
      `${BASE_URL}/vitamin-a/`,
      { params }
    );
    return parseResponse(PaginatedVitaminASupplementListSchema, response.data, {
      context: 'vitaminAApi.list',
    });
  },

  /**
   * Get vitamin A supplement by ID
   */
  get: async (id: number): Promise<VitaminASupplement> => {
    const response = await apiClient.get<VitaminASupplement>(`${BASE_URL}/vitamin-a/${id}/`);
    return parseResponse(VitaminASupplementSchema, response.data, {
      context: 'vitaminAApi.get',
    });
  },

  /**
   * Create a new vitamin A supplement record
   */
  create: async (data: {
    patient: number;
    administered_date?: string;
    dose: string;
    notes?: string;
  }): Promise<VitaminASupplement> => {
    const response = await apiClient.post<VitaminASupplement>(`${BASE_URL}/vitamin-a/`, data);
    return parseResponse(VitaminASupplementSchema, response.data, {
      context: 'vitaminAApi.create',
    });
  },
};

// =============================================================================
// AEFI API
// =============================================================================

export const aefiApi = {
  /**
   * List AEFI reports
   */
  list: async (page = 1): Promise<PaginatedResponse<AEFIListItem>> => {
    const response = await apiClient.get<PaginatedResponse<AEFIListItem>>(
      `${BASE_URL}/aefi/`,
      { params: { page } }
    );
    return parseResponse(PaginatedAEFIListSchema, response.data, {
      context: 'aefiApi.list',
    });
  },

  /**
   * Get AEFI report by ID
   */
  get: async (id: number): Promise<AEFI> => {
    const response = await apiClient.get<AEFI>(`${BASE_URL}/aefi/${id}/`);
    return parseResponse(AEFISchema, response.data, {
      context: 'aefiApi.get',
    });
  },

  /**
   * Update an AEFI report
   */
  update: async (id: number, data: Partial<AEFI>): Promise<AEFI> => {
    const response = await apiClient.patch<AEFI>(`${BASE_URL}/aefi/${id}/`, data);
    return parseResponse(AEFISchema, response.data, {
      context: 'aefiApi.update',
    });
  },
};

// =============================================================================
// HEI FOLLOW-UP API
// =============================================================================

export const heiFollowUpApi = {
  /**
   * List HEI follow-ups
   */
  list: async (params?: HEIFollowUpListParams): Promise<PaginatedResponse<HEIFollowUpListItem>> => {
    const response = await apiClient.get<PaginatedResponse<HEIFollowUpListItem>>(
      `${BASE_URL}/hei/`,
      { params }
    );
    return parseResponse(PaginatedHEIFollowUpListSchema, response.data, {
      context: 'heiFollowUpApi.list',
    });
  },

  /**
   * Get HEI follow-up by ID
   */
  get: async (id: number): Promise<HEIFollowUp> => {
    const response = await apiClient.get<HEIFollowUp>(`${BASE_URL}/hei/${id}/`);
    return parseResponse(HEIFollowUpSchema, response.data, {
      context: 'heiFollowUpApi.get',
    });
  },

  /**
   * Create a new HEI follow-up
   */
  create: async (data: HEIFollowUpCreateData): Promise<HEIFollowUp> => {
    const response = await apiClient.post<HEIFollowUp>(`${BASE_URL}/hei/`, data);
    return parseResponse(HEIFollowUpSchema, response.data, {
      context: 'heiFollowUpApi.create',
    });
  },

  /**
   * Update an HEI follow-up
   */
  update: async (id: number, data: Partial<HEIFollowUpCreateData>): Promise<HEIFollowUp> => {
    const response = await apiClient.patch<HEIFollowUp>(`${BASE_URL}/hei/${id}/`, data);
    return parseResponse(HEIFollowUpSchema, response.data, {
      context: 'heiFollowUpApi.update',
    });
  },

  /**
   * Record a PCR test result.
   * Uses the dedicated hei-pcr ViewSet (not an action on HEIFollowUpViewSet).
   */
  recordPCR: async (data: RecordPCRTestData): Promise<HEIPCRTest> => {
    const response = await apiClient.post<HEIPCRTest>(
      `${BASE_URL}/hei-pcr/`,
      data
    );
    return parseResponse(HEIPCRTestSchema, response.data, {
      context: 'heiFollowUpApi.recordPCR',
    });
  },

  /**
   * Update feeding status
   */
  updateFeeding: async (id: number, data: UpdateFeedingData): Promise<UpdateFeedingResponse> => {
    const response = await apiClient.post<UpdateFeedingResponse>(
      `${BASE_URL}/hei/${id}/update_feeding/`,
      data
    );
    return parseResponse(UpdateFeedingResponseSchema, response.data, {
      context: 'heiFollowUpApi.updateFeeding',
    });
  },

  /**
   * Determine final status
   */
  determineStatus: async (id: number): Promise<DetermineStatusResponse> => {
    const response = await apiClient.post<DetermineStatusResponse>(
      `${BASE_URL}/hei/${id}/determine_final_status/`
    );
    return parseResponse(DetermineStatusResponseSchema, response.data, {
      context: 'heiFollowUpApi.determineStatus',
    });
  },
};

// =============================================================================
// COMBINED MCH API EXPORT
// =============================================================================

export const mchApi = {
  registrations: mchRegistrationsApi,
  ancVisits: ancVisitsApi,
  deliveries: deliveriesApi,
  pncVisits: pncVisitsApi,
  growthMeasurements: growthMeasurementsApi,
  vaccines: vaccinesApi,
  immunizations: immunizationsApi,
  vitaminA: vitaminAApi,
  aefi: aefiApi,
  hei: heiFollowUpApi,
};

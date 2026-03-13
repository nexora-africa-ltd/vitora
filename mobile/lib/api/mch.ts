import { apiClient } from './client';

import {
  ANCVisitSchema,
  ImmunizationRecordSchema,
  MCHRegistrationSchema,
  PaginatedANCVisitSchema,
  PaginatedImmunizationRecordSchema,
  PaginatedMCHRegistrationSchema,
  VaccineArraySchema,
} from '@/lib/schemas/mch.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  AdministerVaccineData,
  ANCVisit,
  ANCVisitCreateData,
  PaginatedANCVisitResponse,
  PaginatedImmunizationResponse,
  PaginatedMCHRegistrationResponse,
  ImmunizationRecord,
  ImmunizationRecordListItem,
  ImmunizationRecordListParams,
  MCHRegistration,
  MCHRegistrationListParams,
  Vaccine,
} from '@/lib/types/mch';

const BASE_URL = '/api/mch';

export const mchRegistrationsApi = {
  async list(params: MCHRegistrationListParams = {}): Promise<PaginatedMCHRegistrationResponse> {
    const response = await apiClient.get(`${BASE_URL}/registrations/`, { params });
    return parseResponse(PaginatedMCHRegistrationSchema, response.data, { context: 'mchRegistrationsApi.list' });
  },

  async get(id: number): Promise<MCHRegistration> {
    const response = await apiClient.get(`${BASE_URL}/registrations/${id}/`);
    return parseResponse(MCHRegistrationSchema, response.data, { context: 'mchRegistrationsApi.get' });
  },
};

export const ancVisitsApi = {
  async list(params: { registration?: number; page?: number; page_size?: number } = {}): Promise<PaginatedANCVisitResponse> {
    const response = await apiClient.get(`${BASE_URL}/anc-visits/`, { params });
    return parseResponse(PaginatedANCVisitSchema, response.data, { context: 'ancVisitsApi.list' });
  },

  async get(id: number): Promise<ANCVisit> {
    const response = await apiClient.get(`${BASE_URL}/anc-visits/${id}/`);
    return parseResponse(ANCVisitSchema, response.data, { context: 'ancVisitsApi.get' });
  },

  async create(data: ANCVisitCreateData): Promise<ANCVisit> {
    const response = await apiClient.post(`${BASE_URL}/anc-visits/`, data);
    return parseResponse(ANCVisitSchema, response.data, { context: 'ancVisitsApi.create' });
  },
};

export const vaccinesApi = {
  async list(): Promise<Vaccine[]> {
    const response = await apiClient.get(`${BASE_URL}/vaccines/`);
    return parseResponse(VaccineArraySchema, response.data, { context: 'vaccinesApi.list' });
  },
};

export const immunizationsApi = {
  async list(params: ImmunizationRecordListParams = {}): Promise<PaginatedImmunizationResponse> {
    const response = await apiClient.get(`${BASE_URL}/immunizations/`, { params });
    return parseResponse(PaginatedImmunizationRecordSchema, response.data, { context: 'immunizationsApi.list' });
  },

  async get(id: number): Promise<ImmunizationRecord> {
    const response = await apiClient.get(`${BASE_URL}/immunizations/${id}/`);
    return parseResponse(ImmunizationRecordSchema, response.data, { context: 'immunizationsApi.get' });
  },

  async administer(id: number, data: AdministerVaccineData): Promise<ImmunizationRecord> {
    const response = await apiClient.post(`${BASE_URL}/immunizations/${id}/administer/`, data);
    return parseResponse(ImmunizationRecordSchema, response.data, { context: 'immunizationsApi.administer' });
  },

  async generateSchedule(patientId: number): Promise<ImmunizationRecordListItem[]> {
    const response = await apiClient.post(`${BASE_URL}/immunizations/generate-schedule/`, { patient: patientId });
    return parseResponse(PaginatedImmunizationRecordSchema.shape.results, response.data, { context: 'immunizationsApi.generateSchedule' });
  },
};
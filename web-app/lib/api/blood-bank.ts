/**
 * Blood Bank API client
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import type {
  BloodDonor,
  BloodDonorListItem,
  BloodDonorCreateData,
  BloodDonorListParams,
  BloodUnit,
  BloodUnitListItem,
  BloodUnitCreateData,
  BloodUnitTransitionData,
  BloodUnitListParams,
  BloodRequest,
  BloodRequestListItem,
  BloodRequestCreateData,
  BloodRequestListParams,
  CrossMatch,
  CrossMatchCreateData,
  BloodIssue,
  BloodIssueCreateData,
} from '@/lib/types/blood-bank';
import type { PaginatedResponse } from '@/lib/types';

const BloodGroupSchema = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const BloodComponentSchema = z.enum(['WHOLE_BLOOD', 'PACKED_RBC', 'PLATELETS', 'FFP', 'CRYOPRECIPITATE']);
const UnitStatusSchema = z.enum(['COLLECTED', 'TESTING', 'AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED', 'QUARANTINED']);
const RequestStatusSchema = z.enum(['PENDING', 'CROSSMATCH_PENDING', 'READY', 'ISSUED', 'TRANSFUSED', 'CANCELLED', 'RETURNED']);
const RequestUrgencySchema = z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']);
const CrossMatchResultSchema = z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'PENDING']);

const BloodDonorSchema = z.object({
  id: z.number(),
  donor_number: z.string(),
  patient: z.number().nullable(),
  first_name: z.string(),
  last_name: z.string(),
  date_of_birth: z.string(),
  gender: z.enum(['M', 'F']),
  blood_group: BloodGroupSchema,
  phone_number: z.string(),
  national_id: z.string(),
  is_active: z.boolean(),
  last_donation_date: z.string().nullable(),
  total_donations: z.number(),
  eligible_to_donate: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const BloodDonorListItemSchema = z.object({
  id: z.number(),
  donor_number: z.string(),
  patient: z.number().nullable().optional(),
  first_name: z.string(),
  last_name: z.string(),
  blood_group: BloodGroupSchema,
  gender: z.enum(['M', 'F']),
  is_active: z.boolean(),
  last_donation_date: z.string().nullable(),
  total_donations: z.number(),
  eligible_to_donate: z.boolean(),
  created_at: z.string(),
});

const BloodUnitStatusEventSchema = z.object({
  id: z.number(),
  blood_unit: z.number(),
  from_status: UnitStatusSchema,
  to_status: UnitStatusSchema,
  reason: z.string(),
  source: z.enum(['MANUAL', 'AUTOMATED', 'SYSTEM']),
  changed_by: z.number().nullable(),
  changed_by_name: z.string().nullable(),
  changed_at: z.string(),
});

const BloodUnitSchema = z.object({
  id: z.number(),
  unit_number: z.string(),
  donor: z.number(),
  donor_name: z.string(),
  blood_group: BloodGroupSchema,
  component: BloodComponentSchema,
  status: UnitStatusSchema,
  collection_date: z.string(),
  expiry_date: z.string(),
  volume_ml: z.number(),
  storage_location: z.string(),
  hiv_screened: z.boolean(),
  hbv_screened: z.boolean(),
  hcv_screened: z.boolean(),
  syphilis_screened: z.boolean(),
  malaria_screened: z.boolean(),
  all_screens_negative: z.boolean(),
  is_expired: z.boolean(),
  is_available: z.boolean(),
  allowed_next_statuses: z.array(UnitStatusSchema),
  status_reason: z.string(),
  last_status_change_at: z.string().nullable(),
  last_status_changed_by: z.number().nullable(),
  last_status_changed_by_name: z.string().nullable(),
  status_timeline: z.array(BloodUnitStatusEventSchema),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const BloodUnitListItemSchema = z.object({
  id: z.number(),
  unit_number: z.string(),
  donor: z.number(),
  donor_name: z.string(),
  blood_group: BloodGroupSchema,
  component: BloodComponentSchema,
  status: UnitStatusSchema,
  collection_date: z.string(),
  expiry_date: z.string(),
  volume_ml: z.number(),
  is_expired: z.boolean(),
  is_available: z.boolean(),
  all_screens_negative: z.boolean(),
  created_at: z.string(),
});

const BloodRequestSchema = z.object({
  id: z.number(),
  request_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  requested_by: z.number(),
  requested_by_name: z.string(),
  blood_group: BloodGroupSchema,
  component: BloodComponentSchema,
  units_requested: z.number(),
  urgency: RequestUrgencySchema,
  status: RequestStatusSchema,
  clinical_indication: z.string(),
  patient_hemoglobin: z.number().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const BloodRequestListItemSchema = z.object({
  id: z.number(),
  request_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  blood_group: BloodGroupSchema,
  component: BloodComponentSchema,
  units_requested: z.number(),
  urgency: RequestUrgencySchema,
  status: RequestStatusSchema,
  requested_by_name: z.string(),
  created_at: z.string(),
});

const CrossMatchSchema = z.object({
  id: z.number(),
  blood_request: z.number(),
  blood_unit: z.number(),
  unit_number: z.string(),
  performed_by: z.number(),
  performed_by_name: z.string(),
  result: CrossMatchResultSchema,
  performed_at: z.string(),
  method: z.string(),
  notes: z.string(),
});

const BloodIssueSchema = z.object({
  id: z.number(),
  blood_request: z.number(),
  blood_unit: z.number(),
  unit_number: z.string(),
  crossmatch: z.number().nullable(),
  issued_by: z.number(),
  issued_by_name: z.string(),
  issued_at: z.string(),
  transfusion_started_at: z.string().nullable(),
  transfusion_completed_at: z.string().nullable(),
  transfusion_reaction: z.string(),
  reaction_details: z.string(),
  vital_signs_pre: z.record(z.unknown()),
  vital_signs_post: z.record(z.unknown()),
  notes: z.string(),
});

function paginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

const PaginatedBloodDonorSchema = paginatedSchema(BloodDonorListItemSchema);
const PaginatedBloodUnitSchema = paginatedSchema(BloodUnitListItemSchema);
const PaginatedBloodRequestSchema = paginatedSchema(BloodRequestListItemSchema);
const PaginatedCrossMatchSchema = paginatedSchema(CrossMatchSchema);
const PaginatedBloodIssueSchema = paginatedSchema(BloodIssueSchema);

function buildParams<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export const bloodBankApi = {
  // Donors
  async listDonors(params: BloodDonorListParams = {}): Promise<PaginatedResponse<BloodDonorListItem>> {
    const response = await apiClient.get(`/api/blood-bank/donors/${buildParams(params)}`);
    return parseResponse(PaginatedBloodDonorSchema, response.data, { context: 'bloodBankApi.listDonors' });
  },

  async getDonor(id: number): Promise<BloodDonor> {
    const response = await apiClient.get(`/api/blood-bank/donors/${id}/`);
    return parseResponse(BloodDonorSchema, response.data, { context: 'bloodBankApi.getDonor' });
  },

  async createDonor(data: BloodDonorCreateData): Promise<BloodDonor> {
    const response = await apiClient.post('/api/blood-bank/donors/', data);
    return parseResponse(BloodDonorSchema, response.data, { context: 'bloodBankApi.createDonor' });
  },

  async updateDonor(id: number, data: Partial<BloodDonorCreateData>): Promise<BloodDonor> {
    const response = await apiClient.patch(`/api/blood-bank/donors/${id}/`, data);
    return parseResponse(BloodDonorSchema, response.data, { context: 'bloodBankApi.updateDonor' });
  },

  // Units
  async listUnits(params: BloodUnitListParams = {}): Promise<PaginatedResponse<BloodUnitListItem>> {
    const response = await apiClient.get(`/api/blood-bank/units/${buildParams(params)}`);
    return parseResponse(PaginatedBloodUnitSchema, response.data, { context: 'bloodBankApi.listUnits' });
  },

  async getUnit(id: number): Promise<BloodUnit> {
    const response = await apiClient.get(`/api/blood-bank/units/${id}/`);
    return parseResponse(BloodUnitSchema, response.data, { context: 'bloodBankApi.getUnit' });
  },

  async createUnit(data: BloodUnitCreateData): Promise<BloodUnit> {
    const response = await apiClient.post('/api/blood-bank/units/', data);
    return parseResponse(BloodUnitSchema, response.data, { context: 'bloodBankApi.createUnit' });
  },

  async updateUnit(id: number, data: Partial<BloodUnitCreateData & { status: string }>): Promise<BloodUnit> {
    const response = await apiClient.patch(`/api/blood-bank/units/${id}/`, data);
    return parseResponse(BloodUnitSchema, response.data, { context: 'bloodBankApi.updateUnit' });
  },

  async markAvailable(id: number): Promise<BloodUnit> {
    const response = await apiClient.post(`/api/blood-bank/units/${id}/mark_available/`);
    return parseResponse(BloodUnitSchema, response.data, { context: 'bloodBankApi.markAvailable' });
  },

  async quarantine(id: number, reason: string): Promise<BloodUnit> {
    const response = await apiClient.post(`/api/blood-bank/units/${id}/quarantine/`, { reason });
    return parseResponse(BloodUnitSchema, response.data, { context: 'bloodBankApi.quarantine' });
  },

  async transitionUnit(id: number, data: BloodUnitTransitionData): Promise<BloodUnit> {
    const response = await apiClient.post(`/api/blood-bank/units/${id}/transition/`, data);
    return parseResponse(BloodUnitSchema, response.data, { context: 'bloodBankApi.transitionUnit' });
  },

  // Requests
  async listRequests(params: BloodRequestListParams = {}): Promise<PaginatedResponse<BloodRequestListItem>> {
    const response = await apiClient.get(`/api/blood-bank/requests/${buildParams(params)}`);
    return parseResponse(PaginatedBloodRequestSchema, response.data, { context: 'bloodBankApi.listRequests' });
  },

  async getRequest(id: number): Promise<BloodRequest> {
    const response = await apiClient.get(`/api/blood-bank/requests/${id}/`);
    return parseResponse(BloodRequestSchema, response.data, { context: 'bloodBankApi.getRequest' });
  },

  async createRequest(data: BloodRequestCreateData): Promise<BloodRequest> {
    const response = await apiClient.post('/api/blood-bank/requests/', data);
    return parseResponse(BloodRequestSchema, response.data, { context: 'bloodBankApi.createRequest' });
  },

  async cancelRequest(id: number, reason: string): Promise<BloodRequest> {
    const response = await apiClient.post(`/api/blood-bank/requests/${id}/cancel/`, { reason });
    return parseResponse(BloodRequestSchema, response.data, { context: 'bloodBankApi.cancelRequest' });
  },

  // Cross-Match
  async listCrossMatches(requestId?: number): Promise<PaginatedResponse<CrossMatch>> {
    const params = requestId ? `?blood_request=${requestId}` : '';
    const response = await apiClient.get(`/api/blood-bank/crossmatches/${params}`);
    return parseResponse(PaginatedCrossMatchSchema, response.data, { context: 'bloodBankApi.listCrossMatches' });
  },

  async createCrossMatch(data: CrossMatchCreateData): Promise<CrossMatch> {
    const response = await apiClient.post('/api/blood-bank/crossmatches/', data);
    return parseResponse(CrossMatchSchema, response.data, { context: 'bloodBankApi.createCrossMatch' });
  },

  async getCrossMatch(id: number): Promise<CrossMatch> {
    const response = await apiClient.get(`/api/blood-bank/crossmatches/${id}/`);
    return parseResponse(CrossMatchSchema, response.data, { context: 'bloodBankApi.getCrossMatch' });
  },

  async recordResult(id: number, result: 'COMPATIBLE' | 'INCOMPATIBLE'): Promise<CrossMatch> {
    const response = await apiClient.post(`/api/blood-bank/crossmatches/${id}/record_result/`, { result });
    return parseResponse(CrossMatchSchema, response.data, { context: 'bloodBankApi.recordResult' });
  },

  // Issues
  async listIssues(): Promise<PaginatedResponse<BloodIssue>> {
    const response = await apiClient.get('/api/blood-bank/issues/');
    return parseResponse(PaginatedBloodIssueSchema, response.data, { context: 'bloodBankApi.listIssues' });
  },

  async createIssue(data: BloodIssueCreateData): Promise<BloodIssue> {
    const response = await apiClient.post('/api/blood-bank/issues/', data);
    return parseResponse(BloodIssueSchema, response.data, { context: 'bloodBankApi.createIssue' });
  },

  async completeTransfusion(id: number, reaction: string, details: string): Promise<BloodIssue> {
    const response = await apiClient.post(`/api/blood-bank/issues/${id}/complete-transfusion/`, {
      reaction,
      details,
    });
    return parseResponse(BloodIssueSchema, response.data, { context: 'bloodBankApi.completeTransfusion' });
  },
};

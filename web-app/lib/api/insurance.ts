/**
 * API client for the Insurance module.
 *
 * All responses are validated with Zod schemas via parseResponse().
 */
import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  InsuranceClaimSchema,
  InsurancePlanSchema,
  InsurancePreauthSchema,
  InsuranceProviderConfigSchema,
  InsuranceProviderSchema,
  InsuranceRemittanceSchema,
  PaginatedInsuranceClaimsSchema,
  PaginatedInsurancePlansSchema,
  PaginatedInsurancePreauthsSchema,
  PaginatedInsuranceRemittancesSchema,
  PaginatedPatientInsurancesSchema,
  PaginatedPayerTariffsSchema,
  PaginatedProviderConfigsSchema,
  PaginatedInsuranceProvidersSchema,
  PatientInsuranceSchema,
  PayerTariffSchema,
} from '@/lib/schemas/insurance.schema';
import type {
  InsuranceClaim,
  InsuranceClaimCreateInput,
  InsuranceClaimFilters,
  InsurancePlan,
  InsurancePlanCreateInput,
  InsurancePreauth,
  InsurancePreauthCreateInput,
  InsurancePreauthFilters,
  InsuranceProvider,
  InsuranceProviderConfig,
  InsuranceProviderCreateInput,
  InsuranceRemittance,
  InsuranceRemittanceCreateInput,
  PaginatedInsuranceResponse,
  PatientInsurance,
  PatientInsuranceCreateInput,
  PayerTariff,
  PayerTariffCreateInput,
} from '@/lib/types/insurance';

const BASE = '/api/insurance';

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function listProviders(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<InsuranceProvider>> {
  const response = await apiClient.get(`${BASE}/providers/`, { params });
  return parseResponse(PaginatedInsuranceProvidersSchema, response.data, {
    context: 'insuranceApi.listProviders',
  });
}

async function getProvider(id: number): Promise<InsuranceProvider> {
  const response = await apiClient.get(`${BASE}/providers/${id}/`);
  return parseResponse(InsuranceProviderSchema, response.data, {
    context: 'insuranceApi.getProvider',
  });
}

async function createProvider(data: InsuranceProviderCreateInput): Promise<InsuranceProvider> {
  const response = await apiClient.post(`${BASE}/providers/`, data);
  return parseResponse(InsuranceProviderSchema, response.data, {
    context: 'insuranceApi.createProvider',
  });
}

async function updateProvider(
  id: number,
  data: Partial<InsuranceProviderCreateInput>
): Promise<InsuranceProvider> {
  const response = await apiClient.patch(`${BASE}/providers/${id}/`, data);
  return parseResponse(InsuranceProviderSchema, response.data, {
    context: 'insuranceApi.updateProvider',
  });
}

async function deleteProvider(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/providers/${id}/`);
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

async function listPlans(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<InsurancePlan>> {
  const response = await apiClient.get(`${BASE}/plans/`, { params });
  return parseResponse(PaginatedInsurancePlansSchema, response.data, {
    context: 'insuranceApi.listPlans',
  });
}

async function getPlan(id: number): Promise<InsurancePlan> {
  const response = await apiClient.get(`${BASE}/plans/${id}/`);
  return parseResponse(InsurancePlanSchema, response.data, {
    context: 'insuranceApi.getPlan',
  });
}

async function createPlan(data: InsurancePlanCreateInput): Promise<InsurancePlan> {
  const response = await apiClient.post(`${BASE}/plans/`, data);
  return parseResponse(InsurancePlanSchema, response.data, {
    context: 'insuranceApi.createPlan',
  });
}

async function updatePlan(
  id: number,
  data: Partial<InsurancePlanCreateInput>
): Promise<InsurancePlan> {
  const response = await apiClient.patch(`${BASE}/plans/${id}/`, data);
  return parseResponse(InsurancePlanSchema, response.data, {
    context: 'insuranceApi.updatePlan',
  });
}

async function deletePlan(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/plans/${id}/`);
}

// ---------------------------------------------------------------------------
// Patient Insurance (Enrollments)
// ---------------------------------------------------------------------------

async function listEnrollments(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<PatientInsurance>> {
  const response = await apiClient.get(`${BASE}/enrollments/`, { params });
  return parseResponse(PaginatedPatientInsurancesSchema, response.data, {
    context: 'insuranceApi.listEnrollments',
  });
}

async function getEnrollment(id: number): Promise<PatientInsurance> {
  const response = await apiClient.get(`${BASE}/enrollments/${id}/`);
  return parseResponse(PatientInsuranceSchema, response.data, {
    context: 'insuranceApi.getEnrollment',
  });
}

async function createEnrollment(data: PatientInsuranceCreateInput): Promise<PatientInsurance> {
  const response = await apiClient.post(`${BASE}/enrollments/`, data);
  return parseResponse(PatientInsuranceSchema, response.data, {
    context: 'insuranceApi.createEnrollment',
  });
}

async function updateEnrollment(
  id: number,
  data: Partial<PatientInsuranceCreateInput>
): Promise<PatientInsurance> {
  const response = await apiClient.patch(`${BASE}/enrollments/${id}/`, data);
  return parseResponse(PatientInsuranceSchema, response.data, {
    context: 'insuranceApi.updateEnrollment',
  });
}

async function deleteEnrollment(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/enrollments/${id}/`);
}

// ---------------------------------------------------------------------------
// Provider Configs (per-facility)
// ---------------------------------------------------------------------------

async function listProviderConfigs(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<InsuranceProviderConfig>> {
  const response = await apiClient.get(`${BASE}/provider-configs/`, { params });
  return parseResponse(PaginatedProviderConfigsSchema, response.data, {
    context: 'insuranceApi.listProviderConfigs',
  });
}

async function getProviderConfig(id: number): Promise<InsuranceProviderConfig> {
  const response = await apiClient.get(`${BASE}/provider-configs/${id}/`);
  return parseResponse(InsuranceProviderConfigSchema, response.data, {
    context: 'insuranceApi.getProviderConfig',
  });
}

async function createProviderConfig(
  data: Record<string, unknown>
): Promise<InsuranceProviderConfig> {
  const response = await apiClient.post(`${BASE}/provider-configs/`, data);
  return parseResponse(InsuranceProviderConfigSchema, response.data, {
    context: 'insuranceApi.createProviderConfig',
  });
}

async function updateProviderConfig(
  id: number,
  data: Record<string, unknown>
): Promise<InsuranceProviderConfig> {
  const response = await apiClient.patch(`${BASE}/provider-configs/${id}/`, data);
  return parseResponse(InsuranceProviderConfigSchema, response.data, {
    context: 'insuranceApi.updateProviderConfig',
  });
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

async function listClaims(
  filters?: InsuranceClaimFilters
): Promise<PaginatedInsuranceResponse<InsuranceClaim>> {
  const response = await apiClient.get(`${BASE}/claims/`, { params: filters });
  return parseResponse(PaginatedInsuranceClaimsSchema, response.data, {
    context: 'insuranceApi.listClaims',
  });
}

async function getClaim(id: number): Promise<InsuranceClaim> {
  const response = await apiClient.get(`${BASE}/claims/${id}/`);
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.getClaim',
  });
}

async function createClaim(data: InsuranceClaimCreateInput): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/`, data);
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.createClaim',
  });
}

async function submitClaim(id: number): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/submit/`);
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.submitClaim',
  });
}

async function approveClaim(id: number, approved_amount: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/approve/`, { approved_amount });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.approveClaim',
  });
}

async function rejectClaim(id: number, reason: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/reject/`, { reason });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.rejectClaim',
  });
}

async function queryClaim(id: number, details: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/query_claim/`, { details });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.queryClaim',
  });
}

async function respondToQuery(id: number, queryResponse: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/respond_to_query/`, {
    response: queryResponse,
  });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.respondToQuery',
  });
}

async function markClaimPaid(id: number, paid_amount: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/mark_paid/`, { paid_amount });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.markClaimPaid',
  });
}

async function appealClaim(id: number, notes?: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/appeal/`, { notes: notes || '' });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.appealClaim',
  });
}

async function cancelClaim(id: number, reason?: string): Promise<InsuranceClaim> {
  const response = await apiClient.post(`${BASE}/claims/${id}/cancel/`, {
    reason: reason || '',
  });
  return parseResponse(InsuranceClaimSchema, response.data, {
    context: 'insuranceApi.cancelClaim',
  });
}

// ---------------------------------------------------------------------------
// Pre-authorizations
// ---------------------------------------------------------------------------

async function listPreauths(
  filters?: InsurancePreauthFilters
): Promise<PaginatedInsuranceResponse<InsurancePreauth>> {
  const response = await apiClient.get(`${BASE}/preauths/`, { params: filters });
  return parseResponse(PaginatedInsurancePreauthsSchema, response.data, {
    context: 'insuranceApi.listPreauths',
  });
}

async function getPreauth(id: number): Promise<InsurancePreauth> {
  const response = await apiClient.get(`${BASE}/preauths/${id}/`);
  return parseResponse(InsurancePreauthSchema, response.data, {
    context: 'insuranceApi.getPreauth',
  });
}

async function createPreauth(data: InsurancePreauthCreateInput): Promise<InsurancePreauth> {
  const response = await apiClient.post(`${BASE}/preauths/`, data);
  return parseResponse(InsurancePreauthSchema, response.data, {
    context: 'insuranceApi.createPreauth',
  });
}

async function submitPreauth(id: number): Promise<InsurancePreauth> {
  const response = await apiClient.post(`${BASE}/preauths/${id}/submit/`);
  return parseResponse(InsurancePreauthSchema, response.data, {
    context: 'insuranceApi.submitPreauth',
  });
}

async function approvePreauth(
  id: number,
  approved_amount: string,
  validity_days?: number
): Promise<InsurancePreauth> {
  const response = await apiClient.post(`${BASE}/preauths/${id}/approve/`, {
    approved_amount,
    validity_days: validity_days ?? 30,
  });
  return parseResponse(InsurancePreauthSchema, response.data, {
    context: 'insuranceApi.approvePreauth',
  });
}

async function denyPreauth(id: number, reason: string): Promise<InsurancePreauth> {
  const response = await apiClient.post(`${BASE}/preauths/${id}/deny/`, { reason });
  return parseResponse(InsurancePreauthSchema, response.data, {
    context: 'insuranceApi.denyPreauth',
  });
}

async function cancelPreauth(id: number, reason?: string): Promise<InsurancePreauth> {
  const response = await apiClient.post(`${BASE}/preauths/${id}/cancel/`, {
    reason: reason || '',
  });
  return parseResponse(InsurancePreauthSchema, response.data, {
    context: 'insuranceApi.cancelPreauth',
  });
}

// ---------------------------------------------------------------------------
// Remittances
// ---------------------------------------------------------------------------

async function listRemittances(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<InsuranceRemittance>> {
  const response = await apiClient.get(`${BASE}/remittances/`, { params });
  return parseResponse(PaginatedInsuranceRemittancesSchema, response.data, {
    context: 'insuranceApi.listRemittances',
  });
}

async function getRemittance(id: number): Promise<InsuranceRemittance> {
  const response = await apiClient.get(`${BASE}/remittances/${id}/`);
  return parseResponse(InsuranceRemittanceSchema, response.data, {
    context: 'insuranceApi.getRemittance',
  });
}

async function createRemittance(
  data: InsuranceRemittanceCreateInput
): Promise<InsuranceRemittance> {
  const response = await apiClient.post(`${BASE}/remittances/`, data);
  return parseResponse(InsuranceRemittanceSchema, response.data, {
    context: 'insuranceApi.createRemittance',
  });
}

async function reconcileRemittance(id: number): Promise<InsuranceRemittance> {
  const response = await apiClient.post(`${BASE}/remittances/${id}/reconcile/`);
  return parseResponse(InsuranceRemittanceSchema, response.data, {
    context: 'insuranceApi.reconcileRemittance',
  });
}

// ---------------------------------------------------------------------------
// Tariffs
// ---------------------------------------------------------------------------

async function listTariffs(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<PayerTariff>> {
  const response = await apiClient.get(`${BASE}/tariffs/`, { params });
  return parseResponse(PaginatedPayerTariffsSchema, response.data, {
    context: 'insuranceApi.listTariffs',
  });
}

async function getTariff(id: number): Promise<PayerTariff> {
  const response = await apiClient.get(`${BASE}/tariffs/${id}/`);
  return parseResponse(PayerTariffSchema, response.data, {
    context: 'insuranceApi.getTariff',
  });
}

async function createTariff(data: PayerTariffCreateInput): Promise<PayerTariff> {
  const response = await apiClient.post(`${BASE}/tariffs/`, data);
  return parseResponse(PayerTariffSchema, response.data, {
    context: 'insuranceApi.createTariff',
  });
}

async function updateTariff(
  id: number,
  data: Partial<PayerTariffCreateInput>
): Promise<PayerTariff> {
  const response = await apiClient.patch(`${BASE}/tariffs/${id}/`, data);
  return parseResponse(PayerTariffSchema, response.data, {
    context: 'insuranceApi.updateTariff',
  });
}

async function deleteTariff(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/tariffs/${id}/`);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const insuranceApi = {
  // Providers
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,

  // Plans
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,

  // Enrollments
  listEnrollments,
  getEnrollment,
  createEnrollment,
  updateEnrollment,
  deleteEnrollment,

  // Provider configs
  listProviderConfigs,
  getProviderConfig,
  createProviderConfig,
  updateProviderConfig,

  // Claims
  listClaims,
  getClaim,
  createClaim,
  submitClaim,
  approveClaim,
  rejectClaim,
  queryClaim,
  respondToQuery,
  markClaimPaid,
  appealClaim,
  cancelClaim,

  // Preauths
  listPreauths,
  getPreauth,
  createPreauth,
  submitPreauth,
  approvePreauth,
  denyPreauth,
  cancelPreauth,

  // Remittances
  listRemittances,
  getRemittance,
  createRemittance,
  reconcileRemittance,

  // Tariffs
  listTariffs,
  getTariff,
  createTariff,
  updateTariff,
  deleteTariff,
};

/**
 * API client for the Insurance module.
 *
 * All responses are validated with Zod schemas via parseResponse().
 */
import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  InsuranceClaimSchema,
  InsurancePlanSchema,
  InsurancePreauthSchema,
  InsuranceProviderConfigSchema,
  FacilitySladeCredentialSchema,
  InsuranceProviderSchema,
  InsuranceVisitAuthorizationSchema,
  InsuranceRemittanceSchema,
  HealthcloudReserveBalanceResultSchema,
  InsuranceRemittanceClaimsDrilldownSchema,
  HealthcloudSyncStatusSchema,
  PaginatedInsuranceClaimsSchema,
  PaginatedInsurancePlansSchema,
  PaginatedInsurancePreauthsSchema,
  PaginatedInsuranceVisitAuthorizationsSchema,
  PaginatedInsuranceRemittancesSchema,
  PaginatedPatientInsurancesSchema,
  PaginatedPayerTariffsSchema,
  PaginatedProviderConfigsSchema,
  PaginatedFacilitySladeCredentialsSchema,
  PaginatedInsuranceProvidersSchema,
  PatientInsuranceSchema,
  PayerTariffSchema,
  VerifyViaHealthcloudResultSchema,
  SladeDefaultsSeedResultSchema,
  HealthcloudSessionStartResultSchema,
  HealthcloudIdentityWorkflowResultSchema,
} from '@/lib/schemas/insurance.schema';
import type {
  HealthcloudGetHealthIdInput,
  HealthcloudIdentityWorkflowResult,
  HealthcloudPostProfileInput,
  HealthcloudSessionRequestOTPInput,
  HealthcloudSessionStartResult,
  HealthcloudSessionStartVisitInput,
  HealthcloudReserveBalanceResult,
  HealthcloudSyncStatus,
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
  FacilitySladeCredential,
  FacilitySladeCredentialInput,
  InsuranceProviderCreateInput,
  InsuranceVisitAuthorization,
  InsuranceRemittance,
  InsuranceRemittanceClaimsDrilldown,
  InsuranceRemittanceCreateInput,
  PaginatedInsuranceResponse,
  PatientInsurance,
  PatientInsuranceCreateInput,
  PayerTariff,
  PayerTariffCreateInput,
  RequestOTPInput,
  ReserveBalanceInput,
  StartVisitInput,
  SubmitCreditNoteInput,
  SubmitInvoiceInput,
  UploadClaimAttachmentFileInput,
  UploadClaimAttachmentFileResult,
  UploadClaimAttachmentInput,
  ValidateAuthorizationInput,
  VerifyEnrollmentPreviewInput,
  VerifyViaHealthcloudResult,
  SladeDefaultsSeedResult,
} from '@/lib/types/insurance';

const BASE = '/api/insurance';

const GenericObjectResponseSchema = z.record(z.unknown());
const UploadClaimAttachmentFileResultSchema = z.object({
  attachment_ref: z.string(),
  upload: z.record(z.unknown()),
  attachment: z.record(z.unknown()),
});

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

function buildEnrollmentPayload(data: Partial<PatientInsuranceCreateInput>): {
  payload: FormData | Partial<PatientInsuranceCreateInput>;
  isMultipart: boolean;
} {
  const hasFile = data.card_image_front instanceof File || data.card_image_back instanceof File;
  if (!hasFile) {
    return { payload: data, isMultipart: false };
  }

  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (value instanceof File) {
      formData.append(key, value);
      return;
    }
    formData.append(key, String(value));
  });

  return { payload: formData, isMultipart: true };
}

async function createEnrollment(data: PatientInsuranceCreateInput): Promise<PatientInsurance> {
  const { payload, isMultipart } = buildEnrollmentPayload(data);
  const response = await apiClient.post(
    `${BASE}/enrollments/`,
    payload,
    isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
  );
  return parseResponse(PatientInsuranceSchema, response.data, {
    context: 'insuranceApi.createEnrollment',
  });
}

async function updateEnrollment(
  id: number,
  data: Partial<PatientInsuranceCreateInput>
): Promise<PatientInsurance> {
  const { payload, isMultipart } = buildEnrollmentPayload(data);
  const response = await apiClient.patch(
    `${BASE}/enrollments/${id}/`,
    payload,
    isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
  );
  return parseResponse(PatientInsuranceSchema, response.data, {
    context: 'insuranceApi.updateEnrollment',
  });
}

async function deleteEnrollment(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/enrollments/${id}/`);
}

async function verifyEnrollmentViaHealthcloud(id: number): Promise<VerifyViaHealthcloudResult> {
  const response = await apiClient.post(`${BASE}/enrollments/${id}/verify-via-healthcloud/`);
  return parseResponse(VerifyViaHealthcloudResultSchema, response.data, {
    context: 'insuranceApi.verifyEnrollmentViaHealthcloud',
  });
}

async function verifyEnrollmentViaHealthcloudPreview(
  data: VerifyEnrollmentPreviewInput
): Promise<VerifyViaHealthcloudResult> {
  const response = await apiClient.post(
    `${BASE}/enrollments/verify-via-healthcloud-preview/`,
    data
  );
  return parseResponse(VerifyViaHealthcloudResultSchema, response.data, {
    context: 'insuranceApi.verifyEnrollmentViaHealthcloudPreview',
  });
}

async function seedSladeDefaults(): Promise<SladeDefaultsSeedResult> {
  const response = await apiClient.post(`${BASE}/providers/seed-slade-defaults/`);
  return parseResponse(SladeDefaultsSeedResultSchema, response.data, {
    context: 'insuranceApi.seedSladeDefaults',
  });
}

async function requestEnrollmentOtp(
  id: number,
  data: RequestOTPInput
): Promise<InsuranceVisitAuthorization> {
  const response = await apiClient.post(`${BASE}/enrollments/${id}/request-otp/`, data);
  return parseResponse(InsuranceVisitAuthorizationSchema, response.data, {
    context: 'insuranceApi.requestEnrollmentOtp',
  });
}

async function startHealthcloudSession(id: number): Promise<HealthcloudSessionStartResult> {
  const response = await apiClient.post(`${BASE}/enrollments/${id}/healthcloud-session/start/`);
  return parseResponse(HealthcloudSessionStartResultSchema, response.data, {
    context: 'insuranceApi.startHealthcloudSession',
  });
}

async function postHealthcloudProfile(
  id: number,
  data: HealthcloudPostProfileInput
): Promise<HealthcloudIdentityWorkflowResult> {
  const response = await apiClient.post(
    `${BASE}/enrollments/${id}/healthcloud/post-profile/`,
    data
  );
  return parseResponse(HealthcloudIdentityWorkflowResultSchema, response.data, {
    context: 'insuranceApi.postHealthcloudProfile',
  });
}

async function getHealthcloudHealthId(
  id: number,
  data: HealthcloudGetHealthIdInput
): Promise<HealthcloudIdentityWorkflowResult> {
  const response = await apiClient.post(
    `${BASE}/enrollments/${id}/healthcloud/get-health-id/`,
    data
  );
  return parseResponse(HealthcloudIdentityWorkflowResultSchema, response.data, {
    context: 'insuranceApi.getHealthcloudHealthId',
  });
}

async function requestHealthcloudSessionOtp(
  id: number,
  data: HealthcloudSessionRequestOTPInput
): Promise<InsuranceVisitAuthorization> {
  const response = await apiClient.post(
    `${BASE}/enrollments/${id}/healthcloud-session/request-otp/`,
    data
  );
  return parseResponse(InsuranceVisitAuthorizationSchema, response.data, {
    context: 'insuranceApi.requestHealthcloudSessionOtp',
  });
}

async function startHealthcloudSessionVisit(
  id: number,
  data: HealthcloudSessionStartVisitInput
): Promise<InsuranceVisitAuthorization> {
  const response = await apiClient.post(
    `${BASE}/enrollments/${id}/healthcloud-session/start-visit/`,
    data
  );
  return parseResponse(InsuranceVisitAuthorizationSchema, response.data, {
    context: 'insuranceApi.startHealthcloudSessionVisit',
  });
}

async function startEnrollmentVisit(
  id: number,
  data: StartVisitInput
): Promise<InsuranceVisitAuthorization> {
  const response = await apiClient.post(`${BASE}/enrollments/${id}/start-visit/`, data);
  return parseResponse(InsuranceVisitAuthorizationSchema, response.data, {
    context: 'insuranceApi.startEnrollmentVisit',
  });
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
// Facility Slade Credentials
// ---------------------------------------------------------------------------

async function listFacilitySladeCredentials(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<FacilitySladeCredential>> {
  const response = await apiClient.get(`${BASE}/slade-credentials/`, { params });
  return parseResponse(PaginatedFacilitySladeCredentialsSchema, response.data, {
    context: 'insuranceApi.listFacilitySladeCredentials',
  });
}

async function getCurrentFacilitySladeCredential(): Promise<FacilitySladeCredential | null> {
  const page = await listFacilitySladeCredentials({ page: 1, page_size: 1 });
  return page.results[0] ?? null;
}

async function createFacilitySladeCredential(
  data: FacilitySladeCredentialInput
): Promise<FacilitySladeCredential> {
  const response = await apiClient.post(`${BASE}/slade-credentials/`, data);
  return parseResponse(FacilitySladeCredentialSchema, response.data, {
    context: 'insuranceApi.createFacilitySladeCredential',
  });
}

async function updateFacilitySladeCredential(
  id: number,
  data: FacilitySladeCredentialInput
): Promise<FacilitySladeCredential> {
  const response = await apiClient.patch(`${BASE}/slade-credentials/${id}/`, data);
  return parseResponse(FacilitySladeCredentialSchema, response.data, {
    context: 'insuranceApi.updateFacilitySladeCredential',
  });
}

// ---------------------------------------------------------------------------
// HealthCloud Visit Authorizations
// ---------------------------------------------------------------------------

async function listVisitAuthorizations(
  params?: Record<string, string | number | undefined>
): Promise<PaginatedInsuranceResponse<InsuranceVisitAuthorization>> {
  const response = await apiClient.get(`${BASE}/authorizations/`, { params });
  return parseResponse(PaginatedInsuranceVisitAuthorizationsSchema, response.data, {
    context: 'insuranceApi.listVisitAuthorizations',
  });
}

async function getVisitAuthorization(id: number): Promise<InsuranceVisitAuthorization> {
  const response = await apiClient.get(`${BASE}/authorizations/${id}/`);
  return parseResponse(InsuranceVisitAuthorizationSchema, response.data, {
    context: 'insuranceApi.getVisitAuthorization',
  });
}

async function validateVisitAuthorization(
  id: number,
  data: ValidateAuthorizationInput
): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/authorizations/${id}/validate-token/`, data);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.validateVisitAuthorization',
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

async function reserveClaimBalance(
  id: number,
  data: ReserveBalanceInput
): Promise<HealthcloudReserveBalanceResult> {
  const response = await apiClient.post(`${BASE}/claims/${id}/reserve-balance/`, data);
  return parseResponse(HealthcloudReserveBalanceResultSchema, response.data, {
    context: 'insuranceApi.reserveClaimBalance',
  });
}

async function submitClaimToHealthcloud(id: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/claims/${id}/submit-to-healthcloud/`);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.submitClaimToHealthcloud',
  });
}

async function refreshClaimExternalStatus(id: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/claims/${id}/refresh-external-status/`);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.refreshClaimExternalStatus',
  });
}

async function submitClaimInvoice(
  id: number,
  data: SubmitInvoiceInput
): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/claims/${id}/submit-invoice/`, data);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.submitClaimInvoice',
  });
}

async function submitClaimCreditNote(
  id: number,
  data: SubmitCreditNoteInput
): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/claims/${id}/submit-credit-note/`, data);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.submitClaimCreditNote',
  });
}

async function uploadClaimAttachment(
  id: number,
  data: UploadClaimAttachmentInput
): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/claims/${id}/upload-attachment/`, data);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.uploadClaimAttachment',
  });
}

async function uploadClaimAttachmentFile(
  id: number,
  file: File,
  data: UploadClaimAttachmentFileInput = {}
): Promise<UploadClaimAttachmentFileResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (data.attachment_type) formData.append('attachment_type', data.attachment_type);
  if (data.description) formData.append('description', data.description);

  const response = await apiClient.post(`${BASE}/claims/${id}/upload-attachment-file/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return parseResponse(UploadClaimAttachmentFileResultSchema, response.data, {
    context: 'insuranceApi.uploadClaimAttachmentFile',
  });
}

async function checkClaimRemittance(id: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post(`${BASE}/claims/${id}/check-remittance/`);
  return parseResponse(GenericObjectResponseSchema, response.data, {
    context: 'insuranceApi.checkClaimRemittance',
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

async function getRemittanceClaimsDrilldown(
  id: number
): Promise<InsuranceRemittanceClaimsDrilldown> {
  const response = await apiClient.get(`${BASE}/remittances/${id}/claims-drilldown/`);
  return parseResponse(InsuranceRemittanceClaimsDrilldownSchema, response.data, {
    context: 'insuranceApi.getRemittanceClaimsDrilldown',
  });
}

async function getHealthcloudSyncStatus(params?: {
  include_failures?: boolean;
  include_sync_items?: boolean;
  include_remittance_items?: boolean;
  limit?: number;
}): Promise<HealthcloudSyncStatus> {
  const response = await apiClient.get(`${BASE}/remittances/healthcloud-sync-status/`, {
    params,
  });
  return parseResponse(HealthcloudSyncStatusSchema, response.data, {
    context: 'insuranceApi.getHealthcloudSyncStatus',
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
  verifyEnrollmentViaHealthcloud,
  verifyEnrollmentViaHealthcloudPreview,
  seedSladeDefaults,
  requestEnrollmentOtp,
  startEnrollmentVisit,
  startHealthcloudSession,
  requestHealthcloudSessionOtp,
  startHealthcloudSessionVisit,
  postHealthcloudProfile,
  getHealthcloudHealthId,

  // Provider configs
  listProviderConfigs,
  getProviderConfig,
  createProviderConfig,
  updateProviderConfig,
  listFacilitySladeCredentials,
  getCurrentFacilitySladeCredential,
  createFacilitySladeCredential,
  updateFacilitySladeCredential,

  // HealthCloud authorizations
  listVisitAuthorizations,
  getVisitAuthorization,
  validateVisitAuthorization,

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
  reserveClaimBalance,
  submitClaimToHealthcloud,
  refreshClaimExternalStatus,
  submitClaimInvoice,
  submitClaimCreditNote,
  uploadClaimAttachment,
  uploadClaimAttachmentFile,
  checkClaimRemittance,

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
  getRemittanceClaimsDrilldown,
  getHealthcloudSyncStatus,

  // Tariffs
  listTariffs,
  getTariff,
  createTariff,
  updateTariff,
  deleteTariff,
};

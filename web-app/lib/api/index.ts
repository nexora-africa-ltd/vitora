/**
 * Barrel export for API modules.
 */

export { apiClient } from './client';
export { allergiesApi } from './allergies';
export { checkinApi } from './checkin';
export { clinicsApi } from './clinics';
export { consultationQueueApi } from './consultation-queue';
export type { ConsultationQueueResponse } from './consultation-queue';
export { encountersApi } from './encounters';
export { imagingApi } from './imaging';
export { inpatientApi } from './inpatient';
export { laboratoryApi } from './laboratory';
export { locationsApi } from './locations';
export { patientsApi } from './patients';
export { pharmacyApi } from './pharmacy';
export { billingApi } from './billing';
export { triageApi } from './triage';
export { mfaApi } from './mfa';
export {
  mchApi,
  mchRegistrationsApi,
  ancVisitsApi,
  deliveriesApi,
  pncVisitsApi,
  growthMeasurementsApi,
  vaccinesApi,
  immunizationsApi,
  vitaminAApi,
  aefiApi,
  heiFollowUpApi,
} from './mch';
export type {
  TriageAssessmentUpdateData,
  TriageAssessmentListParams,
  TriageQueueListParams,
  CalculateCategoryRequest,
  CalculateCategoryResponse,
  TriageReportParams,
  WaitTimeStatsResponse,
} from './triage';
// Re-export from types for backwards compatibility
export type { TriageAssessmentCreateData } from '@/lib/types/triage';

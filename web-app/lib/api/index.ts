/**
 * Barrel export for API modules.
 */

export { apiClient } from './client';
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

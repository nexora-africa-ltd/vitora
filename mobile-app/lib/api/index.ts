/**
 * API Module Exports
 *
 * Central export point for all API-related modules.
 *
 * @module lib/api
 */

// Client configuration
export {
  configureApiClient,
  getApiClient,
  resetApiClient,
  apiClient,
} from './client';

// Auth API
export { authApi, LoginCredentials, TokenResponse, UserData } from './auth';

// Patients API
export {
  patientsApi,
  Patient,
  CreatePatientData,
  UpdatePatientData,
  PatientListResponse,
  PatientListParams,
} from './patients';

// Locations API
export {
  locationsApi,
  County,
  SubCounty,
  Ward,
} from './locations';

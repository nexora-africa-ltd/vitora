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
export { login, refresh, verifyToken as verify } from './auth';

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

// Billing API
export {
  billingApi,
  CreatePaymentData,
  Invoice,
  InvoiceLineItem,
  InvoiceListItem,
  InvoiceListParams,
  InvoiceListResponse,
  InvoiceStatus,
  Payment,
  PaymentListParams,
  PaymentListResponse,
} from './billing';

// SHA API
export { shaApi } from './sha';

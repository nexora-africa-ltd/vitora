/**
 * Types for standalone LIS operations (walk-in patients, external orders).
 */

export interface WalkInPatient {
  id: number;
  registration_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string | null;
  gender: '' | 'M' | 'F' | 'O';
  phone_number: string;
  email: string;
  national_id: string;
  id_type: string;
  referring_facility: string;
  referring_clinician: string;
  linked_patient: number | null;
  created_at: string;
  updated_at: string;
}

export interface WalkInPatientCreateData {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  gender?: '' | 'M' | 'F' | 'O';
  phone_number?: string;
  email?: string;
  national_id?: string;
  id_type?: string;
  referring_facility?: string;
  referring_clinician?: string;
}

export interface StandaloneOrderCreateData {
  walkin_patient_id?: number;
  patient_id?: number;
  walkin_name?: string;
  walkin_phone?: string;
  walkin_national_id?: string;
  walkin_dob?: string | null;
  walkin_gender?: '' | 'M' | 'F' | 'O';
  priority?: 'ROUTINE' | 'URGENT' | 'STAT';
  clinical_notes?: string;
  enable_billing?: boolean;
  payer_type?: 'cash' | 'sha' | 'private_insurance' | 'corporate' | 'mixed';
  diagnostic_package?: '' | 'BASIC' | 'COMPREHENSIVE' | 'EMPLOYMENT' | 'REFERRAL';
  referring_clinician?: string;
  items: StandaloneOrderItem[];
}

export interface StandaloneBillingReconciliation {
  released_orders: number;
  released_amount: string;
  invoices: number;
  invoiced_amount: string;
  payments: number;
  collected_amount: string;
  outstanding_amount: string;
}

export interface StandaloneBillingInvoice {
  id: number;
  invoice_number: string;
  patient_name: string;
  invoice_date: string;
  status: string;
  payer_type: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
}

export interface StandaloneOrderItem {
  test_code: string;
  special_instructions?: string;
}

export interface ExternalOrderRequest {
  id: number;
  trace_id?: string;
  message_control_id: string;
  sending_application: string;
  sending_facility: string;
  external_patient_id: string;
  patient_name: string;
  patient_dob: string | null;
  patient_gender: string;
  patient_id_number: string;
  placer_order_number: string;
  order_priority: string;
  clinical_info: string;
  requested_tests: ExternalOrderTest[];
  status: ExternalOrderStatus;
  rejection_reason: string;
  walkin_patient: number | null;
  lab_order: number | null;
  processed_by: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundIngestionEvent {
  id: number;
  trace_id: string;
  source_system: string;
  channel: string;
  idempotency_key: string;
  status: 'RECEIVED' | 'MAPPED' | 'FAILED' | 'REPLAYED';
  error_message: string;
  replay_count: number;
  last_replayed_at: string | null;
  processed_at: string | null;
  external_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface CrosswalkEntry {
  id: number;
  source_system: string;
  external_patient_id: string;
  external_member_id: string;
  patient_name_snapshot: string;
  walkin_patient: number | null;
  patient: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResultDeliveryLog {
  id: number;
  trace_id: string;
  channel: 'WEBHOOK' | 'PDF_PACKAGE' | 'HL7_FHIR';
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  destination: string;
  external_order: number | null;
  lab_order: number;
  requested_by: number | null;
  response_status_code: number | null;
  response_body: string;
  error_message: string;
  attempt_count: number;
  delivered_at: string | null;
  pdf_filename: string;
  created_at: string;
  updated_at: string;
}

export interface InboundIngestResponse {
  trace_id: string;
  event_id: number;
  external_order: ExternalOrderRequest;
}

export interface MessageMappingConfig {
  id: number;
  code_system: string;
  external_code: string;
  external_display: string;
  relationship: 'EQUIVALENT' | 'BROADER' | 'NARROWER' | 'RELATED';
  is_active: boolean;
  notes: string;
  test_id: number;
  test_code: string;
  test_name: string;
  created_at: string;
  updated_at: string;
}

export interface MessageMappingValidationRow {
  external_code: string;
  mapped: boolean;
  mapping_source: 'none' | 'external_code_mapping' | 'direct_catalog';
  test_code: string | null;
  test_name: string | null;
  reason: string;
}

export interface MessageMappingValidationResult {
  source_system: string;
  total_codes: number;
  mapped_count: number;
  unmapped_count: number;
  mappings: MessageMappingValidationRow[];
}

export interface ExternalOrderTest {
  code: string;
  name?: string;
}

export type ExternalOrderStatus = 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED';

export interface LISOnboardingStep {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
}

export interface LISOnboardingStatus {
  complete: boolean;
  steps: LISOnboardingStep[];
  completed_at: string | null;
}

export interface LISOnboardingSeedResult {
  archetype: 'small' | 'medium' | 'reference';
  created_tests: number;
  created_instruments: number;
  created_channels: number;
}

export interface LISOnboardingImportError {
  row: number;
  error: string;
}

export interface LISOnboardingImportResult {
  created: number;
  updated: number;
  errors: LISOnboardingImportError[];
  error_count: number;
}

export interface LISOnboardingWorkflowImportResult {
  updated: number;
  errors: LISOnboardingImportError[];
  error_count: number;
}

export interface LISOnboardingAnalyzerImportResult {
  created_instruments: number;
  created_channels: number;
  updated_channels: number;
  errors: LISOnboardingImportError[];
  error_count: number;
}

export interface LISOnboardingReferenceRangeImportResult {
  updated: number;
  errors: LISOnboardingImportError[];
  error_count: number;
}

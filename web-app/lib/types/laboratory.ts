/**
 * Laboratory module type definitions.
 * Sprint 1.5-1.6 Track B: Lab Workflow
 */

/**
 * Test catalog list item - returned by list/search endpoints.
 * Matches backend TestCatalogSerializer.
 */
export interface TestCatalogListItem {
  id: number;
  code: string;
  name: string;
  short_name: string;
  category: TestCategory;
  specimen_type: SpecimenType;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  is_active: boolean;
}

/**
 * Full test catalog - returned by detail endpoint.
 * Matches backend TestCatalogDetailSerializer.
 */
export interface TestCatalog {
  id: number;
  code: string;
  name: string;
  short_name: string;
  loinc_code?: string | null;
  category: TestCategory;
  specimen_type: SpecimenType;
  result_type: ResultType;
  result_unit?: string | null;
  normal_range_male?: string | null;
  normal_range_female?: string | null;
  normal_range_child?: string | null;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  external_lab_partner?: string | null;
  turnaround_hours?: number | null;
  is_panel: boolean;
  panel_components?: number[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TestCategory =
  | 'HEMATOLOGY'
  | 'CHEMISTRY'
  | 'MICROBIOLOGY'
  | 'PARASITOLOGY'
  | 'SEROLOGY'
  | 'IMMUNOLOGY'
  | 'URINALYSIS'
  | 'HISTOPATHOLOGY'
  | 'CYTOLOGY'
  | 'MOLECULAR'
  | 'PATHOLOGY'
  | 'RADIOLOGY'
  | 'OTHER';

export type SpecimenType =
  | 'BLOOD'
  | 'URINE'
  | 'STOOL'
  | 'SPUTUM'
  | 'CSF'
  | 'SWAB'
  | 'TISSUE'
  | 'SERUM'
  | 'PLASMA'
  | 'ASPIRATE'
  | 'OTHER';

export type ResultType = 'NUMERIC' | 'TEXT' | 'OPTION' | 'OPTIONS' | 'PANEL';

// =========== Phase L0 — Specimen ===========

export type SpecimenStatus =
  | 'PENDING'
  | 'COLLECTED'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'REJECTED'
  | 'STORED'
  | 'DISPOSED';

export interface Specimen {
  id: number;
  barcode: string;
  specimen_type: SpecimenType;
  container_type?: string | null;
  lab_order: number;
  order_items: number[];
  collected_by?: number | null;
  collected_by_name?: string | null;
  collected_at?: string | null;
  collection_site?: string | null;
  received_by?: number | null;
  received_at?: string | null;
  status: SpecimenStatus;
  rejection_reason?: string | null;
  storage_location?: string | null;
  storage_temperature?: string | null;
  created_at: string;
  updated_at: string;
}

// =========== Phase L2 — Two-Stage Validation ===========

export type ValidationType = 'TECHNICAL' | 'CLINICAL';
export type ValidationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ResultValidation {
  id: number;
  result: number;
  validation_type: ValidationType;
  validation_type_display: string;
  status: ValidationStatus;
  status_display: string;
  validated_by?: number | null;
  validated_by_name?: string | null;
  validated_at?: string | null;
  comment?: string | null;
}

export interface ResultValidationCreateData {
  validation_type: ValidationType;
  status: 'APPROVED' | 'REJECTED';
  comment?: string;
}

// =========== Phase L3 — Instruments & Analyzer Runs ===========

export type InterfaceType = 'ASTM' | 'HL7' | 'SERIAL' | 'TCP' | 'NONE';
export type AnalyzerRunStatus = 'RECEIVED' | 'PARSED' | 'APPLIED' | 'ERROR';

export interface Instrument {
  id: number;
  code: string;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  department?: string | null;
  is_active: boolean;
  interface_type: InterfaceType;
  interface_type_display: string;
  integration_config?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyzerRun {
  id: number;
  specimen: number;
  specimen_barcode: string;
  instrument: number;
  instrument_code: string;
  instrument_name: string;
  operator?: number | null;
  operator_name?: string | null;
  run_datetime: string;
  raw_message?: string | null;
  raw_payload?: Record<string, unknown> | null;
  status: AnalyzerRunStatus;
  status_display: string;
  error_message?: string | null;
  created_at: string;
}

// =========== Phase L4 — Diagnostic Reports ===========

export type DiagnosticReportStatus =
  | 'DRAFT'
  | 'PRELIMINARY'
  | 'FINAL'
  | 'AMENDED'
  | 'CANCELLED';

export interface DiagnosticReport {
  id: number;
  report_number: string;
  lab_order: number;
  lab_order_number: string;
  patient_name: string;
  status: DiagnosticReportStatus;
  status_display: string;
  is_finalized: boolean;
  issued_by: number;
  issued_by_name: string;
  issued_at?: string | null;
  conclusion?: string | null;
  clinical_info?: string | null;
  amended_by?: number | null;
  amended_by_name?: string | null;
  amended_at?: string | null;
  cancellation_reason?: string | null;
  pdf_file?: string | null;
  pdf_url?: string | null;
  fhir_resource_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosticReportCreateData {
  lab_order: number;
  conclusion?: string;
  clinical_info?: string;
}

// =========== Phase C — Lab Operational Reports ===========

export interface TurnaroundTimeReport {
  start: string;
  end: string;
  overall: {
    results_verified: number;
    avg_result_tat_hours: number | null;
  };
  by_test: Array<{
    test_code: string;
    test_name: string;
    result_count: number;
    avg_tat_hours: number | null;
  }>;
  by_priority: Array<{
    priority: LabPriority;
    result_count: number;
    avg_tat_hours: number | null;
  }>;
  queue_tat: {
    released_count: number;
    avg_collect_to_release_hours: number | null;
    avg_processing_to_release_hours: number | null;
  };
}

export interface WorkloadReport {
  start: string;
  end: string;
  totals: {
    tests_entered: number;
    tests_verified: number;
  };
  by_day: Array<{
    date: string;
    tests_entered: number;
    tests_verified: number;
  }>;
  by_technician: Array<{
    technician_id: number;
    technician_name: string;
    entered_count: number;
    verified_count: number;
  }>;
}

export interface CriticalValuesReport {
  start: string;
  end: string;
  total_critical: number;
  by_test: Array<{
    test_code: string;
    test_name: string;
    critical_count: number;
  }>;
}

export interface SampleRejectionReport {
  start: string;
  end: string;
  total_orders: number;
  rejected_orders: number;
  rejection_rate: number;
  reasons: Array<{
    reason: string;
    count: number;
  }>;
}

// Lab order types
export interface LabOrder {
  id: number;
  order_number: string;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  encounter: number;
  admission?: number | null;
  ordered_by: number;
  ordered_by_name?: string | null;
  order_type: OrderType;
  external_lab?: string | null;
  status: LabOrderStatus;
  priority: LabPriority;
  clinical_notes?: string | null;
  specimen_collected: boolean;
  specimen_collected_at?: string | null;
  specimen_collected_by?: number | null;
  ordered_at: string;
  completed_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by?: number | null;
  cancelled_at?: string | null;
  items: LabOrderItem[];
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export type OrderType = 'IN_HOUSE' | 'EXTERNAL';

export type LabOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'SPECIMEN_COLLECTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type LabPriority = 'ROUTINE' | 'URGENT' | 'STAT';

// Lab order item types
export interface LabOrderItem {
  id: number;
  lab_order: number;
  test: number;
  test_code: string;
  test_name: string;
  unit_cost: number;
  status: LabOrderItemStatus;
  special_instructions?: string | null;
  has_result: boolean;
  result?: LabResult | null;
  created_at: string;
}

export type LabOrderItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// Lab result types
export interface LabResult {
  id: number;
  order_item: number;
  numeric_value?: number | null;
  text_value?: string | null;
  option_value?: string | null;
  result_unit?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  reference_range_text?: string | null;
  result_flag?: ResultFlag | null;
  interpretation?: string | null;
  is_critical_result: boolean;
  method?: string | null;
  equipment?: string | null;
  verification_status: VerificationStatus;
  verified_by?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  entered_by: number;
  entered_by_name?: string | null;
  entered_at: string;
  is_amended: boolean;
  amendment_reason?: string | null;
  original_value?: string | null;
  is_external_result: boolean;
  external_result_attachment?: string | null;
  external_result_date?: string | null;
  created_at: string;
  updated_at: string;
}

export type ResultFlag =
  | 'NORMAL'
  | 'LOW'
  | 'HIGH'
  | 'CRITICAL_LOW'
  | 'CRITICAL_HIGH'
  | 'ABNORMAL'
  | 'POSITIVE'
  | 'NEGATIVE';

export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

// Lab queue types
export interface LabQueue {
  id: number;
  order_number: string;
  patient_name?: string | null;
  patient_mrn?: string | null;
  queue_number: string;
  priority: LabPriority;
  queue_status: QueueStatus;
  sample_type: string;
  sample_id?: string | null;
  specimen?: Specimen | null;
  tests?: Array<{ code: string; name: string }> | null;
  collected_at?: string | null;
  collected_by?: number | null;
  collected_by_name?: string | null;
  assigned_technician?: number | null;
  assigned_technician_name?: string | null;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  reviewed_by?: number | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  released_at?: string | null;
  technician_notes?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  // TAT fields
  expected_tat_hours?: number | null;
  elapsed_hours?: number | null;
  actual_tat_hours?: number | null;
  is_overdue?: boolean | null;
}

export type QueueStatus =
  | 'PENDING'
  | 'COLLECTED'
  | 'PROCESSING'
  | 'REVIEW'
  | 'RELEASED'
  | 'REJECTED';

// Technician type
export interface LabTechnician {
  id: number;
  username: string;
  full_name: string;
}

// API request/response types
export interface LabOrderCreateData {
  patient: number;
  encounter: number;
  order_type?: OrderType;
  external_lab?: string;
  priority?: LabPriority;
  clinical_notes?: string;
  items: LabOrderItemCreateData[];
}

export interface LabOrderItemCreateData {
  test_code: string;
  special_instructions?: string;
}

export interface LabResultCreateData {
  order_item: number;
  numeric_value?: number;
  text_value?: string;
  option_value?: string;
  result_unit?: string;
  reference_low?: number;
  reference_high?: number;
  reference_range_text?: string;
  result_flag?: ResultFlag;
  interpretation?: string;
  method?: string;
  equipment?: string;
}

export interface TestCatalogListParams {
  search?: string;
  category?: TestCategory;
  specimen_type?: SpecimenType;
  available_in_house?: boolean;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface LabOrderListParams {
  patient?: number;
  encounter?: number;
  status?: LabOrderStatus;
  priority?: LabPriority;
  order_type?: OrderType;
  search?: string;
  page?: number;
  page_size?: number;
}

// Alert types
export interface CriticalAlert {
  test_name: string;
  value: string;
  flag: ResultFlag;
}

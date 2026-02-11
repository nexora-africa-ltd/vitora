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

// Lab order types
export interface LabOrder {
  id: number;
  order_number: string;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  encounter: number;
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
  lab_order: number;
  order_number: string;
  patient_name?: string | null;
  patient_mrn?: string | null;
  queue_number: string;
  priority: LabPriority;
  queue_status: QueueStatus;
  sample_type: string;
  sample_id?: string | null;
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

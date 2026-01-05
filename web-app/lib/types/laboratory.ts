/**
 * Laboratory module type definitions.
 * Sprint 1.5-1.6 Track B: Lab Workflow
 */

// Test catalog types
export interface TestCatalog {
  id: number;
  code: string;
  name: string;
  short_name: string;
  loinc_code?: string;
  category: TestCategory;
  specimen_type: SpecimenType;
  result_type: ResultType;
  result_unit?: string;
  normal_range_male?: string;
  normal_range_female?: string;
  normal_range_child?: string;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  external_lab_partner?: string;
  turnaround_hours?: number;
  is_panel: boolean;
  panel_components?: number[];
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
  | 'URINALYSIS'
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
  | 'OTHER';

export type ResultType = 'NUMERIC' | 'TEXT' | 'OPTION' | 'PANEL';

// Lab order types
export interface LabOrder {
  id: number;
  order_number: string;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  encounter: number;
  ordered_by: number;
  ordered_by_name?: string;
  order_type: OrderType;
  external_lab?: string;
  status: LabOrderStatus;
  priority: LabPriority;
  clinical_notes?: string;
  specimen_collected: boolean;
  specimen_collected_at?: string;
  specimen_collected_by?: number;
  ordered_at: string;
  completed_at?: string;
  cancellation_reason?: string;
  cancelled_by?: number;
  cancelled_at?: string;
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
  special_instructions?: string;
  has_result: boolean;
  result?: LabResult;
  created_at: string;
}

export type LabOrderItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// Lab result types
export interface LabResult {
  id: number;
  order_item: number;
  numeric_value?: number;
  text_value?: string;
  option_value?: string;
  reference_low?: number;
  reference_high?: number;
  reference_range_text?: string;
  result_flag?: ResultFlag;
  interpretation?: string;
  is_critical_result: boolean;
  method?: string;
  equipment?: string;
  verification_status: VerificationStatus;
  verified_by?: number;
  verified_by_name?: string;
  verified_at?: string;
  entered_by: number;
  entered_by_name?: string;
  entered_at: string;
  is_amended: boolean;
  amendment_reason?: string;
  original_value?: string;
  is_external_result: boolean;
  external_result_attachment?: string;
  external_result_date?: string;
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
  patient_name?: string;
  patient_mrn?: string;
  queue_number: string;
  priority: LabPriority;
  queue_status: QueueStatus;
  sample_type: string;
  sample_id?: string;
  collected_at?: string;
  collected_by?: number;
  assigned_technician?: number;
  assigned_technician_name?: string;
  processing_started_at?: string;
  processing_completed_at?: string;
  reviewed_by?: number;
  reviewed_at?: string;
  released_at?: string;
  technician_notes?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export type QueueStatus =
  | 'PENDING'
  | 'COLLECTED'
  | 'PROCESSING'
  | 'REVIEW'
  | 'RELEASED';

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
  test: number;
  special_instructions?: string;
}

export interface LabResultCreateData {
  order_item: number;
  numeric_value?: number;
  text_value?: string;
  option_value?: string;
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

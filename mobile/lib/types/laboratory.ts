import type { PaginatedResponse } from './common';

export type LabOrderType = 'IN_HOUSE' | 'EXTERNAL';
export type LabPriority = 'ROUTINE' | 'URGENT' | 'STAT';

export interface LabTest {
  id: number;
  code: string;
  name: string;
  short_name?: string | null;
  category?: string | null;
  specimen_type?: string | null;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  is_active: boolean;
}

export interface LabResult {
  id: number;
  order_item: number;
  test_name?: string | null;
  test_code?: string | null;
  numeric_value?: number | null;
  text_value?: string | null;
  option_value?: string | null;
  formatted_value?: string | null;
  result_unit?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  reference_range_text?: string | null;
  result_flag?: string | null;
  interpretation?: string | null;
  is_critical_result: boolean;
  method?: string | null;
  equipment?: string | null;
  verification_status?: string | null;
  verified_by?: number | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  entered_by?: number | null;
  entered_by_name?: string | null;
  entered_at?: string | null;
  is_amended: boolean;
  amendment_reason?: string | null;
  original_value?: string | null;
  is_external_result: boolean;
  external_result_attachment?: string | null;
  external_result_date?: string | null;
  created_at: string;
  updated_at: string;
  validation_summary?: unknown;
}

export interface LabOrderItem {
  id: number;
  lab_order: number;
  test: number;
  test_name?: string | null;
  test_code?: string | null;
  status: string;
  unit_cost: number;
  special_instructions?: string | null;
  has_result: boolean;
  result?: LabResult | null;
  created_at: string;
}

export interface LabOrder {
  id: number;
  order_number: string;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  encounter?: number | null;
  admission?: number | null;
  ordered_by?: number | null;
  ordered_by_name?: string | null;
  order_type: LabOrderType | string;
  external_lab?: string | null;
  priority: LabPriority | string;
  clinical_notes?: string | null;
  status: string;
  specimen_collected: boolean;
  specimen_collected_at?: string | null;
  specimen_collected_by?: number | null;
  total_cost: number;
  items: LabOrderItem[];
  ordered_at: string;
  completed_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by?: number | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabOrderItemInput {
  test_code: string;
  special_instructions?: string;
}

export interface LabOrderCreateData {
  patient: number;
  encounter?: number;
  admission?: number;
  order_type: LabOrderType;
  external_lab?: string;
  priority: LabPriority;
  clinical_notes?: string;
  items: LabOrderItemInput[];
}

export interface LabVerifyResultInput {
  approved: boolean;
  comments?: string;
  validation_type?: 'TECHNICAL' | 'CLINICAL';
}

export interface LabOrderListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  encounter?: number;
  status?: string;
  priority?: string;
}

export interface LabTestListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
}

export type PaginatedLabOrderResponse = PaginatedResponse<LabOrder>;
export type PaginatedLabTestResponse = PaginatedResponse<LabTest>;
export type PaginatedLabResultResponse = PaginatedResponse<LabResult>;
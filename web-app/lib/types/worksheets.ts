/**
 * Worksheets & Label Printing type definitions.
 * Phase L5.3: Worksheet & Label Printing
 */

// =============================================================================
// Enums
// =============================================================================

export type WorksheetGroupBy = 'TEST' | 'PANEL' | 'DEPARTMENT' | 'PRIORITY' | 'SPECIMEN_TYPE';
export type WorksheetExportFormat = 'CSV' | 'PDF' | 'TSV';
export type WorksheetStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type LabelFormat = 'ZPL' | 'PDF';
export type LabelType = 'SPECIMEN' | 'ALIQUOT' | 'SLIDE' | 'BLOCK' | 'RACK' | 'TRAY';
export type LabelPrintJobStatus = 'PENDING' | 'GENERATING' | 'READY' | 'PRINTED' | 'FAILED';

// =============================================================================
// Worksheet Template
// =============================================================================

export interface WorksheetTemplate {
  id: number;
  name: string;
  description: string;
  group_by: WorksheetGroupBy;
  default_export_format: WorksheetExportFormat;
  filters: Record<string, unknown>;
  columns: string[];
  page_size: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorksheetTemplateCreateData {
  name: string;
  description?: string;
  group_by: WorksheetGroupBy;
  default_export_format?: WorksheetExportFormat;
  filters?: Record<string, unknown>;
  columns?: string[];
  page_size?: number;
}

// =============================================================================
// Worksheet (Batch)
// =============================================================================

export interface Worksheet {
  id: number;
  worksheet_number: string;
  template: number | null;
  template_name: string;
  status: WorksheetStatus;
  title: string;
  filters_applied: Record<string, unknown>;
  generated_by_name: string;
  generated_at: string;
  printed_at: string | null;
  item_count: number;
  items: WorksheetItem[];
  created_at: string;
  updated_at: string;
}

export interface WorksheetItem {
  id: number;
  worksheet: number;
  lab_order_item: number;
  test_name: string;
  patient_name: string;
  patient_mrn: string;
  specimen_barcode: string;
  position: number;
  result_value: string;
  result_entered_at: string | null;
}

export interface WorksheetGenerateData {
  template_id?: number;
  title?: string;
  date_from?: string;
  date_to?: string;
  department?: string;
  test_ids?: number[];
  priority?: string;
  specimen_type?: string;
}

// =============================================================================
// Label Template
// =============================================================================

export interface LabelTemplate {
  id: number;
  name: string;
  label_format: LabelFormat;
  label_type: LabelType;
  width_mm: number;
  height_mm: number;
  barcode_format: string;
  include_patient_name: boolean;
  include_dob: boolean;
  include_mrn: boolean;
  include_collection_date: boolean;
  include_test_name: boolean;
  zpl_template: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabelTemplateCreateData {
  name: string;
  label_format: LabelFormat;
  label_type: LabelType;
  width_mm?: number;
  height_mm?: number;
  barcode_format?: string;
  include_patient_name?: boolean;
  include_dob?: boolean;
  include_mrn?: boolean;
  include_collection_date?: boolean;
  include_test_name?: boolean;
  zpl_template?: string;
  is_default?: boolean;
}

// =============================================================================
// Label Print Job
// =============================================================================

export interface LabelPrintJob {
  id: number;
  template: number;
  template_name: string;
  status: LabelPrintJobStatus;
  total_labels: number;
  generated_data: string;
  generated_by_name: string;
  printed_at: string | null;
  error_message: string;
  items: LabelPrintJobItem[];
  created_at: string;
  updated_at: string;
}

export interface LabelPrintJobItem {
  id: number;
  print_job: number;
  lab_order_item: number;
  specimen_barcode: string;
  patient_name: string;
  label_data: string;
}

export interface LabelGenerateData {
  template_id: number;
  lab_order_item_ids: number[];
}

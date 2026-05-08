/**
 * Worksheets & Label Printing type definitions.
 * Phase L5.3: Worksheet & Label Printing
 */

// =============================================================================
// Enums
// =============================================================================

export type WorksheetGroupBy = 'ANALYZER' | 'SECTION' | 'PRIORITY' | 'SPECIMEN_TYPE';
export type WorksheetExportFormat = 'CSV' | 'PDF' | 'ZPL';
export type WorksheetStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'PRINTED';

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
  section_filter: string;
  instrument: number | null;
  instrument_name?: string | null;
  include_qc_slots: boolean;
  max_specimens_per_page: number;
  default_export_format: WorksheetExportFormat;
  columns?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorksheetTemplateCreateData {
  name: string;
  description?: string;
  group_by: WorksheetGroupBy;
  section_filter?: string;
  instrument?: number | null;
  include_qc_slots?: boolean;
  max_specimens_per_page?: number;
  default_export_format?: WorksheetExportFormat;
  columns?: string[];
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
  specimen_count: number;
  export_format: string;
  notes: string;
  generated_by: number;
  generated_by_name: string;
  generated_at: string;
  printed_at: string | null;
  items: WorksheetItem[];
  created_at: string;
  updated_at: string;
}

export interface WorksheetListItem {
  id: number;
  worksheet_number: string;
  template: number | null;
  template_name: string;
  status: WorksheetStatus;
  title: string;
  specimen_count: number;
  export_format: string;
  generated_by: number;
  generated_by_name: string;
  generated_at: string;
  printed_at: string | null;
  created_at: string;
}

export interface WorksheetItem {
  id: number;
  order_item: number | null;
  specimen: number | null;
  specimen_barcode: string;
  patient_name: string;
  test_name: string;
  position: number;
  is_qc_slot: boolean;
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

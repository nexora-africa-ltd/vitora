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
  result_type: ResultType;
  result_unit?: string | null;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  turnaround_hours?: number | null;
  requires_fasting: boolean;
  requires_clinical_signoff: boolean;
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
  result_options?: string[] | null;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  external_lab_partner?: string | null;
  turnaround_hours?: number | null;
  requires_fasting: boolean;
  requires_clinical_signoff: boolean;
  special_instructions?: string | null;
  is_panel: boolean;
  panel_components?: TestCatalogListItem[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Data for creating/updating a test catalog entry.
 * Matches backend TestCatalogCreateSerializer.
 */
export interface TestCatalogCreateData {
  code: string;
  name: string;
  short_name: string;
  loinc_code?: string;
  category: TestCategory;
  specimen_type: SpecimenType;
  requires_fasting?: boolean;
  special_instructions?: string;
  turnaround_hours?: number;
  requires_clinical_signoff?: boolean;
  available_in_house?: boolean;
  external_lab_partner?: string;
  cost?: number;
  sha_claimable?: boolean;
  result_type: ResultType;
  result_unit?: string;
  normal_range_male?: string;
  normal_range_female?: string;
  normal_range_child?: string;
  result_options?: string[];
  is_panel?: boolean;
  is_active?: boolean;
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

export type ResultType = 'NUMERIC' | 'TEXT' | 'OPTIONS' | 'PANEL';

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

export type InterfaceType = 'HL7_MLLP' | 'ASTM' | 'FHIR' | 'MANUAL';
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

// =========== Phase L5 — TAT Monitoring & SLA ===========

export interface TATSLATarget {
  id: number;
  test: number;
  test_code: string;
  test_name: string;
  priority: LabPriority;
  target_order_to_collect_minutes: number | null;
  target_collect_to_receive_minutes: number | null;
  target_receive_to_result_minutes: number | null;
  target_result_to_verify_minutes: number | null;
  target_total_minutes: number;
  breach_escalation_email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TATSLATargetCreateData {
  test: number;
  priority: LabPriority;
  target_order_to_collect_minutes?: number | null;
  target_collect_to_receive_minutes?: number | null;
  target_receive_to_result_minutes?: number | null;
  target_result_to_verify_minutes?: number | null;
  target_total_minutes: number;
  breach_escalation_email?: string;
  is_active?: boolean;
}

export interface TATSnapshot {
  id: number;
  order_number: string;
  test_code: string | null;
  test_name: string | null;
  priority: LabPriority;
  ordered_at: string;
  collected_at: string | null;
  received_at: string | null;
  resulted_at: string | null;
  verified_at: string | null;
  released_at: string | null;
  tat_order_to_collect: number | null;
  tat_collect_to_receive: number | null;
  tat_receive_to_result: number | null;
  tat_result_to_verify: number | null;
  tat_total: number | null;
  is_breach: boolean;
  breach_minutes: number | null;
  sla_target_minutes: number | null;
  resulted_by_name: string | null;
  verified_by_name: string | null;
  snapshot_created_at: string;
}

export interface SLAComplianceReport {
  start: string;
  end: string;
  summary: {
    total_orders: number;
    breaches: number;
    compliance_rate: number;
    avg_total_minutes: number | null;
    p50_minutes: number | null;
    p90_minutes: number | null;
    p95_minutes: number | null;
  };
  segments: {
    avg_order_to_collect: number | null;
    avg_collect_to_receive: number | null;
    avg_receive_to_result: number | null;
    avg_result_to_verify: number | null;
  };
  by_priority: Array<{
    priority: LabPriority;
    count: number;
    breaches: number;
    compliance_rate: number;
    avg_minutes: number;
    p50_minutes: number | null;
    p90_minutes: number | null;
    p95_minutes: number | null;
  }>;
  by_test: Array<{
    test_code: string;
    test_name: string;
    count: number;
    breaches: number;
    compliance_rate: number;
    avg_minutes: number | null;
  }>;
}

export interface TATTrendReport {
  start: string;
  end: string;
  daily: Array<{
    date: string;
    count: number;
    breaches: number;
    avg_minutes: number | null;
    p90_minutes: number | null;
  }>;
}

export interface ActiveBreachesReport {
  count: number;
  breaches: Array<{
    order_number: string;
    order_id: number;
    test_code: string;
    test_name: string;
    priority: LabPriority;
    status: string;
    elapsed_minutes: number;
    target_minutes: number;
    breach_minutes: number;
    patient_name: string | null;
    ordered_at: string;
  }>;
}

export interface TechnicianEfficiencyReport {
  start: string;
  end: string;
  technicians: Array<{
    technician_id: number;
    technician_name: string;
    results_entered: number;
    avg_entry_time_minutes: number | null;
    breaches: number;
    breach_rate: number;
  }>;
}

export interface WorkloadKPIReport {
  start: string;
  end: string;
  totals: {
    tests_entered: number;
    tests_verified: number;
    specimens_collected: number;
    specimens_rejected: number;
    rejection_rate: number;
    critical_results: number;
    critical_compliance_rate: number;
    avg_entry_time_minutes: number | null;
    avg_verify_time_minutes: number | null;
  };
  by_technician: Array<{
    technician_id: number;
    technician_name: string;
    tests_entered: number;
    tests_verified: number;
    specimens_rejected: number;
    avg_entry_time_minutes: number | null;
  }>;
  by_day: Array<{
    date: string;
    tests_entered: number;
    tests_verified: number;
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
  validation_summary?: ValidationSummary | null;
  /** Patient gender from related order — for AI lab interpretation */
  patient_gender?: 'M' | 'F' | 'O' | null;
  /** Patient date of birth from related order — for AI lab interpretation */
  patient_date_of_birth?: string | null;
  /** Encounter ID from related order — for AI lab interpretation */
  encounter_id?: number | null;
  /** Patient full name from related order — for search/selection UX */
  patient_name?: string | null;
  /** Order number from related lab order — for search/selection UX */
  order_number?: string | null;
}

export interface ValidationSummary {
  requires_clinical_signoff: boolean;
  technical_validation: {
    status: string;
    validated_by: string | null;
    validated_at: string | null;
    comment: string;
  };
  clinical_validation: {
    status: string;
    validated_by: string | null;
    validated_at: string | null;
    comment: string;
  } | null;
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
  | 'RELEASED';

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
  admission?: number;
  order_type?: OrderType;
  external_lab?: string;
  priority?: LabPriority;
  clinical_notes?: string;
  bill_patient?: boolean;
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

// ============================================================================
// Microbiology (Phase L4)
// ============================================================================

export type GramStain = 'POSITIVE' | 'NEGATIVE' | 'VARIABLE' | 'NA';
export type OrganismType = 'BACTERIA' | 'FUNGUS' | 'PARASITE' | 'VIRUS' | 'MYCOBACTERIA' | 'OTHER';
export type CultureStatus = 'INOCULATED' | 'INCUBATING' | 'READING' | 'PRELIMINARY' | 'FINAL' | 'NO_GROWTH' | 'CANCELLED';
export type SensitivityInterpretation = 'S' | 'I' | 'R';
export type SensitivityTestMethod = 'DISK' | 'MIC_BROTH' | 'MIC_ETEST' | 'VITEK' | 'OTHER';
export type BreakpointStandard = 'CLSI' | 'EUCAST' | 'OTHER';
export type IdentificationMethod = 'MANUAL' | 'VITEK' | 'MALDI_TOF' | 'MOLECULAR' | 'API' | 'OTHER';
export type IncubationAtmosphere = 'AEROBIC' | 'ANAEROBIC' | 'CO2' | 'MICROAEROPHILIC';

export interface Organism {
  id: number;
  code: string;
  name: string;
  genus: string;
  species: string;
  gram_stain: GramStain;
  organism_type: OrganismType;
  is_active: boolean;
}

export interface Antibiotic {
  id: number;
  code: string;
  name: string;
  antibiotic_class: string;
  disk_content: string;
  is_active: boolean;
}

export interface AntibioticSensitivity {
  id: number;
  culture: number;
  antibiotic: number;
  antibiotic_name: string;
  antibiotic_code: string;
  zone_diameter: number | null;
  mic: number | null;
  interpretation: SensitivityInterpretation;
  interpretation_display: string;
  test_method: SensitivityTestMethod;
  test_method_display: string;
  breakpoint_standard: BreakpointStandard;
  tested_by: number | null;
  tested_by_name: string | null;
  tested_at: string | null;
  notes: string;
  created_at: string;
}

export interface CultureResult {
  id: number;
  lab_result: number;
  specimen: number | null;
  status: CultureStatus;
  status_display: string;
  culture_medium: string;
  incubation_temperature: number | null;
  incubation_atmosphere: string;
  incubation_hours: number | null;
  inoculated_by: number | null;
  inoculated_by_name: string | null;
  inoculated_at: string | null;
  read_by: number | null;
  read_by_name: string | null;
  read_at: string | null;
  colony_count: string;
  morphology: string;
  gram_stain_result: string;
  microscopy_notes: string;
  organism: number | null;
  organism_name: string | null;
  organism_code: string | null;
  identification_method: string;
  preliminary_report: string;
  preliminary_reported_at: string | null;
  final_report: string;
  final_reported_at: string | null;
  clinical_notes: string;
  is_significant: boolean;
  is_complete: boolean;
  days_incubating: number | null;
  sensitivities: AntibioticSensitivity[];
  lab_order_number: string | null;
  patient_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Antibiogram {
  id: number;
  year: number;
  organism: number;
  organism_name: string;
  organism_code: string;
  antibiotic: number;
  antibiotic_name: string;
  antibiotic_code: string;
  total_isolates: number;
  sensitive_count: number;
  intermediate_count: number;
  resistant_count: number;
  percent_sensitive: number | null;
  percent_resistant: number | null;
  generated_at: string;
}

export interface CultureResultCreateData {
  lab_result: number;
  specimen?: number | null;
  culture_medium?: string;
  incubation_temperature?: number | null;
  incubation_atmosphere?: IncubationAtmosphere;
  incubation_hours?: number | null;
}

export interface CultureIncubateData {
  temperature?: number;
  atmosphere?: IncubationAtmosphere;
  hours?: number;
}

export interface CultureReadingData {
  colony_count?: string;
  morphology?: string;
  gram_stain_result?: string;
  microscopy_notes?: string;
  organism?: number | null;
  identification_method?: IdentificationMethod;
  is_significant?: boolean;
}

export interface CultureReportData {
  report_text?: string;
  clinical_notes?: string;
}

export interface SensitivityCreateData {
  antibiotic: number;
  zone_diameter?: number | null;
  mic?: number | null;
  interpretation: SensitivityInterpretation;
  test_method?: SensitivityTestMethod;
  breakpoint_standard?: BreakpointStandard;
  notes?: string;
}

// =========== Phase L3 — Analyzer Interfacing ===========

export type ChannelProtocol = 'ASTM' | 'HL7' | 'SERIAL' | 'TCP';
export type ChannelDirection = 'BIDIRECTIONAL' | 'HOST_TO_INSTRUMENT' | 'INSTRUMENT_TO_HOST';
export type ChannelConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'IDLE';
export type AnalyzerMessageDirection = 'INBOUND' | 'OUTBOUND';
export type AnalyzerMessageType = 'RESULT' | 'ORDER_DOWNLOAD' | 'QUERY' | 'ACK' | 'STATUS' | 'OTHER';
export type AnalyzerMessageStatus = 'RECEIVED' | 'PARSED' | 'APPLIED' | 'FAILED' | 'PENDING' | 'SENT' | 'TIMEOUT';

export interface InstrumentChannel {
  id: number;
  instrument: number;
  instrument_code: string;
  instrument_name: string;
  name: string;
  protocol: ChannelProtocol;
  protocol_display: string;
  direction: ChannelDirection;
  direction_display: string;
  host: string;
  port: number;
  encoding: string;
  config: Record<string, unknown>;
  field_mapping: Record<string, unknown>;
  is_active: boolean;
  connection_status: ChannelConnectionStatus;
  connection_status_display: string;
  last_activity_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface InstrumentChannelCreateData {
  instrument: number;
  name: string;
  protocol: ChannelProtocol;
  direction?: ChannelDirection;
  host: string;
  port: number;
  encoding?: string;
  config?: Record<string, unknown>;
  field_mapping?: Record<string, unknown>;
  is_active?: boolean;
}

export interface AnalyzerMessage {
  id: number;
  channel: number;
  channel_name: string;
  specimen: number | null;
  specimen_barcode: string | null;
  lab_order_item: number | null;
  direction: AnalyzerMessageDirection;
  direction_display: string;
  message_type: AnalyzerMessageType;
  message_type_display: string;
  status: AnalyzerMessageStatus;
  status_display: string;
  raw_data: string;
  parsed_data: Record<string, unknown> | null;
  sample_id: string;
  test_code: string;
  result_value: string;
  result_unit: string;
  error_message: string;
  timestamp: string;
  processed_at: string | null;
}

export interface AnalyzerDriverTemplate {
  id: number;
  name: string;
  manufacturer: string;
  model_pattern: string;
  category: string;
  protocol: ChannelProtocol;
  protocol_display: string;
  default_config: Record<string, unknown>;
  default_field_mapping: Record<string, unknown>;
  description: string;
  created_at: string;
}

export interface ChannelHealthStatus {
  channel_id: number;
  instrument_code: string;
  channel_name: string;
  connection_status: ChannelConnectionStatus;
  last_activity_at: string | null;
  last_error: string;
  messages_last_hour: number;
  errors_last_hour: number;
  is_healthy: boolean;
}

export interface AnalyzerDashboard {
  total_channels: number;
  active_channels: number;
  connected_channels: number;
  error_channels: number;
  messages_today: number;
  results_applied_today: number;
  failed_messages_today: number;
  channel_statuses: ChannelHealthStatus[];
}

// =============================================================================
// Lab Settings Types
// =============================================================================

export interface SpecimenRejectionReason {
  id: number;
  code: string;
  name: string;
  description: string;
  requires_recollection: boolean;
  is_active: boolean;
  display_order: number;
}

export type CommentTemplateCategory = 'GENERAL' | 'CRITICAL' | 'FOLLOW_UP' | 'METHODOLOGY' | 'QUALITY';

export interface ResultCommentTemplate {
  id: number;
  code: string;
  name: string;
  text: string;
  category: CommentTemplateCategory;
  category_display: string;
  applicable_tests: number[];
  is_active: boolean;
  display_order: number;
}

export interface ReferralLab {
  id: number;
  code: string;
  name: string;
  address: string;
  contact_person: string;
  phone: string;
  email: string;
  website: string;
  tests_offered: string;
  default_tat_days: number;
  courier_schedule: string;
  notes: string;
  is_active: boolean;
}

export type LabelSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface SampleLabelTemplate {
  id: number;
  name: string;
  label_size: LabelSize;
  label_size_display: string;
  include_barcode: boolean;
  include_patient_name: boolean;
  include_mrn: boolean;
  include_dob: boolean;
  include_collection_date: boolean;
  include_test_name: boolean;
  include_specimen_type: boolean;
  include_priority: boolean;
  copies_per_specimen: number;
  is_default: boolean;
  is_active: boolean;
}

export type BarcodeFormat = 'CODE128' | 'CODE39' | 'QR';

export interface LabBarcodeConfig {
  id: number;
  prefix: string;
  sequence_length: number;
  include_date: boolean;
  date_format: string;
  separator: string;
  barcode_format: BarcodeFormat;
  barcode_format_display: string;
  current_sequence: number;
  sample_barcode: string;
}

export interface LabWorkflowSettings {
  id: number;
  auto_release_normal_results: boolean;
  require_double_verification_critical: boolean;
  auto_print_on_verify: boolean;
  auto_print_labels_on_collect: boolean;
  notify_clinician_on_critical: boolean;
  notify_clinician_on_complete: boolean;
  require_specimen_receipt: boolean;
  specimen_rejection_requires_supervisor: boolean;
  tat_warning_threshold_percent: number;
  allow_duplicate_orders: boolean;
  require_clinical_notes: boolean;
}

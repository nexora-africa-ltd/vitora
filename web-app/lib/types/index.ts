/**
 * Type definitions for Vitora HMIS
 */

// Re-export clinical template types
export type {
  ClinicalTemplate,
  ClinicalTemplateListParams,
  ClinicalTemplateCreateData,
  TemplateType,
  TemplateField,
  TemplateSection,
  TemplateContent,
  TemplateData,
} from './clinical-template';

// Re-export enhanced encounter types
export type {
  Encounter as EnhancedEncounter,
  Diagnosis,
  TreatmentPlan,
  Medication,
  VitalSign,
  EncounterListParams,
  // Consultation Queue types (aligned with backend)
  EncounterType,
  TriageRequirement,
  TriageStatus,
  // Note: TriageCategory is exported from triage.ts instead to avoid duplicate
  ConsultationStatus,
  TriageBypassReason,
  ConsultationQueueItem,
  ConsultationQueueFilters,
  ConsultationQueueStats,
} from './encounter';

// Re-export display constants (aligned with backend)
export {
  ENCOUNTER_TYPE_DISPLAY,
  ENCOUNTER_TYPE_TRIAGE_MAP,
  TRIAGE_STATUS_DISPLAY,
  TRIAGE_BYPASS_REASON_DISPLAY,
  CONSULTATION_STATUS_DISPLAY,
} from './encounter';

// Re-export patient types
export type {
  Patient as EnhancedPatient,
  PatientCreateData,
  PatientUpdateData,
  EmergencyContact,
  PatientListParams,
  PatientEncounter,
} from './patient';

// Re-export timeline types
export type {
  TimelineEvent,
  TimelineEventType,
  TimelineFilters,
  PatientHistoryParams,
  PatientHistoryResponse,
} from './timeline';

// Re-export dashboard types
export type {
  KPIMetric,
  ChartDataPoint,
  PatientVolumeData,
  RevenueData,
  DepartmentStats,
  RecentActivity,
  DashboardMetrics,
  DateRangeFilter,
} from './dashboard';

// Re-export billing types
export type {
  // Service types
  ServiceCategory,
  Service,
  ServiceCreateData,
  ServiceUpdateData,
  ServiceListParams,
  // Invoice types
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceCreateData,
  InvoiceUpdateData,
  InvoiceItemCreateData,
  InvoiceListParams,
  ApplyDiscountData,
  // Payment types
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentCreateData,
  PaymentListParams,
  // M-Pesa types
  MpesaSTKPushRequest,
  MpesaSTKPushResponse,
  MpesaQueryResponse,
  MpesaCallbackData,
  // Receipt types
  Receipt,
  // Credit Note types
  CreditNote,
  CreditNoteReason,
  CreditNoteStatus,
  CreditNoteCreateData,
  CreditNoteApprovalData,
  CreditNoteRefundData,
  CreditNoteListParams,
  // Report types
  DailyCollectionReport,
  RevenueSummary,
  OutstandingBalance,
  ServiceUtilization,
  PaymentMethodAnalysis,
  // Paginated responses
  PaginatedInvoices,
  PaginatedPayments,
  PaginatedServices,
  PaginatedServiceCategories,
  PaginatedCreditNotes,
  PaginatedReceipts,
} from './billing';

// Re-export triage types
export type {
  // KETA Categories
  TriageCategory,
  TriageCategoryConfig,
  // Clinical assessment
  AVPUStatus,
  AVPUConfig,
  MobilityStatus,
  ArrivalMode,
  ChiefComplaintCategory,
  AssignedArea,
  // Queue
  QueueStatus,
  // Vitals & Alerts
  VitalType,
  TriageVitalThreshold,
  AlertSeverity,
  TriageAlert,
  // Main models
  TriageAssessment,
  TriageAssessmentCreateData,
  TriageQueueEntry,
  TriageQueueListParams,
  // Reports
  WaitTimeStats,
  VolumeByCategory,
  VolumeByArea,
  LWBSStats,
  TriageReportSummary,
  // Paginated
  PaginatedTriageAssessments,
  PaginatedTriageQueue,
} from './triage';

export {
  TRIAGE_CATEGORY_CONFIG,
  TRIAGE_CATEGORY_PRIORITY,
  AVPU_CONFIG,
  MOBILITY_CONFIG,
  ARRIVAL_MODE_CONFIG,
  CHIEF_COMPLAINT_CONFIG,
  ASSIGNED_AREA_CONFIG,
  QUEUE_STATUS_CONFIG,
} from './triage';

// User types
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  permissions: string[];
  role?: string;  // User role (ADMIN, NURSE, DOCTOR, BILLING_CLERK, etc.)
}

// Patient types
export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  national_id?: string;
  phone_number?: string;
  county: number;
  county_name?: string;
  sub_county: number;
  sub_county_name?: string;
  ward?: number;
  ward_name?: string;
  is_sensitive: boolean;
  consent_given: boolean;
  consent_date?: string;
  referral_source: 'self' | 'clinic' | 'other_facility';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  registered_by: number;
  created_at: string;
  updated_at: string;
}

// Encounter types
export interface Encounter {
  id: number;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  encounter_type: string;
  encounter_date: string;
  chief_complaint: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  past_surgeries?: string;
  family_history?: string;
  social_history?: string;
  created_at: string;
  updated_at: string;
}

// Kenya Location types
export interface County {
  id: number;
  code: number;
  name: string;
}

export interface SubCounty {
  id: number;
  county: number;
  name: string;
}

export interface Ward {
  id: number;
  sub_county: number;
  name: string;
}

// Pagination
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// API Error
export interface APIError {
  detail?: string;
  [key: string]: string | string[] | undefined;
}

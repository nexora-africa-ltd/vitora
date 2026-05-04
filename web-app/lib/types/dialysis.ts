/**
 * Dialysis module type definitions
 */

// Status enums
export type AccessType = 'AVF' | 'AVG' | 'CVC_TEMPORARY' | 'CVC_TUNNELED' | 'PD_CATHETER';
export type AccessStatus = 'ACTIVE' | 'MATURING' | 'FAILED' | 'REMOVED' | 'INFECTED';
export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABORTED';
export type OrderStatus = 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'CANCELLED';
export type DialysisType = 'HEMODIALYSIS' | 'PERITONEAL' | 'CRRT';
export type OrderFrequency = 'TWICE_WEEKLY' | 'THRICE_WEEKLY' | 'DAILY' | 'AS_NEEDED';

// Vascular Access
export interface VascularAccess {
  id: number;
  patient: number;
  access_type: AccessType;
  status: AccessStatus;
  site: string;
  placed_date: string;
  placed_by: number | null;
  last_assessment_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface VascularAccessCreateData {
  patient: number;
  access_type: AccessType;
  site: string;
  placed_date: string;
  placed_by?: number | null;
  notes?: string;
}

// Dialysis Order
export interface DialysisOrder {
  id: number;
  patient: number;
  ordered_by: number;
  vascular_access: number | null;
  dialysis_type: DialysisType;
  frequency: OrderFrequency;
  status: OrderStatus;
  target_duration_minutes: number;
  blood_flow_rate: number;
  dialysate_flow_rate: number;
  target_uf_volume: number | null;
  dialysate_composition: string;
  anticoagulation: string;
  dry_weight_kg: number | null;
  clinical_indication: string;
  notes: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DialysisOrderCreateData {
  patient: number;
  vascular_access?: number | null;
  dialysis_type: DialysisType;
  frequency: OrderFrequency;
  target_duration_minutes?: number;
  blood_flow_rate?: number;
  dialysate_flow_rate?: number;
  target_uf_volume?: number | null;
  dialysate_composition?: string;
  anticoagulation?: string;
  dry_weight_kg?: number | null;
  clinical_indication: string;
  notes?: string;
  start_date: string;
}

// Dialysis Session
export interface DialysisSession {
  id: number;
  session_number: string;
  patient: number;
  order: number | null;
  encounter: number | null;
  vascular_access: number | null;
  dialysis_type: DialysisType;
  status: SessionStatus;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  actual_duration_minutes: number | null;
  blood_flow_rate: number | null;
  dialysate_flow_rate: number | null;
  uf_goal_ml: number | null;
  uf_achieved_ml: number | null;
  pre_weight_kg: number | null;
  pre_bp: string;
  pre_pulse: number | null;
  pre_temperature: number | null;
  post_weight_kg: number | null;
  post_bp: string;
  post_pulse: number | null;
  complications: string;
  machine_number: string;
  performed_by: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DialysisSessionCreateData {
  patient: number;
  order?: number | null;
  vascular_access?: number | null;
  dialysis_type: DialysisType;
  scheduled_date: string;
  blood_flow_rate?: number | null;
  dialysate_flow_rate?: number | null;
  uf_goal_ml?: number | null;
  pre_weight_kg?: number | null;
  pre_bp?: string;
  pre_pulse?: number | null;
  pre_temperature?: number | null;
  machine_number?: string;
  notes?: string;
}

// List params
export interface VascularAccessListParams {
  page?: number;
  page_size?: number;
  search?: string;
  patient?: number;
  status?: string;
  access_type?: string;
  ordering?: string;
}

export interface DialysisOrderListParams {
  page?: number;
  page_size?: number;
  search?: string;
  patient?: number;
  status?: string;
  dialysis_type?: string;
  ordering?: string;
}

export interface DialysisSessionListParams {
  page?: number;
  page_size?: number;
  search?: string;
  patient?: number;
  status?: string;
  dialysis_type?: string;
  scheduled_date?: string;
  scheduled_date_gte?: string;
  scheduled_date_lte?: string;
  ordering?: string;
}

// Display mappings
export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  ABORTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  SUSPENDED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const ACCESS_STATUS_COLORS: Record<AccessStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  MATURING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REMOVED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  INFECTED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export const ACCESS_TYPE_LABELS: Record<AccessType, string> = {
  AVF: 'AV Fistula',
  AVG: 'AV Graft',
  CVC_TEMPORARY: 'Temporary CVC',
  CVC_TUNNELED: 'Tunneled CVC',
  PD_CATHETER: 'PD Catheter',
};

export const DIALYSIS_TYPE_LABELS: Record<DialysisType, string> = {
  HEMODIALYSIS: 'Hemodialysis',
  PERITONEAL: 'Peritoneal',
  CRRT: 'CRRT',
};

export const FREQUENCY_LABELS: Record<OrderFrequency, string> = {
  TWICE_WEEKLY: 'Twice Weekly',
  THRICE_WEEKLY: 'Thrice Weekly',
  DAILY: 'Daily',
  AS_NEEDED: 'As Needed',
};

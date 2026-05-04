/**
 * Blood Bank type definitions
 */

// Status enums
export type UnitStatus = 'COLLECTED' | 'TESTING' | 'AVAILABLE' | 'RESERVED' | 'ISSUED' | 'EXPIRED' | 'DISCARDED' | 'QUARANTINED';
export type RequestStatus = 'PENDING' | 'CROSSMATCH_PENDING' | 'READY' | 'ISSUED' | 'TRANSFUSED' | 'CANCELLED' | 'RETURNED';
export type RequestUrgency = 'ROUTINE' | 'URGENT' | 'EMERGENCY';
export type CrossMatchResult = 'COMPATIBLE' | 'INCOMPATIBLE' | 'PENDING';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type BloodComponent = 'WHOLE_BLOOD' | 'PACKED_RBC' | 'PLATELETS' | 'FFP' | 'CRYOPRECIPITATE';

// Blood Donor
export interface BloodDonor {
  id: number;
  donor_number: string;
  patient: number | null;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F';
  blood_group: BloodGroup;
  phone_number: string;
  national_id: string;
  is_active: boolean;
  last_donation_date: string | null;
  total_donations: number;
  eligible_to_donate: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BloodDonorListItem {
  id: number;
  donor_number: string;
  first_name: string;
  last_name: string;
  blood_group: BloodGroup;
  gender: 'M' | 'F';
  is_active: boolean;
  last_donation_date: string | null;
  total_donations: number;
  eligible_to_donate: boolean;
  created_at: string;
}

export interface BloodDonorCreateData {
  patient?: number | null;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F';
  blood_group: BloodGroup;
  phone_number?: string;
  national_id?: string;
  notes?: string;
}

// Blood Unit
export interface BloodUnit {
  id: number;
  unit_number: string;
  donor: number;
  donor_name: string;
  blood_group: BloodGroup;
  component: BloodComponent;
  status: UnitStatus;
  collection_date: string;
  expiry_date: string;
  volume_ml: number;
  storage_location: string;
  hiv_screened: boolean;
  hbv_screened: boolean;
  hcv_screened: boolean;
  syphilis_screened: boolean;
  malaria_screened: boolean;
  all_screens_negative: boolean;
  is_expired: boolean;
  is_available: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BloodUnitListItem {
  id: number;
  unit_number: string;
  donor: number;
  donor_name: string;
  blood_group: BloodGroup;
  component: BloodComponent;
  status: UnitStatus;
  collection_date: string;
  expiry_date: string;
  volume_ml: number;
  is_expired: boolean;
  is_available: boolean;
  all_screens_negative: boolean;
  created_at: string;
}

export interface BloodUnitCreateData {
  donor: number;
  blood_group: BloodGroup;
  component: BloodComponent;
  collection_date?: string;
  expiry_date: string;
  volume_ml?: number;
  storage_location?: string;
  notes?: string;
}

// Blood Request
export interface BloodRequest {
  id: number;
  request_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  requested_by: number;
  requested_by_name: string;
  blood_group: BloodGroup;
  component: BloodComponent;
  units_requested: number;
  urgency: RequestUrgency;
  status: RequestStatus;
  clinical_indication: string;
  patient_hemoglobin: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BloodRequestListItem {
  id: number;
  request_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  blood_group: BloodGroup;
  component: BloodComponent;
  units_requested: number;
  urgency: RequestUrgency;
  status: RequestStatus;
  requested_by_name: string;
  created_at: string;
}

export interface BloodRequestCreateData {
  patient: number;
  encounter?: number | null;
  blood_group: BloodGroup;
  component: BloodComponent;
  units_requested: number;
  urgency: RequestUrgency;
  clinical_indication: string;
  patient_hemoglobin?: number | null;
  notes?: string;
}

// Cross-Match
export interface CrossMatch {
  id: number;
  blood_request: number;
  blood_unit: number;
  unit_number: string;
  performed_by: number;
  performed_by_name: string;
  result: CrossMatchResult;
  performed_at: string;
  method: string;
  notes: string;
}

export interface CrossMatchCreateData {
  blood_request: number;
  blood_unit: number;
  method?: string;
  notes?: string;
}

// Blood Issue
export interface BloodIssue {
  id: number;
  blood_request: number;
  blood_unit: number;
  unit_number: string;
  crossmatch: number | null;
  issued_by: number;
  issued_by_name: string;
  issued_at: string;
  transfusion_started_at: string | null;
  transfusion_completed_at: string | null;
  transfusion_reaction: string;
  reaction_details: string;
  vital_signs_pre: Record<string, unknown>;
  vital_signs_post: Record<string, unknown>;
  notes: string;
}

export interface BloodIssueCreateData {
  blood_request: number;
  blood_unit: number;
  crossmatch?: number | null;
  notes?: string;
}

// List params
export interface BloodDonorListParams {
  page?: number;
  page_size?: number;
  search?: string;
  blood_group?: string;
  is_active?: boolean;
  ordering?: string;
}

export interface BloodUnitListParams {
  page?: number;
  page_size?: number;
  search?: string;
  blood_group?: string;
  component?: string;
  status?: string;
  ordering?: string;
}

export interface BloodRequestListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  urgency?: string;
  blood_group?: string;
  patient?: number;
  ordering?: string;
}

// Status display mappings
export const UNIT_STATUS_COLORS: Record<UnitStatus, string> = {
  COLLECTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  TESTING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  AVAILABLE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  RESERVED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ISSUED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  EXPIRED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  DISCARDED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  QUARANTINED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  CROSSMATCH_PENDING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  READY: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ISSUED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  TRANSFUSED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  RETURNED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export const URGENCY_COLORS: Record<RequestUrgency, string> = {
  ROUTINE: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  URGENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const CROSSMATCH_COLORS: Record<CrossMatchResult, string> = {
  COMPATIBLE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  INCOMPATIBLE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

export const COMPONENT_LABELS: Record<BloodComponent, string> = {
  WHOLE_BLOOD: 'Whole Blood',
  PACKED_RBC: 'Packed RBC',
  PLATELETS: 'Platelets',
  FFP: 'Fresh Frozen Plasma',
  CRYOPRECIPITATE: 'Cryoprecipitate',
};

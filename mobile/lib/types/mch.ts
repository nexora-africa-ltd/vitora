import type { PaginatedResponse } from './common';

export type MCHRegistrationStatus =
  | 'ACTIVE'
  | 'DELIVERED'
  | 'POSTNATAL'
  | 'COMPLETED'
  | 'TRANSFERRED_OUT'
  | 'LOST_TO_FOLLOW_UP'
  | 'DECEASED';

export interface BirthPlan {
  preferred_facility?: string | null;
  preferred_birth_companion?: string | null;
  emergency_transport_plan?: string | null;
  blood_donor_plan?: string | null;
  notes?: string | null;
}

export interface RiskFactor {
  code: string;
  label: string;
  severity: 'warning' | 'danger';
}

export interface MCHRegistrationListItem {
  id: number;
  mch_number: string;
  mother: number;
  mother_name: string;
  mother_mrn: string;
  registration_date: string;
  status: MCHRegistrationStatus;
  is_high_risk: boolean;
  linda_jamii_beneficiary: boolean;
  edd: string | null;
  gestation_display: string;
  trimester: number | null;
  gravida: number | null;
  parity: number | null;
  current_gestation_weeks: number | null;
  anc_visit_count: number;
  created_at: string;
}

export interface MCHRegistration extends MCHRegistrationListItem {
  anc_enrollment: number | null;
  baby: number | null;
  baby_name: string | null;
  baby_mrn: string | null;
  baby_count: number;
  is_multiple_pregnancy: boolean;
  all_babies_info: Array<{
    id: number;
    name: string;
    mrn: string;
    gender: string;
    date_of_birth: string | null;
  }>;
  inter_pregnancy_interval_days: number | null;
  risk_factors: string;
  sha_claimable: boolean;
  gbv_related: boolean;
  is_sensitive: boolean;
  registered_by: number | null;
  registered_by_name: string | null;
  notes: string;
  completed_at: string | null;
  pnc_visit_count: number;
  updated_at: string;
}

export interface MCHRegistrationListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: MCHRegistrationStatus;
  is_high_risk?: boolean;
  mother?: number;
  ordering?: string;
}

export type FetalPresentation = 'CEPHALIC' | 'BREECH' | 'TRANSVERSE' | 'OBLIQUE' | 'UNKNOWN' | '';
export type FetalLie = 'LONGITUDINAL' | 'TRANSVERSE' | 'OBLIQUE' | '';
export type UrineResult = 'NEGATIVE' | 'TRACE' | '1+' | '2+' | '3+' | '4+' | '';

export interface ANCVisitListItem {
  id: number;
  registration: number;
  clinic_visit?: number | null;
  visit_number: number;
  visit_date: string;
  gestation_weeks: number | null;
  weight: number | null;
  blood_pressure: string;
  fetal_heart_rate: number | null;
  next_visit_date: string | null;
  alerts: string[];
  created_at: string;
}

export interface ANCVisit extends ANCVisitListItem {
  registration_mch_number: string;
  encounter: number | null;
  clinic_visit: number | null;
  fundal_height: number | null;
  presentation: FetalPresentation;
  lie: FetalLie;
  fetal_movements: boolean | null;
  urine_protein: UrineResult;
  urine_glucose: UrineResult;
  hb_level: number | null;
  blood_sugar: number | null;
  hiv_test_done: boolean;
  syphilis_test_done: boolean;
  iron_folate_given: boolean;
  calcium_given: boolean;
  deworming_given: boolean;
  tetanus_toxoid_dose: number | null;
  notes: string;
  conducted_by: number | null;
  conducted_by_name: string | null;
  is_fetal_heart_rate_normal: boolean;
  updated_at: string;
}

export interface ANCVisitCreateData {
  registration: number;
  encounter?: number;
  clinic_visit?: number;
  visit_number?: number;
  visit_date?: string;
  weight?: number;
  blood_pressure?: string;
  fundal_height?: number;
  fetal_heart_rate?: number;
  presentation?: FetalPresentation;
  lie?: FetalLie;
  fetal_movements?: boolean;
  urine_protein?: UrineResult;
  urine_glucose?: UrineResult;
  hb_level?: number;
  blood_sugar?: number;
  hiv_test_done?: boolean;
  syphilis_test_done?: boolean;
  iron_folate_given?: boolean;
  calcium_given?: boolean;
  deworming_given?: boolean;
  tetanus_toxoid_dose?: number;
  next_visit_date?: string;
  notes?: string;
  conducted_by?: number;
}

export type VaccineRoute = 'IM' | 'SC' | 'ORAL' | 'ID' | '';

export interface Vaccine {
  id: number;
  code: string;
  name: string;
  description: string;
  disease_target: string;
  standard_age_days: number;
  route: VaccineRoute;
  dose_number: number;
  series_name: string;
  is_active: boolean;
}

export type ImmunizationStatus = 'SCHEDULED' | 'ADMINISTERED' | 'MISSED' | 'CONTRAINDICATED' | 'DEFERRED';
export type InjectionSite = 'LEFT_THIGH' | 'RIGHT_THIGH' | 'LEFT_ARM' | 'RIGHT_ARM' | 'ORAL' | '';

export interface ImmunizationRecordListItem {
  id: number;
  patient: number;
  vaccine: number;
  vaccine_code: string;
  vaccine_name: string;
  scheduled_date: string;
  administered_date: string | null;
  status: ImmunizationStatus;
  dose_number: number;
  is_overdue: boolean;
  created_at: string;
}

export interface ImmunizationRecord extends ImmunizationRecordListItem {
  patient_name: string;
  patient_mrn: string;
  batch_number: string;
  lot_number: string;
  expiry_date: string | null;
  site: InjectionSite;
  administered_by: number | null;
  administered_by_name: string | null;
  next_dose_date: string | null;
  days_overdue: number | null;
  notes: string;
  updated_at: string;
}

export interface ImmunizationRecordListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  vaccine?: number;
  status?: ImmunizationStatus;
  ordering?: string;
}

export interface AdministerVaccineData {
  administered_date?: string;
  batch_number?: string;
  lot_number?: string;
  expiry_date?: string;
  site?: InjectionSite;
  notes?: string;
}

export type PaginatedMCHRegistrationResponse = PaginatedResponse<MCHRegistrationListItem>;
export type PaginatedANCVisitResponse = PaginatedResponse<ANCVisitListItem>;
export type PaginatedImmunizationResponse = PaginatedResponse<ImmunizationRecordListItem>;
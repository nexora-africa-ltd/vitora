import type { PaginatedResponse } from './common';

export interface Clinic {
  id: number;
  name: string;
  clinic_type: string;
  clinic_type_display?: string | null;
  code: string;
  location?: string | null;
  status: string;
  is_sensitive: boolean;
  is_open_today: boolean;
  is_scheduled_today: boolean;
}

export interface ClinicListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  clinic_type?: string;
}

export interface ClinicVisit {
  id: number;
  session: number;
  patient?: {
    id: number;
    mrn: string;
    full_name?: string | null;
  } | null;
  patient_name?: string | null;
  patient_mrn?: string | null;
  clinic_name: string;
  queue_number: number;
  status: string;
  status_display?: string | null;
  priority?: string | null;
  priority_display?: string | null;
  visit_type?: string | null;
  visit_type_display?: string | null;
  source?: string | null;
  source_display?: string | null;
  source_module?: string | null;
  source_record_id?: number | null;
  registered_at?: string | null;
  called_at?: string | null;
  consultation_started_at?: string | null;
  completed_at?: string | null;
  encounter?: number | null;
  triage_assessment?: number | null;
  referred_from?: number | null;
  referred_to_clinic?: number | null;
  referral_reason?: string | null;
  assigned_clinician?: number | null;
  assigned_clinician_name?: string | null;
  registered_by?: number | null;
  registered_by_name?: string | null;
  chief_complaint?: string | null;
  notes?: string | null;
  wait_time_minutes?: number | null;
  created_at: string;
  updated_at: string;
}

export type PaginatedClinics = PaginatedResponse<Clinic>;
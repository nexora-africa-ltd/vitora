import { PaginatedResponse } from '@/lib/types';

export type InpatientWardType =
  | 'MEDICAL'
  | 'SURGICAL'
  | 'PEDIATRIC'
  | 'MATERNITY'
  | 'ICU'
  | 'ISOLATION';

export interface InpatientWard {
  id: number;
  name: string;
  code: string;
  ward_type: InpatientWardType;
  ward_type_display?: string;
  floor?: string;
  capacity: number;
  description?: string;
  is_active: boolean;
  daily_rate: string;
  available_beds?: number;
  occupancy_rate?: number;
}

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

export interface Bed {
  id: number;
  ward: number;
  ward_name?: string;
  bed_number: string;
  status: BedStatus;
  status_display?: string;
  notes?: string;
}

export type AdmissionRecommendationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type AdmissionRecommendationUrgency = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export interface AdmissionRecommendation {
  id: number;
  encounter: number;
  recommended_by: number;
  recommended_by_username?: string;
  reason: string;
  provisional_diagnosis: string;
  provisional_diagnosis_text: string;
  urgency: AdmissionRecommendationUrgency;
  preferred_ward_type: InpatientWardType;
  status: AdmissionRecommendationStatus;
  expires_at: string;
  is_expired?: boolean;
}

export type AdmissionStatus =
  | 'ACTIVE'
  | 'DISCHARGED'
  | 'TRANSFERRED_OUT'
  | 'DECEASED'
  | 'ABSCONDED';

export type AdmissionPayerType = 'CASH' | 'SHA' | 'CORPORATE';

export interface Admission {
  id: number;
  admission_number: string;
  patient: number;
  patient_name?: string;
  opd_encounter?: number | null;
  ipd_encounter?: number;
  recommendation?: number | null;
  admission_date: string;
  admitting_diagnosis?: string;
  admitting_diagnosis_text?: string;
  admitting_officer?: number;
  attending_doctor?: number | null;
  ward: number;
  ward_name?: string;
  bed: number;
  bed_number?: string;
  admission_status: AdmissionStatus;
  payer_type: AdmissionPayerType;
  length_of_stay?: number;
}

export interface AdmissionRecommendationListParams {
  status?: string;
  urgency?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface AdmissionListParams {
  admission_status?: string;
  patient?: number;
  ward?: number;
  payer_type?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface BedListParams {
  ward?: number;
  status?: BedStatus;
}

export type AdmissionRecommendationListResponse = PaginatedResponse<AdmissionRecommendation>;
export type AdmissionListResponse = PaginatedResponse<Admission>;
